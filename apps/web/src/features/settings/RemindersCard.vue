<script setup lang="ts">
import { computed } from 'vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Icon from '@/components/ui/Icon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Toggle from '@/components/ui/Toggle.vue'
import { useInstallStore } from '@/stores/install'
import { MAX_REMINDERS, useRemindersStore } from '@/stores/reminders'

/**
 * Daily reminders to log food. Honest about the platform: a web app only fires them while
 * it is open on this device (D22), and iOS needs it installed on the Home Screen first.
 */
const reminders = useRemindersStore()
const install = useInstallStore()

const enabled = computed({
  get: () => reminders.prefs.enabled,
  set: (value: boolean) => void reminders.setEnabled(value),
})

function updateTime(index: number, value: string): void {
  const times = [...reminders.prefs.times]
  times[index] = value
  reminders.setTimes(times)
}
function removeTime(index: number): void {
  reminders.setTimes(reminders.prefs.times.filter((_, i) => i !== index))
}
function addTime(): void {
  reminders.setTimes([...reminders.prefs.times, '20:00'])
}

const nextText = computed(() => {
  const next = reminders.next
  if (!next) return null
  return next.toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
})
</script>

<template>
  <Card>
    <h2 class="flex items-center gap-2 text-base font-semibold">
      <Icon name="bell" :size="20" class="text-accent" />
      Reminders
    </h2>

    <p v-if="!reminders.isSupported" class="mt-2 text-sm text-fg-muted">
      This browser cannot show notifications.
      <template v-if="install.ios && !install.standalone">
        On iPhone, add the app to your Home Screen first (Share, then Add to Home Screen) and open
        it from there.
      </template>
    </p>

    <template v-else>
      <Toggle
        v-model="enabled"
        class="mt-2"
        label="Remind me to log"
        description="A notification at the times below while the app is open on this device."
      />

      <p v-if="reminders.permission === 'denied'" class="mt-2 text-sm text-over" role="alert">
        Notifications are blocked for this site. Allow them in your browser or phone settings, then
        turn the reminder on again.
      </p>

      <template v-if="reminders.prefs.enabled && reminders.permission === 'granted'">
        <ul class="mt-3 space-y-2" aria-label="Reminder times">
          <li
            v-for="(time, index) in reminders.prefs.times"
            :key="index"
            class="flex items-center gap-2"
          >
            <label class="sr-only" :for="`reminder-${index}`">Reminder {{ index + 1 }}</label>
            <input
              :id="`reminder-${index}`"
              type="time"
              :value="time"
              class="h-12 min-w-0 flex-1 rounded-control border border-border bg-surface-2 px-4 text-base text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
              @change="updateTime(index, ($event.target as HTMLInputElement).value)"
            />
            <IconButton
              label="Remove this reminder"
              icon="x"
              :disabled="reminders.prefs.times.length <= 1"
              @click="removeTime(index)"
            />
          </li>
        </ul>
        <Button
          v-if="reminders.prefs.times.length < MAX_REMINDERS"
          class="mt-2"
          variant="ghost"
          @click="addTime"
        >
          <Icon name="plus" :size="18" /> Add a time
        </Button>
        <p v-if="nextText" class="mt-2 text-xs text-fg-muted">Next reminder: {{ nextText }}.</p>
      </template>

      <p class="mt-3 text-xs text-fg-muted">
        Web apps cannot wake themselves up, so a reminder only fires when the app is open or in the
        background on this phone. Reliable reminders with the app closed arrive with the App Store
        version.
      </p>
    </template>
  </Card>
</template>
