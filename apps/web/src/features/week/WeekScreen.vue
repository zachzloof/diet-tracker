<script setup lang="ts">
import AppShell from '@/components/ui/AppShell.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
</script>

<template>
  <AppShell title="Week">
    <Card :padded="false">
      <EmptyState
        icon="calendar"
        title="No days logged yet"
        description="Days met, streaks and the areas you're lacking will appear here once you start logging."
      />
    </Card>
  </AppShell>
</template>
