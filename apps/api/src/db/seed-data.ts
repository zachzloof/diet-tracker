import { NO_FLAGS, type ProfileInput } from '@diet-tracker/shared'

/**
 * The two personas from docs/PLAN.md, with the profiles that produce the golden targets in
 * nutrition-engine/references/targets.md. Local use only; never run the seed against
 * production.
 */
export const SEED_USERS: { email: string; password: string; profile: ProfileInput }[] = [
  {
    email: 'finn@example.com',
    password: 'finn-password',
    profile: {
      sex: 'male',
      dob: '1998-06-15',
      heightCm: 178,
      weightKg: 75,
      bodyFatPct: null,
      goal: 'gain',
      pace: 'lean',
      goalWeightKg: 80,
      activity: 'high',
      trainingType: 'combat',
      trainingDaysPerWeek: 6,
      dietPattern: 'omnivore',
      allergies: [],
      dislikes: ['liver'],
      timezone: 'Europe/London',
      units: 'metric',
      flags: NO_FLAGS,
    },
  },
  {
    email: 'tess@example.com',
    password: 'tess-password',
    profile: {
      sex: 'female',
      dob: '1996-04-02',
      heightCm: 160,
      weightKg: 50,
      bodyFatPct: null,
      goal: 'lose',
      pace: 'gentle',
      goalWeightKg: 48,
      activity: 'moderate',
      trainingType: 'general',
      trainingDaysPerWeek: 3,
      dietPattern: 'omnivore',
      allergies: ['shellfish'],
      dislikes: ['coriander'],
      timezone: 'Europe/London',
      units: 'metric',
      flags: NO_FLAGS,
    },
  },
]
