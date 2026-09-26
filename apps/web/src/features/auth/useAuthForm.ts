import { toValidationDetails, type PublicUser } from '@diet-tracker/shared'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { ZodType } from 'zod'
import { ApiError } from '@/lib/api'
import { useQueueStore } from '@/stores/queue'
import { ME_KEY } from './useSession'

/**
 * Shared form plumbing for login and register: validate with the same zod schema the
 * server uses, submit, map API errors to fields, then go to `?next` or Today.
 */
export function useAuthForm<T extends { email: string; password: string }>(
  schema: ZodType<T>,
  submitFn: (input: T) => Promise<PublicUser>,
) {
  const email = ref('')
  const password = ref('')
  const fieldErrors = ref<Record<string, string[]>>({})
  const formError = ref<string | null>(null)

  const route = useRoute()
  const router = useRouter()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: submitFn,
    onSuccess: async (user) => {
      // Whatever the previous person on this device left in the cache goes.
      queryClient.clear()
      queryClient.setQueryData(ME_KEY, user)
      void useQueueStore().flush()
      const next = typeof route.query.next === 'string' ? route.query.next : '/'
      await router.replace(next.startsWith('/') ? next : '/')
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError) {
        fieldErrors.value = error.fieldErrors
        formError.value = Object.keys(fieldErrors.value).length > 0 ? null : error.message
      } else {
        formError.value = 'Something went wrong. Please try again.'
      }
    },
  })

  function submit(): void {
    fieldErrors.value = {}
    formError.value = null
    const parsed = schema.safeParse({ email: email.value, password: password.value })
    if (!parsed.success) {
      fieldErrors.value = toValidationDetails(parsed.error).fieldErrors
      return
    }
    mutation.mutate(parsed.data)
  }

  const errorFor = (field: 'email' | 'password') =>
    computed(() => fieldErrors.value[field]?.[0] ?? null)

  return {
    email,
    password,
    emailError: errorFor('email'),
    passwordError: errorFor('password'),
    formError,
    submitting: mutation.isPending,
    submit,
  }
}
