// Supabase Edge Function: `estimate` (F-02 — server-side AI estimation proxy).
//
// Phase 2: requires an authenticated owner session, estimates a text meal via
// Claude Opus 4.8, records an immutable EstimationRun under the caller's RLS,
// and returns `{ runId, estimate }`. The image input variant is reserved for
// S-03/S-04. The AI key never leaves the server.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { estimateFromText } from './estimate.ts';
import { recordEstimationRun } from './record-run.ts';
import { sourceForInput } from './source.ts';
import type { EstimateRequest } from './types.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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

  if (input.kind === 'image') return json({ error: 'image_input_unsupported' }, 400);
  if (input.kind !== 'text' || typeof input.text !== 'string' || input.text.trim() === '') {
    return json({ error: 'invalid_input' }, 400);
  }

  let result;
  try {
    result = await estimateFromText(input.text);
  } catch (err) {
    console.error('[estimate] estimation failed:', err);
    return json({ error: 'estimation_failed' }, 502);
  }

  // An AI call was made and billed, so record it regardless of recognition —
  // a run is never lost. Failure to record is a hard error, not a partial success.
  let runId: string;
  try {
    runId = await recordEstimationRun(supabase, ownerId, {
      source: sourceForInput(input),
      input_summary: input.text.slice(0, 200),
      raw_result: result.raw,
    });
  } catch (err) {
    console.error('[estimate] record run failed:', err);
    return json({ error: 'record_failed' }, 500);
  }

  return json({ runId, estimate: result.estimate });
});
