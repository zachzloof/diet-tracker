import type { Meal } from '@diet-tracker/shared'
import type { PortionKey } from './foods.js'

/**
 * Three weeks of Jamie's food log, relative to the demo's today (offset 0). Each sitting is
 * one "log" the way the app makes them: a meal, an hour, and the portions logged together.
 */

export interface Sitting {
  meal: Meal
  /** Local time it was logged, 24 h, e.g. 7.75 is 07:45. */
  hour: number
  /** Portions from foods.ts, or water in millilitres. */
  items: (PortionKey | { waterMl: number })[]
}

const water = (waterMl: number) => ({ waterMl })

const sit = (meal: Meal, hour: number, ...items: Sitting['items']): Sitting => ({
  meal,
  hour,
  items,
})

/** Good training days: energy within the band, protein well over. */
const DAY_TYPES = {
  a: [
    sit('breakfast', 7.5, 'porridge', 'banana', 'whey'),
    sit('snack', 10.25, water(500)),
    sit('lunch', 12.75, 'chickenBowl'),
    sit('snack', 15.5, 'pbToast', 'apple'),
    sit('snack', 17, water(750)),
    sit('dinner', 19.5, 'salmon'),
    sit('snack', 21.25, 'yoghurtBowl'),
  ],
  b: [
    sit('breakfast', 7.75, 'eggsOnToast', 'flatWhite'),
    sit('snack', 11, water(500)),
    sit('lunch', 13, 'chilli'),
    sit('snack', 16, 'proteinBar', 'banana'),
    sit('snack', 18.5, water(750)),
    sit('dinner', 20, 'stirFry'),
    sit('snack', 21.5, 'cottageCheese', 'mixedNuts'),
  ],
  c: [
    sit('breakfast', 7.5, 'porridge', 'blueberries', 'whey'),
    sit('snack', 10.5, water(500)),
    sit('lunch', 13.25, 'tunaBaguette', 'apple'),
    sit('snack', 16.5, 'chocolateMilk'),
    sit('dinner', 19.75, 'bolognese'),
    sit('snack', 20.5, water(500)),
    sit('snack', 21.5, 'yoghurtBowl'),
  ],
  d: [
    sit('breakfast', 8, 'eggsOnToast', 'banana'),
    sit('snack', 10.5, water(500)),
    sit('lunch', 12.5, 'caesarWrap', 'milk'),
    sit('snack', 15.75, 'pbToast'),
    sit('snack', 17.5, water(500)),
    sit('dinner', 19.25, 'steak'),
    sit('snack', 21, 'cottageCheese', 'blueberries', 'mixedNuts'),
  ],
  e: [
    sit('breakfast', 7.25, 'yoghurtBowl', 'banana', 'flatWhite'),
    sit('lunch', 12.5, 'chickenBowl'),
    sit('snack', 14, water(750)),
    sit('snack', 16, 'proteinBar', 'apple'),
    sit('dinner', 19.5, 'curry'),
    sit('snack', 21.25, 'whey', 'milk'),
  ],
  /** A Saturday out: pizza and a couple of pints, protein well short. */
  out: [
    sit('breakfast', 9.5, 'porridge'),
    sit('lunch', 13.5, 'tunaBaguette'),
    sit('snack', 16.5, 'apple'),
    sit('dinner', 20, 'pizza', 'lager'),
  ],
  /** A day that got away: travelling, grabbed what was there. */
  busy: [
    sit('breakfast', 8.5, 'flatWhite', 'banana'),
    sit('lunch', 13.5, 'caesarWrap'),
    sit('snack', 16.5, 'proteinBar'),
    sit('dinner', 20.5, 'bolognese'),
  ],
} as const satisfies Record<string, Sitting[]>

type DayType = keyof typeof DAY_TYPES

/**
 * Oldest first, ending yesterday. The demo's today is a Thursday, so index 20 (offset -1)
 * is Wednesday. The last seven days: one Saturday out, then four good days in a row.
 */
const HISTORY: DayType[] = [
  // Thu -21 to Wed -15
  'a',
  'd',
  'out',
  'c',
  'b',
  'e',
  'a',
  // Thu -14 to Wed -8
  'c',
  'b',
  'd',
  'busy',
  'a',
  'e',
  'd',
  // Thu -7 to Wed -1
  'b',
  'd',
  'out',
  'c',
  'a',
  'b',
  'e',
]

/** What is already logged today when the video opens: everything but dinner. */
const TODAY: Sitting[] = [
  sit('breakfast', 7.5, 'porridge', 'banana', 'whey'),
  sit('snack', 10.5, 'flatWhite'),
  sit('snack', 11, water(500)),
  sit('lunch', 13, 'chilli'),
  sit('snack', 14.5, water(500)),
  sit('snack', 16.25, 'pbToast', 'apple'),
  sit('snack', 17.75, water(500)),
]

export const FOOD_LOG: { offset: number; sittings: Sitting[] }[] = [
  ...HISTORY.map((type, index) => ({
    offset: index - HISTORY.length,
    sittings: [...DAY_TYPES[type]],
  })),
  { offset: 0, sittings: TODAY },
]
