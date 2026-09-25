<script setup lang="ts">
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive'

withDefaults(
  defineProps<{
    variant?: ButtonVariant
    type?: 'button' | 'submit'
    loading?: boolean
    disabled?: boolean
    block?: boolean
  }>(),
  { variant: 'primary', type: 'button', loading: false, disabled: false, block: false },
)

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:brightness-95 active:brightness-90',
  secondary: 'bg-surface-2 text-fg border border-border hover:bg-border/60 active:bg-border',
  ghost: 'bg-transparent text-fg hover:bg-surface-2 active:bg-border/60',
  destructive:
    'bg-danger/10 text-danger border border-danger/30 hover:bg-danger/15 active:bg-danger/20',
}
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
    class="inline-flex h-12 items-center justify-center gap-2 rounded-control px-5 text-base font-semibold transition duration-150 ease-out select-none disabled:cursor-not-allowed disabled:opacity-50"
    :class="[VARIANTS[variant], block && 'w-full']"
  >
    <span
      v-if="loading"
      class="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
      aria-hidden="true"
    />
    <slot />
  </button>
</template>
