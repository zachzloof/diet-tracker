import type { Activity, DietPattern, Goal, Pace, Sex, TrainingType, UnitSystem } from './profile.js'

/**
 * Human labels and helper text for the profile enums. Shared so the onboarding screens,
 * the target reasons and the AI prompt all describe a choice the same way.
 */

export const SEX_LABELS: Readonly<Record<Sex, string>> = {
  male: 'Male',
  female: 'Female',
  unspecified: 'Prefer not to say',
}

export const ACTIVITY_LABELS: Readonly<Record<Activity, { label: string; help: string }>> = {
  sedentary: { label: 'Sedentary', help: 'Desk job, little or no exercise' },
  light: { label: 'Light', help: 'Light exercise 1 to 3 days a week' },
  moderate: { label: 'Moderate', help: 'Moderate exercise 3 to 5 days a week' },
  high: { label: 'High', help: 'Hard training 6 to 7 days a week' },
  very_high: {
    label: 'Very high',
    help: 'Physical job plus daily hard training, or two sessions a day',
  },
}

export const TRAINING_TYPE_LABELS: Readonly<Record<TrainingType, string>> = {
  none: 'No structured training',
  general: 'Gym / general fitness',
  strength: 'Strength, powerlifting or bodybuilding',
  cardio: 'Running, cycling or swimming',
  combat: 'Combat sports',
  crossfit: 'CrossFit / functional fitness',
  team_sport: 'Team sport',
  mixed: 'A mix',
}

export const GOAL_LABELS: Readonly<Record<Goal, { label: string; help: string }>> = {
  lose: { label: 'Lose fat', help: 'A calorie deficit with high protein to keep muscle' },
  maintain: { label: 'Maintain', help: 'Eat to stay where you are and feel good' },
  gain: { label: 'Gain muscle', help: 'A small surplus so most of the gain is lean' },
  recomp: {
    label: 'Recomposition',
    help: 'Maintenance calories, very high protein: lose fat and build muscle slowly',
  },
}

export const PACE_LABELS: Readonly<Record<Pace, { label: string; help: string }>> = {
  gentle: { label: 'Gentle', help: 'About 0.25 kg a week' },
  standard: { label: 'Standard', help: 'About 0.5 kg a week' },
  aggressive: { label: 'Aggressive', help: 'About 0.75 kg a week; harder to sustain' },
  lean: { label: 'Lean gain', help: 'About 0.25 kg a week, mostly muscle' },
  fast: { label: 'Faster gain', help: 'About 0.5 kg a week; expect some fat gain' },
}

export const DIET_PATTERN_LABELS: Readonly<Record<DietPattern, { label: string; help: string }>> = {
  omnivore: { label: 'Omnivore', help: 'Everything' },
  pescatarian: { label: 'Pescatarian', help: 'Fish and seafood but no other meat' },
  vegetarian: { label: 'Vegetarian', help: 'No meat or fish; eggs and dairy are fine' },
  vegan: { label: 'Vegan', help: 'No animal products' },
  mediterranean: { label: 'Mediterranean', help: 'Olive oil, fish, legumes, lots of vegetables' },
  low_carb: { label: 'Low carb', help: 'Fat around 40% of energy, carbs kept low' },
}

export const UNIT_SYSTEM_LABELS: Readonly<Record<UnitSystem, string>> = {
  metric: 'Metric (kg, cm)',
  imperial: 'Imperial (lb, ft)',
}
