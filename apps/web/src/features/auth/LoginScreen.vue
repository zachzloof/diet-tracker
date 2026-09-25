<script setup lang="ts">
import { loginInputSchema } from '@diet-tracker/shared'
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Input from '@/components/ui/Input.vue'
import { authApi } from './api'
import AuthLayout from './AuthLayout.vue'
import { useAuthForm } from './useAuthForm'

const form = useAuthForm(loginInputSchema, authApi.login)
const showPassword = ref(false)
</script>

<template>
  <AuthLayout title="Welcome back" subtitle="Sign in to see today's numbers.">
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
        autocomplete="current-password"
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

      <Button type="submit" block :loading="form.submitting.value">Sign in</Button>
    </form>

    <template #footer>
      New here?
      <RouterLink :to="{ name: 'register' }" class="font-semibold text-accent">
        Create an account
      </RouterLink>
    </template>
  </AuthLayout>
</template>
