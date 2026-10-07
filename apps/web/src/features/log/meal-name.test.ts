import { describe, expect, it } from 'vitest'
import { MAX_MEAL_NAME_LENGTH, suggestMealName } from './meal-name'

describe('suggestMealName', () => {
  it('drops the lead-in and capitalises', () => {
    expect(suggestMealName('I had 4 eggs and two slices of toast')).toBe(
      '4 eggs and two slices of toast',
    )
    expect(suggestMealName('ate a chicken burrito with guac.')).toBe('A chicken burrito with guac')
    expect(suggestMealName("I'm having oats, milk and a banana")).toBe('Oats, milk and a banana')
  })

  it('drops the meal of the day when it comes first', () => {
    expect(suggestMealName('for breakfast I had porridge and a coffee')).toBe(
      'Porridge and a coffee',
    )
    expect(suggestMealName('I had, for lunch, a tuna sandwich')).toBe('A tuna sandwich')
  })

  it('keeps plain text as it is, tidied', () => {
    expect(suggestMealName('  protein   oats with berries ')).toBe('Protein oats with berries')
    expect(suggestMealName('')).toBe('')
    expect(suggestMealName('I had')).toBe('I had')
  })

  it('cuts a long description at a word', () => {
    const long = 'two eggs scrambled with spinach, '.repeat(5) + 'and a very long tail of words'
    const name = suggestMealName(long)
    expect(name.length).toBeLessThanOrEqual(MAX_MEAL_NAME_LENGTH)
    expect(name.endsWith(' ')).toBe(false)
    expect(name.endsWith(',')).toBe(false)
  })
})
