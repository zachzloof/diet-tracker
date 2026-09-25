import {
  BODY_FAT_PCT,
  HEIGHT_CM,
  MIN_AGE,
  WEIGHT_KG,
  ageOn,
  detectTimeZone,
  localDay,
} from '@diet-tracker/shared'
import type { Component } from 'vue'
import ActivityStep from './steps/ActivityStep.vue'
import AllergiesStep from './steps/AllergiesStep.vue'
import BodyFatStep from './steps/BodyFatStep.vue'
import DietStep from './steps/DietStep.vue'
import DislikesStep from './steps/DislikesStep.vue'
import DobStep from './steps/DobStep.vue'
import GoalStep from './steps/GoalStep.vue'
import HealthStep from './steps/HealthStep.vue'
import HeightStep from './steps/HeightStep.vue'
import PaceStep from './steps/PaceStep.vue'
import ReviewStep from './steps/ReviewStep.vue'
import SexStep from './steps/SexStep.vue'
import TrainingStep from './steps/TrainingStep.vue'
import UnitsStep from './steps/UnitsStep.vue'
import WeightStep from './steps/WeightStep.vue'
import type { OnboardingDraft } from './useOnboardingDraft'

export interface StepDef {
  id: string
  title: string
  subtitle?: string
  component: Component
  /** Whether "Continue" is enabled. */
  ready: (draft: OnboardingDraft) => boolean
  /** Inline message shown under the fields when the current answer is not acceptable. */
  problem?: (draft: OnboardingDraft) => string | null
  /** Skipped entirely for some answers (pace for maintenance). */
  skip?: (draft: OnboardingDraft) => boolean
  /** The step can be passed with no answer; the button reads "Skip for now". */
  optional?: boolean
  /** Fields the API might report errors on, so a server error jumps to the right step. */
  fields: string[]
}

export function dobProblem(dob: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null
  const today = localDay(new Date(), detectTimeZone())
  const age = ageOn(dob, today)
  if (age < 0 || age > 120) return 'Check the year'
  if (age < MIN_AGE) return `You need to be ${MIN_AGE} or over to use this app`
  return null
}

const inRange = (value: number | null, min: number, max: number) =>
  value !== null && value >= min && value <= max

export const STEPS: StepDef[] = [
  {
    id: 'units',
    title: 'Set up your targets',
    subtitle:
      'About two minutes. Every answer feeds the numbers, and you can change any of them later.',
    component: UnitsStep,
    ready: () => true,
    fields: ['units'],
  },
  {
    id: 'sex',
    title: 'Which formula fits you?',
    subtitle: 'Sex only goes into the energy formula and the vitamin and mineral guidelines.',
    component: SexStep,
    ready: (d) => d.sex !== null,
    fields: ['sex'],
  },
  {
    id: 'dob',
    title: 'When were you born?',
    subtitle: 'Age shifts the energy formula and a few nutrient guidelines.',
    component: DobStep,
    ready: (d) => /^\d{4}-\d{2}-\d{2}$/.test(d.dob) && dobProblem(d.dob) === null,
    problem: (d) => dobProblem(d.dob),
    fields: ['dob'],
  },
  {
    id: 'height',
    title: 'How tall are you?',
    component: HeightStep,
    ready: (d) => inRange(d.heightCm, HEIGHT_CM.min, HEIGHT_CM.max),
    problem: (d) =>
      d.heightCm !== null && !inRange(d.heightCm, HEIGHT_CM.min, HEIGHT_CM.max)
        ? `Height should be between ${HEIGHT_CM.min} and ${HEIGHT_CM.max} cm`
        : null,
    fields: ['heightCm'],
  },
  {
    id: 'weight',
    title: 'What do you weigh?',
    subtitle: 'Roughly is fine. You can log weigh-ins later.',
    component: WeightStep,
    ready: (d) => inRange(d.weightKg, WEIGHT_KG.min, WEIGHT_KG.max),
    problem: (d) =>
      d.weightKg !== null && !inRange(d.weightKg, WEIGHT_KG.min, WEIGHT_KG.max)
        ? `Weight should be between ${WEIGHT_KG.min} and ${WEIGHT_KG.max} kg`
        : null,
    fields: ['weightKg'],
  },
  {
    id: 'bodyFat',
    title: 'Know your body fat?',
    subtitle: 'Optional. If you have a recent measurement, the energy formula gets more accurate.',
    component: BodyFatStep,
    ready: (d) =>
      d.bodyFatPct === null || inRange(d.bodyFatPct, BODY_FAT_PCT.min, BODY_FAT_PCT.max),
    problem: (d) =>
      d.bodyFatPct !== null && !inRange(d.bodyFatPct, BODY_FAT_PCT.min, BODY_FAT_PCT.max)
        ? `Body fat should be between ${BODY_FAT_PCT.min} and ${BODY_FAT_PCT.max}%`
        : null,
    optional: true,
    fields: ['bodyFatPct'],
  },
  {
    id: 'goal',
    title: "What's the goal?",
    component: GoalStep,
    ready: (d) => d.goal !== null,
    fields: ['goal'],
  },
  {
    id: 'pace',
    title: 'How fast?',
    subtitle: 'Slower is easier to keep up and keeps more muscle.',
    component: PaceStep,
    ready: (d) => d.pace !== null,
    skip: (d) => d.goal !== 'lose' && d.goal !== 'gain',
    problem: (d) => {
      if (d.goalWeightKg === null || d.weightKg === null) return null
      if (d.goal === 'lose' && d.goalWeightKg >= d.weightKg)
        return 'Goal weight should be below your current weight'
      if (d.goal === 'gain' && d.goalWeightKg <= d.weightKg)
        return 'Goal weight should be above your current weight'
      return null
    },
    fields: ['pace', 'goalWeightKg'],
  },
  {
    id: 'activity',
    title: 'How active is a normal week?',
    subtitle: 'Count work and training together. Exercise is never added on top later.',
    component: ActivityStep,
    ready: (d) => d.activity !== null,
    fields: ['activity'],
  },
  {
    id: 'training',
    title: 'How do you train?',
    subtitle: 'Sets the protein target and the water target on training days.',
    component: TrainingStep,
    ready: (d) => d.trainingType !== null,
    fields: ['trainingType', 'trainingDaysPerWeek'],
  },
  {
    id: 'diet',
    title: 'How do you eat?',
    subtitle: 'Shapes the fat and carb split and the foods the app suggests.',
    component: DietStep,
    ready: (d) => d.dietPattern !== null,
    fields: ['dietPattern'],
  },
  {
    id: 'allergies',
    title: 'Anything you can’t eat?',
    subtitle: 'Allergies and intolerances. Suggestions will never include these.',
    component: AllergiesStep,
    ready: () => true,
    optional: true,
    fields: ['allergies'],
  },
  {
    id: 'dislikes',
    title: 'Anything you won’t eat?',
    subtitle: 'Dislikes are optional. They only filter suggestions.',
    component: DislikesStep,
    ready: () => true,
    optional: true,
    fields: ['dislikes'],
  },
  {
    id: 'health',
    title: 'A few health questions',
    subtitle: 'These keep the targets safe. Nothing here is shared.',
    component: HealthStep,
    ready: () => true,
    fields: ['flags'],
  },
  {
    id: 'review',
    title: 'Ready to build your plan',
    subtitle: 'Check the answers, then we compute your targets.',
    component: ReviewStep,
    ready: () => true,
    fields: ['timezone'],
  },
]
