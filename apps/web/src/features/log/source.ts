import type { EntrySource, FoodSource } from '@diet-tracker/shared'
import type { IconName } from '@/components/ui/Icon.vue'

/**
 * Where an item's numbers came from, as the day log, the entry sheet and My foods say it.
 * A log entry's source says how it was logged; a food's says how it got into the library.
 */

export const ENTRY_SOURCE_ICON: Readonly<Record<EntrySource, IconName>> = {
  ai: 'sparkles',
  library: 'book',
  manual: 'pencil',
}

export const ENTRY_SOURCE_LABEL: Readonly<Record<EntrySource, string>> = {
  ai: 'AI estimate',
  library: 'From My foods',
  manual: 'Entered manually',
}

export const FOOD_SOURCE_ICON: Readonly<Record<FoodSource, IconName>> = {
  ai: 'sparkles',
  manual: 'pencil',
  usda: 'book',
}

export const FOOD_SOURCE_LABEL: Readonly<Record<FoodSource, string>> = {
  ai: 'AI estimate',
  manual: 'Entered manually',
  usda: 'USDA database',
}

/** "tesco.com" for a product page; the link itself is too long to show on a phone. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'the web'
  }
}
