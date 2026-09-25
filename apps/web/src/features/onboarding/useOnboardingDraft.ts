import {
  NO_FLAGS,
  detectTimeZone,
  type Activity,
  type DietPattern,
  type Goal,
  type Pace,
  type ProfileInput,
  type SafetyFlags,
  type Sex,
  type TrainingType,
  type UnitSystem,
} from '@diet-tracker/shared'
import { inject, provide, reactive, ref, watch, type InjectionKey, type Ref } from 'vue'

/**
 * Onboarding answers, kept in localStorage per user so closing the app mid-way resumes
 * where the person left off. Cleared once the profile is saved.
 */
export interface OnboardingDraft {
  step: number
  units: UnitSystem
  sex: Sex | null
  dob: string
  heightCm: number | null
  weightKg: number | null
  bodyFatPct: number | null
  goal: Goal | null
  pace: Pace | null
  goalWeightKg: number | null
  activity: Activity | null
  trainingType: TrainingType | null
  trainingDaysPerWeek: number
  dietPattern: DietPattern | null
  allergies: string[]
  dislikes: string[]
  flags: SafetyFlags
}

export function emptyDraft(): OnboardingDraft {
  return {
    step: 0,
    units: 'metric',
    sex: null,
    dob: '',
    heightCm: null,
    weightKg: null,
    bodyFatPct: null,
    goal: null,
    pace: null,
    goalWeightKg: null,
    activity: null,
    trainingType: null,
    trainingDaysPerWeek: 3,
    dietPattern: null,
    allergies: [],
    dislikes: [],
    flags: { ...NO_FLAGS },
  }
}

const storageKey = (userId: string) => `dt.onboarding.${userId}`

function readDraft(userId: string): OnboardingDraft {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return emptyDraft()
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return emptyDraft()
    return { ...emptyDraft(), ...(parsed as Partial<OnboardingDraft>) }
  } catch {
    return emptyDraft()
  }
}

export function useOnboardingDraft(userId: string) {
  const draft = reactive<OnboardingDraft>(readDraft(userId))

  watch(
    draft,
    (value) => {
      try {
        localStorage.setItem(storageKey(userId), JSON.stringify(value))
      } catch {
        // Private mode: the draft just will not survive a reload.
      }
    },
    { deep: true },
  )

  function reset(): void {
    Object.assign(draft, emptyDraft())
    try {
      localStorage.removeItem(storageKey(userId))
    } catch {
      // Ignore.
    }
  }

  return { draft, reset }
}

/** What the API receives. Nulls are left for zod to report so the screen can jump to the field. */
export function draftToInput(draft: OnboardingDraft): unknown {
  const hasPace = draft.goal === 'lose' || draft.goal === 'gain'
  const input: Partial<ProfileInput> = {
    sex: draft.sex ?? undefined,
    dob: draft.dob || undefined,
    heightCm: draft.heightCm ?? undefined,
    weightKg: draft.weightKg ?? undefined,
    bodyFatPct: draft.bodyFatPct,
    goal: draft.goal ?? undefined,
    pace: hasPace ? draft.pace : null,
    goalWeightKg: hasPace ? draft.goalWeightKg : null,
    activity: draft.activity ?? undefined,
    trainingType: draft.trainingType ?? undefined,
    trainingDaysPerWeek: draft.trainingDaysPerWeek,
    dietPattern: draft.dietPattern ?? undefined,
    allergies: draft.allergies,
    dislikes: draft.dislikes,
    timezone: detectTimeZone(),
    units: draft.units,
    flags: draft.flags,
  }
  return input
}

export const DRAFT_KEY: InjectionKey<OnboardingDraft> = Symbol('onboarding-draft')

export function provideDraft(draft: OnboardingDraft): void {
  provide(DRAFT_KEY, draft)
}

export function injectDraft(): OnboardingDraft {
  const draft = inject(DRAFT_KEY)
  if (!draft) throw new Error('onboarding step used outside OnboardingScreen')
  return draft
}

/** The current step's inline problem (out-of-range value, under 18), shown next to its field. */
export const PROBLEM_KEY: InjectionKey<Ref<string | null>> = Symbol('onboarding-problem')

export function injectProblem(): Ref<string | null> {
  return inject(PROBLEM_KEY, ref<string | null>(null))
}
