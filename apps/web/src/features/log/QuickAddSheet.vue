<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Sheet from '@/components/ui/Sheet.vue'

const open = defineModel<boolean>('open', { default: false })
</script>

<template>
  <Sheet
    v-model:open="open"
    title="Log food"
    description="Type what you ate and the app estimates the nutrients."
  >
    <div class="space-y-4">
      <Input
        label="What did you eat?"
        placeholder="4 eggs and two slices of toast"
        helper="Food logging arrives in slice 3."
        disabled
      />
      <Button block disabled>Add to today</Button>
    </div>
  </Sheet>
</template>
