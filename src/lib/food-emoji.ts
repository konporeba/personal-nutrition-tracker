// The food → emoji mapping (S-05), in one dependency-free place so the smoke
// script asserts against the same code the UI runs. It lives in `src/lib` (not
// beside a component) because the esbuild-bundled Node smoke cannot load
// `react-native` — the `sum-calories.ts` / `derive-targets.ts` pattern.
//
// Emoji are the icon set (owner's decision): zero assets, zero dependencies,
// inherently bundled, zero per-entry runtime cost (a synchronous table scan). The
// tradeoff is that emoji are multicolor and render slightly differently per
// platform, so FR-051's "single style/palette" is an accepted compromise.
//
// Matching is deliberately NOT exact-key: `food_category` (the model's coarse
// label) and a raw meal `name` are both free text, so a single ordered table
// serves both. Single-word tokens match whole words (lightly singularized, so
// "eggs" matches "egg"); multi-word tokens match as a substring of the whole.
// Whole-word matching is what stops "tea" matching "steak" or "ham" matching
// "hamburger".

/** The fallback when nothing in the table matches. */
export const GENERIC_FOOD = '🍽️';

type FoodRule = { emoji: string; match: string[] };

/**
 * Ordered category → emoji table. **Order is load-bearing**: the first matching
 * rule wins, so more specific phrases must precede the generic staples they could
 * be shadowed by (see the plan's "Critical Implementation Details"). Prepared
 * dishes and phrases come first, then proteins, produce, dairy, sweets, drinks,
 * and the coarsest catch-alls last.
 */
const FOOD_TABLE: FoodRule[] = [
  // Prepared / composite dishes (specific — must precede their ingredients).
  { emoji: '🍕', match: ['pizza'] },
  { emoji: '🍔', match: ['burger', 'hamburger', 'cheeseburger'] },
  { emoji: '🍟', match: ['fries', 'french fries'] },
  { emoji: '🌭', match: ['hot dog', 'hotdog'] },
  { emoji: '🥪', match: ['sandwich', 'panini', 'sub', 'blt'] },
  { emoji: '🌮', match: ['taco', 'tacos'] },
  { emoji: '🌯', match: ['burrito', 'wrap', 'quesadilla'] },
  { emoji: '🍣', match: ['sushi', 'sashimi', 'maki', 'nigiri'] },
  { emoji: '🍜', match: ['ramen', 'noodle', 'noodles', 'pho', 'udon'] },
  { emoji: '🍝', match: ['pasta', 'spaghetti', 'penne', 'macaroni', 'lasagna', 'lasagne'] },
  { emoji: '🥟', match: ['dumpling', 'dumplings', 'gyoza', 'potsticker', 'wonton'] },
  { emoji: '🍲', match: ['soup', 'stew', 'chili', 'curry', 'broth', 'chowder'] },

  // Grains & breakfast.
  { emoji: '🍚', match: ['rice', 'risotto'] },
  { emoji: '🥐', match: ['croissant'] },
  { emoji: '🥞', match: ['pancake', 'pancakes', 'waffle', 'waffles'] },
  { emoji: '🥣', match: ['cereal', 'oatmeal', 'oats', 'porridge', 'granola', 'muesli'] },
  { emoji: '🥨', match: ['pretzel'] },
  { emoji: '🍞', match: ['bread', 'toast', 'bagel', 'baguette', 'bun'] },

  // Proteins.
  { emoji: '🥚', match: ['egg', 'eggs', 'omelet', 'omelette', 'scrambled', 'frittata'] },
  { emoji: '🥓', match: ['bacon'] },
  { emoji: '🍗', match: ['chicken', 'poultry', 'turkey', 'drumstick', 'wing', 'wings'] },
  { emoji: '🥩', match: ['steak', 'beef', 'ribeye', 'sirloin', 'meat'] },
  { emoji: '🍖', match: ['pork', 'ribs', 'ham', 'lamb', 'roast'] },
  { emoji: '🦐', match: ['shrimp', 'prawn', 'prawns'] },
  { emoji: '🐟', match: ['fish', 'salmon', 'tuna', 'cod', 'tilapia', 'seafood'] },
  { emoji: '🫘', match: ['bean', 'beans', 'lentil', 'lentils', 'chickpea', 'hummus', 'tofu'] },
  { emoji: '🥜', match: ['nut', 'nuts', 'peanut', 'peanuts', 'almond', 'almonds', 'cashew'] },

  // Vegetables.
  { emoji: '🥗', match: ['salad', 'greens', 'lettuce'] },
  { emoji: '🥦', match: ['broccoli'] },
  { emoji: '🥕', match: ['carrot', 'carrots'] },
  { emoji: '🌽', match: ['corn'] },
  { emoji: '🥔', match: ['potato', 'potatoes', 'mashed'] },
  { emoji: '🍅', match: ['tomato', 'tomatoes'] },
  { emoji: '🥑', match: ['avocado', 'guacamole'] },
  { emoji: '🫑', match: ['pepper', 'peppers', 'capsicum'] },
  { emoji: '🍄', match: ['mushroom', 'mushrooms'] },

  // Fruit-containing dishes — matched before the bare fruit block so "apple pie"
  // is a pie, "orange juice" a juice, "strawberry cake" a cake. Placed AFTER the
  // protein/veg blocks, so "fish cake" stays 🐟 and "carrot cake" stays 🥕; bare
  // "apple"/"orange" still fall through to the fruit rules below.
  { emoji: '🥧', match: ['pie', 'tart'] },
  { emoji: '🍰', match: ['cake', 'cheesecake'] },
  { emoji: '🧃', match: ['juice', 'smoothie'] },

  // Fruit.
  { emoji: '🍎', match: ['apple', 'apples'] },
  { emoji: '🍌', match: ['banana', 'bananas'] },
  { emoji: '🍊', match: ['orange', 'oranges', 'mandarin', 'clementine'] },
  { emoji: '🍇', match: ['grape', 'grapes'] },
  { emoji: '🍓', match: ['strawberry', 'strawberries', 'berry', 'berries', 'raspberry', 'blueberry'] },
  { emoji: '🍉', match: ['watermelon', 'melon'] },
  { emoji: '🍑', match: ['peach', 'peaches'] },

  // Dairy.
  { emoji: '🧀', match: ['cheese', 'cheddar', 'parmesan', 'mozzarella', 'feta'] },
  { emoji: '🥛', match: ['milk', 'yogurt', 'yoghurt'] },

  // Sweets — "ice cream" precedes anything that could catch "cream".
  { emoji: '🍨', match: ['ice cream', 'icecream', 'gelato'] },
  { emoji: '🧁', match: ['cupcake', 'muffin'] },
  { emoji: '🍪', match: ['cookie', 'cookies', 'biscuit'] },
  { emoji: '🍫', match: ['chocolate', 'brownie'] },
  { emoji: '🍩', match: ['donut', 'doughnut'] },
  { emoji: '🍿', match: ['popcorn'] },
  { emoji: '🍬', match: ['candy', 'sweets'] },
  { emoji: '🍯', match: ['honey'] },

  // Drinks — specific before the generic "drink"/"beverage".
  { emoji: '☕', match: ['coffee', 'espresso', 'latte', 'cappuccino'] },
  { emoji: '🍵', match: ['tea', 'matcha'] },
  { emoji: '🍺', match: ['beer', 'ale', 'lager'] },
  { emoji: '🍷', match: ['wine'] },
  { emoji: '🍸', match: ['cocktail', 'martini'] },
  { emoji: '💧', match: ['water'] },
  { emoji: '🥤', match: ['soda', 'cola', 'lemonade', 'soft drink', 'beverage', 'drink'] },
];

/** Lowercase, collapse any non-alphanumeric run to a single space, trim. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Light singularization so "eggs" matches "egg". Guards short words ("as"→"as"). */
function singular(word: string): string {
  return word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word;
}

/**
 * Resolve a food label or meal name to an emoji. Normalizes, then scans the
 * ordered table: multi-word tokens match as a substring of the whole string,
 * single-word tokens match a whole (singularized) word. First match wins; no
 * match — including null/empty input — returns `GENERIC_FOOD`. Total.
 */
export function emojiForFood(text: string | null | undefined): string {
  if (!text) return GENERIC_FOOD;
  const norm = normalize(text);
  if (norm === '') return GENERIC_FOOD;

  const words = new Set(norm.split(' ').map(singular));
  for (const rule of FOOD_TABLE) {
    for (const token of rule.match) {
      if (token.includes(' ')) {
        if (norm.includes(token)) return rule.emoji;
      } else if (words.has(singular(token))) {
        return rule.emoji;
      }
    }
  }
  return GENERIC_FOOD;
}

/**
 * The entry's icon: the stored `food_category` wins when it maps to a specific
 * emoji, otherwise a best-effort mapping from the `name`, otherwise generic. This
 * is the seam the Today row and the smoke both call, so what the smoke asserts is
 * exactly what the day view renders.
 */
export function iconForEntry(entry: { food_category: string | null; name: string }): string {
  const byCategory = emojiForFood(entry.food_category);
  if (byCategory !== GENERIC_FOOD) return byCategory;
  return emojiForFood(entry.name);
}
