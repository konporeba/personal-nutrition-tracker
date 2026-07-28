// Supabase Edge Function: `estimate` (F-02 — server-side AI estimation proxy).
//
// Requires an authenticated owner session, estimates a meal from text, a
// photographed label (S-03), or a photographed plate (S-04) via Claude Opus
// 4.8, records an immutable EstimationRun under the caller's RLS, and
// returns `{ runId, estimate }`. The AI key never leaves the server.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { estimateFromImage, estimateFromText } from './estimate.ts';
import type { EstimateResult } from './estimate.ts';
import { recordEstimationRun } from './record-run.ts';
import { sourceForInput } from './source.ts';
import type { EstimateRequest } from './types.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// The client always downscales before sending (~1500px long edge, q0.7 JPEG),
// but this is a public authenticated boundary — cap base64 length defensively
// rather than trusting the caller. ~6MB base64 is a generous multiple of what
// a downscaled label photo actually produces.
const MAX_IMAGE_DATA_LENGTH = 6 * 1024 * 1024;

// Anthropic's accepted image media types (messages API image content block).
const ACCEPTED_IMAGE_MEDIA_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // Require an owner session. The function also runs behind platform-level
  // verify_jwt, but that accepts the public anon key; getUser() is what proves
  // the caller is an authenticated owner (not anon), and scopes DB writes to
  // their uid via RLS.
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'unauthorized' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  const ownerId = userData?.user?.id;
  if (userErr || !ownerId) return json({ error: 'unauthorized' }, 401);

  let payload: EstimateRequest;
  try {
    payload = (await req.json()) as EstimateRequest;
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const input = payload?.input;
  if (!input || typeof input !== 'object') return json({ error: 'invalid_input' }, 400);

  let result: EstimateResult;
  let inputSummary: string;

  if (input.kind === 'image') {
    if (input.imageKind !== 'label' && input.imageKind !== 'plate') {
      return json({ error: 'invalid_input' }, 400);
    }
    if (typeof input.data !== 'string' || input.data.trim() === '') {
      return json({ error: 'invalid_input' }, 400);
    }
    if (input.data.length > MAX_IMAGE_DATA_LENGTH) {
      return json({ error: 'invalid_input' }, 400);
    }
    if (typeof input.mediaType !== 'string' || !ACCEPTED_IMAGE_MEDIA_TYPES.has(input.mediaType)) {
      return json({ error: 'invalid_input' }, 400);
    }

    try {
      result = await estimateFromImage(input.mediaType, input.data, input.imageKind);
    } catch (err) {
      console.error('[estimate] estimation failed:', err);
      return json({ error: 'estimation_failed' }, 502);
    }

    // No source text for an image run; fall back to a fixed marker when the
    // model didn't produce a usable name (e.g. an unrecognized label or plate).
    const name = result.estimate.name.trim();
    inputSummary =
      name !== '' ? name.slice(0, 200) : input.imageKind === 'label' ? 'label scan' : 'plate photo';
  } else if (input.kind === 'text') {
    if (typeof input.text !== 'string' || input.text.trim() === '') {
      return json({ error: 'invalid_input' }, 400);
    }

    try {
      result = await estimateFromText(input.text);
    } catch (err) {
      console.error('[estimate] estimation failed:', err);
      return json({ error: 'estimation_failed' }, 502);
    }

    inputSummary = input.text.slice(0, 200);
  } else {
    return json({ error: 'invalid_input' }, 400);
  }

  // An AI call was made and billed, so record it regardless of recognition —
  // a run is never lost. Failure to record is a hard error, not a partial success.
  let runId: string;
  try {
    runId = await recordEstimationRun(supabase, ownerId, {
      source: sourceForInput(input),
      input_summary: inputSummary,
      raw_result: result.raw,
    });
  } catch (err) {
    console.error('[estimate] record run failed:', err);
    return json({ error: 'record_failed' }, 500);
  }

  return json({ runId, estimate: result.estimate });
});
