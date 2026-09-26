<script setup lang="ts">
/** Small stroke icon set on a 24px grid. Decorative by default; give the parent an aria-label. */
export type IconName =
  | 'home'
  | 'plus'
  | 'calendar'
  | 'user'
  | 'x'
  | 'eye'
  | 'eye-off'
  | 'share'
  | 'log-out'
  | 'check'
  | 'wifi-off'
  | 'alert'
  | 'download'
  | 'chevron-right'
  | 'chevron-left'
  | 'sparkles'
  | 'globe'
  | 'clock'
  | 'edit'
  | 'info'
  | 'target'
  | 'refresh'
  | 'trash'
  | 'search'
  | 'book'
  | 'minus'
  | 'chevron-down'
  | 'bookmark'
  | 'pencil'

const PATHS: Record<IconName, string> = {
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  plus: 'M12 5v14M5 12h14',
  calendar: 'M4 5h16v15H4zM4 10h16M8 3v4M16 3v4',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  x: 'M6 6l12 12M18 6L6 18',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  'eye-off': 'M2 12s4-7 10-7c2 0 3.7.6 5.2 1.5M22 12s-4 7-10 7c-2 0-3.7-.6-5.2-1.5M4 4l16 16',
  share: 'M12 3v12M8 7l4-4 4 4M5 12v8h14v-8',
  'log-out': 'M10 4H5v16h5M14 8l5 4-5 4M19 12H9',
  check: 'M5 12l5 5L20 7',
  'wifi-off':
    'M2 8.5a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8.5 15.5a6 6 0 0 1 7 0M12 19h.01M3 3l18 18',
  alert: 'M12 3l10 18H2zM12 10v4M12 17h.01',
  download: 'M12 3v12M7 10l5 5 5-5M4 19h16',
  'chevron-right': 'M9 6l6 6-6 6',
  'chevron-left': 'M15 6l-6 6 6 6',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  edit: 'M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3zM13.5 6.5l3 3',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
  refresh: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  globe:
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
  book: 'M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4zM20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z',
  minus: 'M5 12h14',
  'chevron-down': 'M6 9l6 6 6-6',
  bookmark: 'M6 3h12v18l-6-4-6 4z',
  pencil: 'M4 20h4L19 9a2 2 0 0 0-3-3L5 17v3z',
  sparkles:
    'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM5 3v3M3.5 4.5h3M19 17v3M17.5 18.5h3',
}

withDefaults(defineProps<{ name: IconName; size?: number }>(), { size: 24 })
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path :d="PATHS[name]" />
  </svg>
</template>
