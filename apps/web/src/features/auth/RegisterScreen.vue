<script setup lang="ts">
import { registerInputSchema } from '@diet-tracker/shared'
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Input from '@/components/ui/Input.vue'
import { authApi } from './api'
import AuthLayout from './AuthLayout.vue'
import { useAuthForm } from './useAuthForm'

const form = useAuthForm(registerInputSchema, authApi.register)
const showPassword = ref(false)
</script>

<template>
  <AuthLayout title="Create your account" subtitle="One account, all your days. Free.">
    <form class="space-y-4" novalidate @submit.prevent="form.submit()">
      <Input
        v-model="form.email.value"
        label="Email"
        type="email"
        name="email"
        inputmode="email"
        autocomplete="email"
        placeholder="you@example.com"
        :error="form.emailError.value"
        required
      />
      <Input
        v-model="form.password.value"
        label="Password"
        :type="showPassword ? 'text' : 'password'"
        name="password"
        autocomplete="new-password"
        helper="At least 8 characters."
        :error="form.passwordError.value"
        required
      >
        <template #right>
          <IconButton
            :label="showPassword ? 'Hide password' : 'Show password'"
            :icon="showPassword ? 'eye-off' : 'eye'"
            @click="showPassword = !showPassword"
          />
        </template>
      </Input>

      <p
        v-if="form.formError.value"
        class="flex items-start gap-2 rounded-control border border-over/40 bg-over/10 px-3 py-2.5 text-sm text-fg"
        role="alert"
      >
        <Icon name="alert" :size="18" class="mt-0.5 shrink-0 text-over" />
        {{ form.formError.value }}
      </p>

      <Button type="submit" block :loading="form.submitting.value">Create account</Button>

      <p class="text-center text-xs text-fg-muted">
        This app is not medical advice. Targets are general guidance, not a prescription.
      </p>
    </form>

    <template #footer>
      Already have an account?
      <RouterLink :to="{ name: 'login' }" class="font-semibold text-accent">Sign in</RouterLink>
    </template>
  </AuthLayout>
</template>
