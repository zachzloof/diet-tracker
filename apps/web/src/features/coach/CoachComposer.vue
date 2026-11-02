<script setup lang="ts">
import { COACH_MAX_MESSAGE_CHARS } from '@diet-tracker/shared'
import { computed, nextTick, ref, watch } from 'vue'
import Icon from '@/components/ui/Icon.vue'

/**
 * The message box pinned above the keyboard. One line that grows to four, Enter sends on
 * a keyboard with a Shift for newlines, the send button is the thumb's target. Disabled
 * offline and while an answer streams, with one line saying why.
 */
const model = defineModel<string>({ default: '' })

const props = defineProps<{
  disabled?: boolean
  /** Why the box is disabled, shown under it ("The coach needs a connection"). */
  reason?: string | null
  busy?: boolean
}>()

const emit = defineEmits<{ send: [] }>()

const box = ref<HTMLTextAreaElement | null>(null)
const remaining = computed(() => COACH_MAX_MESSAGE_CHARS - model.value.length)
const canSend = computed(
  () => !props.disabled && !props.busy && model.value.trim().length > 0 && remaining.value >= 0,
)

function resize(): void {
  const el = box.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 120)}px`
}
watch(model, () => void nextTick(resize), { immediate: true })

function submit(): void {
  if (!canSend.value) return
  emit('send')
}

function onEnter(event: KeyboardEvent): void {
  if (event.shiftKey) return
  event.preventDefault()
  submit()
}

defineExpose({ focus: () => box.value?.focus() })
</script>

<template>
  <form class="space-y-1" @submit.prevent="submit">
    <div class="flex items-end gap-2">
      <label class="sr-only" for="coach-composer">Ask the coach</label>
      <textarea
        id="coach-composer"
        ref="box"
        v-model="model"
        rows="1"
        :maxlength="COACH_MAX_MESSAGE_CHARS"
        :disabled="disabled"
        placeholder="Ask the coach…"
        enterkeyhint="send"
        autocapitalize="sentences"
        autocomplete="off"
        class="min-h-12 flex-1 resize-none rounded-control border border-border bg-surface-2 px-4 py-3 text-base leading-snug text-fg placeholder:text-fg-muted/70 transition outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:opacity-60"
        @keydown.enter="onEnter"
        @input="resize"
      />
      <button
        type="submit"
        class="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg transition active:scale-95 disabled:opacity-40"
        :disabled="!canSend"
        aria-label="Send"
      >
        <span
          v-if="busy"
          class="size-5 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
        <Icon v-else name="arrow-up" :size="22" />
      </button>
    </div>
    <p v-if="reason" class="px-1 text-xs text-fg-muted">{{ reason }}</p>
    <p v-else-if="remaining < 100" class="px-1 text-right text-xs text-fg-muted">
      {{ remaining }} left
    </p>
  </form>
</template>
