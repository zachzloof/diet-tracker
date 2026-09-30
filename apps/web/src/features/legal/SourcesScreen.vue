<script setup lang="ts">
import LegalLayout from './LegalLayout.vue'
import { LEGAL_UPDATED } from './legal'

/**
 * Where the target formulas and reference intakes come from. The stores ask a health app
 * to cite its sources (Apple 1.4.1); the list mirrors the nutrition-engine references.
 */
const SOURCES: { topic: string; detail: string; cite: string; href: string | null }[] = [
  {
    topic: 'Resting energy',
    detail: 'The Mifflin-St Jeor equation, from your sex, age, height and weight.',
    cite: 'Mifflin MD, St Jeor ST, et al. A new predictive equation for resting energy expenditure in healthy individuals. Am J Clin Nutr. 1990;51(2):241-247.',
    href: 'https://pubmed.ncbi.nlm.nih.gov/2305711/',
  },
  {
    topic: 'Resting energy when you give a body fat percentage',
    detail: 'The Katch-McArdle equation, from your lean body mass.',
    cite: 'McArdle WD, Katch FI, Katch VL. Exercise Physiology: Nutrition, Energy, and Human Performance.',
    href: null,
  },
  {
    topic: 'Daily energy',
    detail:
      'Resting energy multiplied by a physical activity level between 1.2 (sedentary) and 1.9 (very active).',
    cite: 'FAO/WHO/UNU. Human energy requirements: report of a joint expert consultation. 2004.',
    href: 'https://www.fao.org/3/y5686e/y5686e00.htm',
  },
  {
    topic: 'Pace of weight change',
    detail:
      'About 7,700 kcal per kilogram of body weight, an approximation. Deficits are capped at 25% of daily energy and never go below a safe floor.',
    cite: 'Wishnofsky M. Caloric equivalents of gained or lost weight. Am J Clin Nutr. 1958;6(5):542-546.',
    href: null,
  },
  {
    topic: 'Protein',
    detail: '1.4 to 2.4 g per kg of body weight, depending on your goal and training.',
    cite: 'Jäger R, et al. International Society of Sports Nutrition position stand: protein and exercise. J Int Soc Sports Nutr. 2017;14:20.',
    href: 'https://doi.org/10.1186/s12970-017-0177-8',
  },
  {
    topic: 'Fat, fibre, saturated fat and sodium',
    detail:
      'Fat at 20 to 35% of energy (more on a low-carb pattern), fibre at 14 g per 1,000 kcal, saturated fat under 10% of energy, sodium under 2,300 mg a day.',
    cite: 'U.S. Department of Agriculture and U.S. Department of Health and Human Services. Dietary Guidelines for Americans, 2020-2025.',
    href: 'https://www.dietaryguidelines.gov/',
  },
  {
    topic: 'Added sugar',
    detail: 'Under 10% of energy.',
    cite: 'World Health Organization. Guideline: sugars intake for adults and children. 2015.',
    href: 'https://www.who.int/publications/i/item/9789241549028',
  },
  {
    topic: 'Vitamins and minerals',
    detail:
      'The recommended dietary allowance for your sex and age, or the adequate intake where there is no allowance.',
    cite: 'U.S. National Institutes of Health, Office of Dietary Supplements. Nutrient Recommendations and Databases (Dietary Reference Intakes).',
    href: 'https://ods.od.nih.gov/HealthInformation/nutrientrecommendations.aspx',
  },
  {
    topic: 'Food group serves',
    detail: 'Serve sizes and daily serves for vegetables, fruit, grains, protein foods and dairy.',
    cite: 'National Health and Medical Research Council. Australian Dietary Guidelines. 2013.',
    href: 'https://www.eatforhealth.gov.au/guidelines',
  },
]
</script>

<template>
  <LegalLayout title="Where the numbers come from" :updated="LEGAL_UPDATED">
    <p>
      Your targets are worked out by fixed formulas from what you told the app, never by AI. These
      are the published sources behind them. They describe healthy adults in general; they are not a
      prescription for you, and the app is not medical advice.
    </p>

    <section v-for="source in SOURCES" :key="source.topic">
      <h2>{{ source.topic }}</h2>
      <p>{{ source.detail }}</p>
      <p class="text-sm text-fg-muted">
        {{ source.cite }}
        <a v-if="source.href" :href="source.href" target="_blank" rel="noopener noreferrer">
          Open the source
        </a>
      </p>
    </section>

    <h2>Food estimates</h2>
    <p>
      When you describe a meal, an AI model estimates its nutrients and shows its assumptions and
      how confident it is. Estimates can be wrong; you can edit any number before or after logging.
    </p>
  </LegalLayout>
</template>
