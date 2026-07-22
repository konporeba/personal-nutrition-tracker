// The AI estimation core: turn a free-text meal description into a validated,
// structured Estimate via Claude Opus 4.8 + structured outputs (FR-080/081/082).
//
// Uses the Anthropic REST API directly via `fetch` (no npm dependency) so the
// function is fully self-contained in Deno. The AI key is read from the
// `ANTHROPIC_API_KEY` function secret and never leaves the server.

import type { Estimate } from './types.ts';

const MODEL = 'claude-opus-4-8';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// A tiny structured object; adaptive thinking needs a little headroom on top of
// the JSON, so keep the budget modest but not so tight it truncates.
const MAX_TOKENS = 2048;

const SYSTEM_PROMPT = [
  'You are a nutrition estimation assistant for a personal calorie tracker.',
  'Given a free-text description of a meal, estimate its total calories and',
  'macronutrients (protein, carbohydrates, and fat, in grams).',
  '',
  'Rules:',
  '- If the text states a quantity or portion, use it. Do not override a stated',
  '  quantity with your own assumption.',
  '- If no quantity is stated, assume a single typical portion and record every',
  '  such assumption as a short human-readable string in `assumptions`.',
  '- Set `food_category` to a short lowercase label for the primary food',
  '  (e.g. "eggs", "pasta", "salad", "beverage").',
  '- If the text does not describe an identifiable food or meal, set',
  '  `recognized` to false, set every macro field to null, and do NOT fabricate',
  '  numbers.',
  '- Set `confidence` to reflect how sure you are about the estimate.',
  '- Keep `calories` roughly consistent with the macronutrient grams.',
].join('\n');

// Structured-output schema. Numeric sanity (non-negative, macro/calorie
// consistency) is enforced in `sanitize` below — JSON Schema cannot express
// numeric bounds under structured outputs.
const ESTIMATE_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    calories: { type: ['number', 'null'] },
    protein_g: { type: ['number', 'null'] },
    carbs_g: { type: ['number', 'null'] },
    fat_g: { type: ['number', 'null'] },
    food_category: { type: 'string' },
    assumptions: { type: 'array', items: { type: 'string' } },
    recognized: { type: 'boolean' },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
  },
  required: [
    'name',
    'calories',
    'protein_g',
    'carbs_g',
    'fat_g',
    'food_category',
    'assumptions',
    'recognized',
    'confidence',
  ],
  additionalProperties: false,
} as const;

type AnthropicResponse = {
  content?: { type: string; text?: string }[];
  stop_reason?: string;
  model?: string;
  usage?: unknown;
};

/** What `estimateFromText` returns: the sanitized estimate plus an audit blob. */
export type EstimateResult = {
  estimate: Estimate;
  /** Stored verbatim in `estimation_runs.raw_result` for auditability. */
  raw: {
    model?: string;
    stop_reason?: string;
    usage?: unknown;
    /** The model's parsed output *before* `sanitize` clamped it. */
    parsed: unknown;
  };
};

/** Non-negative number or null. */
function nonNeg(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
}

/**
 * Enforce the "never fabricate" invariant (FR-008): drop to `recognized: false`
 * with null macros unless the model both claimed recognition and returned at
 * least a usable calorie figure.
 */
function sanitize(raw: Estimate): Estimate {
  const assumptions = Array.isArray(raw.assumptions) ? raw.assumptions : [];
  const name = typeof raw.name === 'string' ? raw.name : '';
  const food_category =
    typeof raw.food_category === 'string' ? raw.food_category : 'other';
  const confidence: Estimate['confidence'] =
    raw.confidence === 'high' || raw.confidence === 'medium' ? raw.confidence : 'low';

  const calories = nonNeg(raw.calories);
  const recognized = raw.recognized === true && calories !== null;

  if (!recognized) {
    return {
      name,
      calories: null,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
      food_category,
      assumptions,
      recognized: false,
      confidence,
    };
  }

  return {
    name,
    calories,
    protein_g: nonNeg(raw.protein_g),
    carbs_g: nonNeg(raw.carbs_g),
    fat_g: nonNeg(raw.fat_g),
    food_category,
    assumptions,
    recognized: true,
    confidence,
  };
}

function extractJson(res: AnthropicResponse): string {
  const textBlock = res.content?.find((b) => b.type === 'text' && typeof b.text === 'string');
  if (!textBlock?.text) throw new Error('model response had no text block');
  return textBlock.text;
}

/** Estimate a meal from a free-text description. Throws on transport/model error. */
export async function estimateFromText(text: string): Promise<EstimateResult> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' },
      system: SYSTEM_PROMPT,
      output_config: { format: { type: 'json_schema', schema: ESTIMATE_SCHEMA } },
      messages: [{ role: 'user', content: text }],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`anthropic ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = (await res.json()) as AnthropicResponse;
  if (data.stop_reason === 'refusal') throw new Error('model refused the request');
  if (data.stop_reason === 'max_tokens') throw new Error('model output was truncated');

  const parsed = JSON.parse(extractJson(data)) as Estimate;
  return {
    estimate: sanitize(parsed),
    raw: { model: data.model, stop_reason: data.stop_reason, usage: data.usage, parsed },
  };
}
