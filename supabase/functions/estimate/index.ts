// Supabase Edge Function: `estimate` (F-02 — server-side AI estimation proxy).
//
// Phase 1: estimation core. Parses the discriminated-union input, dispatches on
// `kind` (text implemented; image reserved for S-03/S-04), calls the model, and
// returns a validated Estimate. Owner-JWT auth and EstimationRun recording are
// added in Phase 2, so this phase returns `{ estimate }` without a `runId`.

import { estimateFromText } from './estimate.ts';
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

  try {
    const estimate = await estimateFromText(input.text);
    return json({ estimate });
  } catch (err) {
    console.error('[estimate] estimation failed:', err);
    return json({ error: 'estimation_failed' }, 502);
  }
});
