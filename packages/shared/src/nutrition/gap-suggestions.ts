import type { DietPattern } from '../profile.js'
import type { TargetKey } from './targets.js'

/**
 * Static food suggestions per gap (nutrients.md section 5). Filtered by diet pattern,
 * allergies and dislikes before they are shown or handed to the weekly review, so a vegan
 * is never told to eat sardines and Finn never sees liver.
 */

export type SuggestionKey = TargetKey | 'energy_under' | 'energy_over' | 'logging'

export interface Suggestion {
  text: string
  /** Diet patterns this suggestion is wrong for. */
  exclude?: readonly DietPattern[]
  /** Diet patterns this suggestion is only for. */
  only?: readonly DietPattern[]
  /** Allergen words (matched against the person's allergies, case-insensitive). */
  allergens?: readonly string[]
}

const MEAT: readonly DietPattern[] = ['vegan', 'vegetarian', 'pescatarian']
const FISH: readonly DietPattern[] = ['vegan', 'vegetarian']
const ANIMAL: readonly DietPattern[] = ['vegan']

export const GAP_SUGGESTIONS: Readonly<Partial<Record<SuggestionKey, readonly Suggestion[]>>> = {
  energy_under: [
    { text: 'An extra serving of rice, potatoes or pasta with your main meals' },
    { text: 'Olive oil or avocado on what you already eat' },
    { text: 'A smoothie with oats, a banana and milk or plant milk' },
    {
      text: 'A handful of nuts or nut butter on toast between meals',
      allergens: ['nuts', 'peanuts'],
    },
  ],
  energy_over: [
    { text: 'Plate protein and vegetables first, then add carbs to fill the gap' },
    { text: 'Measure oils, sauces and dressings with a tablespoon' },
    { text: 'Water or a sugar-free drink instead of juice, soft drinks and alcohol' },
    { text: 'Swap fried sides for a big salad or steamed vegetables' },
  ],
  protein_g: [
    { text: 'Greek yoghurt or cottage cheese as a snack', exclude: ANIMAL, allergens: ['dairy'] },
    { text: 'Eggs at breakfast', exclude: ANIMAL, allergens: ['eggs'] },
    { text: 'Chicken, turkey or lean beef with lunch and dinner', exclude: MEAT },
    { text: 'Tinned tuna, salmon or sardines', exclude: FISH, allergens: ['fish'] },
    { text: 'Tofu, tempeh or edamame', allergens: ['soy'] },
    { text: 'Lentils, chickpeas or beans in stews and salads' },
    { text: 'A protein shake, whey or plant-based' },
  ],
  sodium_mg: [
    {
      text: 'Cook from scratch more often; ready meals, sauces and cured meats carry most of the salt',
    },
    { text: 'Rinse tinned beans and vegetables' },
    { text: 'Fruit or unsalted popcorn instead of crisps and salted snacks' },
    { text: 'Taste before salting; lean on herbs, lemon and spices' },
  ],
  saturated_fat_g: [
    { text: 'Olive or rapeseed oil in place of butter and coconut oil' },
    { text: 'Leaner cuts and skinless poultry, grilled rather than fried', exclude: MEAT },
    { text: 'Fewer pastries, biscuits and cheese-heavy meals' },
    { text: 'Oily fish twice a week in place of red meat', exclude: FISH, allergens: ['fish'] },
  ],
  added_sugar_g: [
    { text: 'Water, sparkling water or tea instead of sugary drinks' },
    { text: 'Fruit instead of sweets or biscuits for a snack' },
    {
      text: 'Plain yoghurt with berries instead of flavoured yoghurt',
      exclude: ANIMAL,
      allergens: ['dairy'],
    },
    { text: 'Plain plant yoghurt with berries instead of flavoured', only: ['vegan'] },
    { text: 'Check breakfast cereals and sauces; many hide a lot of sugar' },
  ],
  alcohol_std_drinks: [
    { text: 'Keep at least three alcohol-free days a week' },
    { text: 'Alternate each drink with a glass of water' },
    { text: 'Smaller serves: a bottle over a pint, a single over a double' },
  ],
  fiber_g: [
    { text: 'Oats or a wholegrain cereal at breakfast' },
    { text: 'Lentils, chickpeas or beans in one meal a day' },
    { text: 'Wholegrain bread, brown rice and wholewheat pasta', allergens: ['gluten'] },
    { text: 'Chia or flax seeds on yoghurt or porridge' },
    { text: 'Raspberries, pears and apples with the skin on' },
  ],
  water_ml: [
    { text: 'A glass of water with every meal' },
    { text: 'Carry a bottle and top it up whenever you refill your coffee' },
    { text: 'Tap +250 ml each time you finish a glass so it counts' },
    { text: 'Herbal tea and sparkling water count too' },
  ],
  vegetables: [
    { text: 'Frozen mixed vegetables into whatever you are cooking' },
    { text: 'A big salad with lunch' },
    { text: 'Grated carrot or courgette in pasta sauces and curries' },
    { text: 'Half the plate vegetables at dinner' },
  ],
  fruit: [
    { text: 'A banana or an apple with breakfast' },
    { text: 'Berries on yoghurt, porridge or cereal' },
    { text: 'Fruit as the default snack' },
  ],
  whole_grains: [
    { text: 'Wholegrain versions of bread, rice and pasta' },
    { text: 'Oats at breakfast' },
    { text: 'Quinoa or brown rice with dinner' },
  ],
  protein_foods: [
    { text: 'Eggs at breakfast', exclude: ANIMAL, allergens: ['eggs'] },
    { text: 'Tofu or tempeh at breakfast or lunch', allergens: ['soy'] },
    { text: 'A palm-sized portion of meat, fish, tofu or legumes at lunch and dinner' },
    { text: 'Lentils, beans and chickpeas in soups and salads' },
  ],
  dairy_or_alt: [
    { text: 'A glass of milk', exclude: ANIMAL, allergens: ['dairy'] },
    { text: 'Fortified plant milk in porridge and coffee' },
    { text: 'Yoghurt as a snack or dessert', exclude: ANIMAL, allergens: ['dairy'] },
    { text: 'A matchbox-sized piece of cheese', exclude: ANIMAL, allergens: ['dairy'] },
    { text: 'Calcium-set tofu', allergens: ['soy'] },
  ],
  potassium_mg: [
    { text: 'Bananas, oranges and dried apricots' },
    { text: 'Potatoes and sweet potatoes with the skin' },
    { text: 'Beans, lentils and spinach' },
    { text: 'Milk and yoghurt', exclude: ANIMAL, allergens: ['dairy'] },
  ],
  calcium_mg: [
    { text: 'Milk, yoghurt and cheese', exclude: ANIMAL, allergens: ['dairy'] },
    { text: 'Fortified soy or oat milk' },
    { text: 'Tinned sardines or salmon with the bones', exclude: FISH, allergens: ['fish'] },
    { text: 'Calcium-set tofu', allergens: ['soy'] },
    { text: 'Kale, broccoli and tahini', allergens: ['sesame'] },
  ],
  iron_mg: [
    { text: 'Lean red meat a few times a week', exclude: MEAT },
    { text: 'Lentils and chickpeas with peppers or a squeeze of lemon for the vitamin C' },
    { text: 'Tofu with a vitamin C source', allergens: ['soy'] },
    { text: 'Spinach, kale and pumpkin seeds' },
    { text: 'Fortified breakfast cereal' },
    { text: 'Tinned sardines', exclude: FISH, allergens: ['fish'] },
  ],
  magnesium_mg: [
    { text: 'Pumpkin and sunflower seeds' },
    { text: 'Almonds and cashews', allergens: ['nuts'] },
    { text: 'Spinach and dark leafy greens' },
    { text: 'Wholegrains, beans and a square of dark chocolate' },
  ],
  zinc_mg: [
    { text: 'Beef, lamb or pork', exclude: MEAT },
    { text: 'Oysters, crab or prawns', exclude: FISH, allergens: ['shellfish'] },
    { text: 'Pumpkin seeds and chickpeas' },
    { text: 'Cashews', allergens: ['nuts'] },
    { text: 'Eggs and dairy', exclude: ANIMAL, allergens: ['eggs', 'dairy'] },
  ],
  vitamin_a_ug: [
    { text: 'Carrots, sweet potato and butternut squash' },
    { text: 'Spinach, kale and red peppers' },
    { text: 'Eggs and dairy', exclude: ANIMAL, allergens: ['eggs', 'dairy'] },
    { text: 'Liver once in a while', exclude: MEAT },
  ],
  vitamin_c_mg: [
    { text: 'Oranges, kiwis and strawberries' },
    { text: 'Red peppers, broccoli and tomatoes' },
    { text: 'A squeeze of lemon on salads' },
  ],
  vitamin_d_ug: [
    { text: 'Oily fish such as salmon, mackerel or sardines', exclude: FISH, allergens: ['fish'] },
    { text: 'Eggs', exclude: ANIMAL, allergens: ['eggs'] },
    { text: 'Fortified milk, plant milk and cereals' },
    { text: 'A vitamin D supplement in the darker months (10 mcg is the UK advice)' },
  ],
  vitamin_b12_ug: [
    { text: 'Fortified nutritional yeast', only: ['vegan', 'vegetarian'] },
    { text: 'Fortified plant milk and cereals', only: ['vegan', 'vegetarian'] },
    { text: 'A B12 supplement', only: ['vegan'] },
    { text: 'Eggs, milk and yoghurt', exclude: ANIMAL, allergens: ['eggs', 'dairy'] },
    { text: 'Fish, meat and eggs', exclude: MEAT, allergens: ['fish', 'eggs'] },
    { text: 'Salmon, sardines or tuna', exclude: FISH, allergens: ['fish'] },
  ],
  folate_ug: [
    { text: 'Spinach, rocket and asparagus' },
    { text: 'Lentils, chickpeas and black beans' },
    { text: 'Oranges and avocado' },
    { text: 'Fortified breakfast cereal' },
  ],
  logging: [
    { text: 'Log meals as you eat them rather than at the end of the day' },
    { text: 'Save your regular meals to My foods for one-tap logging' },
    { text: 'A rough estimate beats a blank day' },
  ],
}

export const MAX_SUGGESTIONS = 3

export interface SuggestionProfile {
  dietPattern: DietPattern
  allergies: readonly string[]
  dislikes: readonly string[]
}

function normalise(value: string): string {
  return value.trim().toLowerCase()
}

/** Up to three suggestions that fit the person. Order is the map's order (best first). */
export function suggestionsFor(key: SuggestionKey, profile: SuggestionProfile): string[] {
  const allergies = profile.allergies.map(normalise).filter((a) => a.length > 0)
  const dislikes = profile.dislikes.map(normalise).filter((d) => d.length > 0)
  const out: string[] = []
  for (const suggestion of GAP_SUGGESTIONS[key] ?? []) {
    if (suggestion.exclude?.includes(profile.dietPattern)) continue
    if (suggestion.only && !suggestion.only.includes(profile.dietPattern)) continue
    const allergenHit = (suggestion.allergens ?? []).some((allergen) =>
      allergies.some((a) => a.includes(allergen) || allergen.includes(a)),
    )
    if (allergenHit) continue
    const text = normalise(suggestion.text)
    if (dislikes.some((dislike) => text.includes(dislike))) continue
    out.push(suggestion.text)
    if (out.length >= MAX_SUGGESTIONS) break
  }
  return out
}
