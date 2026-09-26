<script setup lang="ts">
import { deleteAccountRequestSchema, toValidationDetails } from '@diet-tracker/shared'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import Input from '@/components/ui/Input.vue'
import Sheet from '@/components/ui/Sheet.vue'
import { ME_KEY } from '@/features/auth/useSession'
import { ApiError } from '@/lib/api'
import { clearPersistedQueries } from '@/lib/query-client'
import { useUiStore } from '@/stores/ui'
import { accountApi } from './api'

/**
 * Deleting an account is confirmed twice: once by reading what goes and typing the
 * password, once more on a final button. Every row cascades from the user (db-schema
 * skill), so the server side is one statement.
 */
const open = defineModel<boolean>('open', { default: false })

const ui = useUiStore()
const router = useRouter()
const queryClient = useQueryClient()
const step = ref<1 | 2>(1)
const password = ref('')
const understood = ref(false)
const fieldErrors = ref<Record<string, string[]>>({})
const formError = ref<string | null>(null)

const remove = useMutation({ mutationFn: accountApi.deleteAccount })

watch(open, (isOpen) => {
  if (!isOpen) return
  step.value = 1
  password.value = ''
  understood.value = false
  fieldErrors.value = {}
  formError.value = null
  remove.reset()
})

function next(): void {
  fieldErrors.value = {}
  const parsed = deleteAccountRequestSchema.safeParse({ password: password.value })
  if (!parsed.success) {
    fieldErrors.value = toValidationDetails(parsed.error).fieldErrors
    return
  }
  step.value = 2
}

function confirm(): void {
  formError.value = null
  remove.mutate(
    { password: password.value },
    {
      onSuccess: async () => {
        queryClient.clear()
        clearPersistedQueries()
        try {
          localStorage.removeItem('dt.queue')
        } catch {
          // Nothing to clear.
        }
        queryClient.setQueryData(ME_KEY, null)
        open.value = false
        await router.replace({ name: 'login' })
        ui.toast('Your account and everything in it were deleted.', 'info')
      },
      onError: (error: unknown) => {
        step.value = 1
        if (error instanceof ApiError) {
          fieldErrors.value = error.fieldErrors
          formError.value = Object.keys(error.fieldErrors).length ? null : error.message
        } else {
          formError.value = 'Something went wrong. Please try again.'
        }
      },
    },
  )
}
</script>

<template>
  <Sheet v-model:open="open" title="Delete account">
    <div v-if="step === 1" class="space-y-4">
      <p class="text-sm text-fg">This removes, permanently and immediately:</p>
      <ul class="list-disc space-y-1 pl-5 text-sm text-fg-muted">
        <li>your account and email address</li>
        <li>your profile, targets and target history</li>
        <li>every logged meal, glass of water and weigh-in</li>
        <li>My foods, weekly reviews and the record of AI calls</li>
      </ul>
      <p class="text-sm text-fg-muted">
        Want a copy first? Export your data from Settings before you continue.
      </p>
      <Input
        v-model="password"
        label="Your password"
        type="password"
        autocomplete="current-password"
        :error="fieldErrors.password?.[0] ?? null"
        required
      />
      <label class="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-fg">
        <input
          v-model="understood"
          type="checkbox"
          class="mt-1 size-5 shrink-0 accent-[var(--danger)]"
        />
        I understand this cannot be undone.
      </label>
      <p
        v-if="formError"
        class="flex items-start gap-2 rounded-control border border-over/40 bg-over/10 px-3 py-2.5 text-sm text-fg"
        role="alert"
      >
        <Icon name="alert" :size="18" class="mt-0.5 shrink-0 text-over" />
        {{ formError }}
      </p>
      <Button
        block
        variant="destructive"
        :disabled="!understood || !password || !ui.online"
        @click="next"
      >
        Continue
      </Button>
    </div>

    <div v-else class="space-y-4">
      <p class="text-base font-semibold text-fg">Delete everything?</p>
      <p class="text-sm text-fg-muted">
        This is the last step. Your account and all of its data will be gone.
      </p>
      <Button block variant="destructive" :loading="remove.isPending.value" @click="confirm">
        <Icon name="trash" :size="20" /> Delete my account
      </Button>
      <Button block variant="secondary" :disabled="remove.isPending.value" @click="step = 1">
        Go back
      </Button>
    </div>
  </Sheet>
</template>
