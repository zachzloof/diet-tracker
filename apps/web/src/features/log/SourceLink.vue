<script setup lang="ts">
import Icon from '@/components/ui/Icon.vue'
import { hostOf } from './source'

/**
 * The product page an item's numbers were read from, as a tappable row that opens it in a
 * new tab. Shows the site, not the URL: "Label read from tesco.com".
 */
defineProps<{ url: string }>()
</script>

<template>
  <a
    :href="url"
    target="_blank"
    rel="noopener noreferrer"
    class="flex min-h-11 items-center gap-2 text-sm font-semibold text-accent"
  >
    <Icon name="globe" :size="16" class="shrink-0" />
    <span class="min-w-0 truncate">Label read from {{ hostOf(url) }}</span>
    <Icon name="share" :size="14" class="shrink-0" />
  </a>
</template>
