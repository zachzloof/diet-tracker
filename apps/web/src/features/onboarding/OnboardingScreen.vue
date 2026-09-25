<script setup lang="ts">
import { profileInputSchema, toValidationDetails } from '@diet-tracker/shared'
import { computed, nextTick, provide, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import { useLogout, useSession } from '@/features/auth/useSession'
import { useSaveProfile } from '@/features/profile/useProfile'
import { ApiError } from '@/lib/api'
import { STEPS } from './steps'
import { PROBLEM_KEY, draftToInput, provideDraft, useOnboardingDraft } from './useOnboardingDraft'

/**
 * One question per screen, resumable, primary button pinned above the keyboard. The
 * answers only leave the phone on the last step, as one PUT /profile.
 */
const session = useSession()
const router = useRouter()
const logout = useLogout()
const save = useSaveProfile()

const userId = session.user.value?.id ?? 'anonymous'
const { draft, reset } = useOnboardingDraft(userId)
provideDraft(draft)

const steps = computed(() => STEPS.filter((step) => !step.skip?.(draft)))
const index = computed(() => Math.min(Math.max(draft.step, 0), steps.value.length - 1))
const step = computed(() => steps.value[index.value] ?? STEPS[0]!)
const isLast = computed(() => index.value === steps.value.length - 1)
const ready = computed(() => step.value.ready(draft))
const problem = computed(() => step.value.problem?.(draft) ?? null)
provide(PROBLEM_KEY, problem)
const formError = ref<string | null>(null)

const buttonLabel = computed(() => {
  if (isLast.value) return 'Create my plan'
  if (step.value.optional && !hasAnswer(step.value.id)) return 'Skip for now'
  return 'Continue'
})

function hasAnswer(id: string): boolean {
  if (id === 'bodyFat') return draft.bodyFatPct !== null
  if (id === 'allergies') return draft.allergies.length > 0
  if (id === 'dislikes') return draft.dislikes.length > 0
  return true
}

watch(index, () => {
  formError.value = null
  void nextTick(() => window.scrollTo({ top: 0 }))
})

function next(): void {
  if (!ready.value || problem.value) return
  if (isLast.value) {
    submit()
    return
  }
  draft.step = index.value + 1
}

function back(): void {
  if (index.value === 0) return
  draft.step = index.value - 1
}

function jumpToField(field: string): void {
  const target = steps.value.findIndex((candidate) => candidate.fields.includes(field))
  if (target >= 0) draft.step = target
}

function submit(): void {
  formError.value = null
  const parsed = profileInputSchema.safeParse(draftToInput(draft))
  if (!parsed.success) {
    const details = toValidationDetails(parsed.error)
    const [field, messages] = Object.entries(details.fieldErrors)[0] ?? []
    formError.value = messages?.[0] ?? details.formErrors[0] ?? 'Check your answers'
    if (field) jumpToField(field)
    return
  }
  save.mutate(parsed.data, {
    onSuccess: async () => {
      reset()
      await router.replace({ name: 'targets', query: { welcome: '1' } })
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError) {
        const [field, messages] = Object.entries(error.fieldErrors)[0] ?? []
        formError.value = messages?.[0] ?? error.message
        if (field) jumpToField(field)
      } else {
        formError.value = 'Something went wrong. Please try again.'
      }
    },
  })
}
</script>

<template>
  <div
    class="flex min-h-dvh flex-col bg-bg text-fg"
    :style="{ paddingTop: 'env(safe-area-inset-top)' }"
  >
    <header class="mx-auto w-full max-w-[480px] px-3 pt-2">
      <div class="flex h-11 items-center justify-between">
        <IconButton
          label="Back"
          icon="chevron-left"
          :disabled="index === 0"
          :class="index === 0 && 'invisible'"
          @click="back"
        />
        <span class="text-sm text-fg-muted">{{ index + 1 }} of {{ steps.length }}</span>
        <Button
          v-if="index === 0"
          variant="ghost"
          class="!h-10 !px-3 text-sm"
          :loading="logout.isPending.value"
          @click="logout.mutate()"
        >
          Log out
        </Button>
        <span v-else class="size-11" aria-hidden="true" />
      </div>
      <div class="mt-1 h-1 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
        <div
          class="h-full rounded-full bg-accent transition-[width] duration-250 ease-out"
          :style="{ width: `${((index + 1) / steps.length) * 100}%` }"
        />
      </div>
    </header>

    <main class="mx-auto w-full max-w-[480px] flex-1 px-4 pt-6 pb-6">
      <h1 class="text-[28px] leading-tight font-bold">{{ step.title }}</h1>
      <p v-if="step.subtitle" class="mt-2 text-base text-fg-muted">{{ step.subtitle }}</p>
      <form class="mt-6" novalidate @submit.prevent="next">
        <component :is="step.component" :key="step.id" />
        <!-- Lets Enter/Go on a phone keyboard advance the step. -->
        <button type="submit" class="hidden" tabindex="-1" aria-hidden="true" />
      </form>
    </main>

    <footer
      class="sticky bottom-0 z-10 border-t border-border bg-bg/95 backdrop-blur"
      :style="{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }"
    >
      <div class="mx-auto w-full max-w-[480px] space-y-2 px-4 pt-3">
        <p v-if="formError" class="flex items-start gap-2 text-sm text-over" role="alert">
          <Icon name="alert" :size="18" class="mt-0.5 shrink-0" />
          {{ formError }}
        </p>
        <Button
          block
          :disabled="!ready || problem !== null"
          :loading="save.isPending.value"
          @click="next"
        >
          {{ buttonLabel }}
        </Button>
      </div>
    </footer>
  </div>
</template>
