<script setup lang="ts">
import { changePasswordRequestSchema, toValidationDetails } from '@diet-tracker/shared'
import { useMutation } from '@tanstack/vue-query'
import { ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Input from '@/components/ui/Input.vue'
import Sheet from '@/components/ui/Sheet.vue'
import { ApiError } from '@/lib/api'
import { useUiStore } from '@/stores/ui'
import { accountApi } from './api'

const open = defineModel<boolean>('open', { default: false })

const ui = useUiStore()
const current = ref('')
const next = ref('')
const confirm = ref('')
const show = ref(false)
const fieldErrors = ref<Record<string, string[]>>({})
const formError = ref<string | null>(null)

const change = useMutation({ mutationFn: accountApi.changePassword })

watch(open, (isOpen) => {
  if (!isOpen) return
  current.value = ''
  next.value = ''
  confirm.value = ''
  show.value = false
  fieldErrors.value = {}
  formError.value = null
  change.reset()
})

function submit(): void {
  fieldErrors.value = {}
  formError.value = null
  const parsed = changePasswordRequestSchema.safeParse({
    currentPassword: current.value,
    newPassword: next.value,
  })
  if (!parsed.success) {
    fieldErrors.value = toValidationDetails(parsed.error).fieldErrors
    return
  }
  if (confirm.value !== next.value) {
    fieldErrors.value = { confirm: ['The two new passwords do not match'] }
    return
  }
  change.mutate(parsed.data, {
    onSuccess: () => {
      ui.toast('Password changed. Any other signed-in devices were signed out.', 'success')
      open.value = false
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError) {
        fieldErrors.value = error.fieldErrors
        formError.value = Object.keys(error.fieldErrors).length ? null : error.message
      } else {
        formError.value = 'Something went wrong. Please try again.'
      }
    },
  })
}
</script>

<template>
  <Sheet v-model:open="open" title="Change password">
    <form class="space-y-4" novalidate @submit.prevent="submit">
      <Input
        v-model="current"
        label="Current password"
        :type="show ? 'text' : 'password'"
        autocomplete="current-password"
        :error="fieldErrors.currentPassword?.[0] ?? null"
        required
      >
        <template #right>
          <IconButton
            :label="show ? 'Hide passwords' : 'Show passwords'"
            :icon="show ? 'eye-off' : 'eye'"
            @click="show = !show"
          />
        </template>
      </Input>
      <Input
        v-model="next"
        label="New password"
        :type="show ? 'text' : 'password'"
        autocomplete="new-password"
        helper="At least 8 characters."
        :error="fieldErrors.newPassword?.[0] ?? null"
        required
      />
      <Input
        v-model="confirm"
        label="New password again"
        :type="show ? 'text' : 'password'"
        autocomplete="new-password"
        :error="fieldErrors.confirm?.[0] ?? null"
        required
      />
      <p
        v-if="formError"
        class="flex items-start gap-2 rounded-control border border-over/40 bg-over/10 px-3 py-2.5 text-sm text-fg"
        role="alert"
      >
        <Icon name="alert" :size="18" class="mt-0.5 shrink-0 text-over" />
        {{ formError }}
      </p>
      <Button type="submit" block :loading="change.isPending.value" :disabled="!ui.online">
        {{ ui.online ? 'Change password' : 'Offline' }}
      </Button>
    </form>
  </Sheet>
</template>
