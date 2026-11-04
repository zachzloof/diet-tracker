import { describe, expect, it } from 'vitest'
import { addLabel, slotName } from './log-slot'

describe('where a confirm puts the food', () => {
  it('names the meal until the food is planned', () => {
    expect(slotName('dinner', false)).toBe('dinner')
    expect(slotName('dinner', true)).toBe('planned')
  })

  it('says so on the button, online and off', () => {
    expect(addLabel('lunch', false, true)).toBe('Add to lunch')
    expect(addLabel('lunch', true, true)).toBe('Add to planned')
    expect(addLabel('lunch', true, false)).toBe('Add to planned (offline)')
  })
})
