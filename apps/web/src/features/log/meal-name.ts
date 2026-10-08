/** The longest name a saved meal can have; matches `savedMealInputSchema` in shared. */
export const MAX_MEAL_NAME_LENGTH = 80

const LEAD_INS =
  /^(?:(?:i|we)(?:'m|'ve|\s+am|\s+have|\s+are)?\s+)?(?:just\s+)?(?:had|ate|eaten|having|have\s+had|have\s+eaten|am\s+having|was\s+having)[\s,:]+/i
const MEAL_OF_DAY =
  /^(?:for|at)\s+(?:breakfast|lunch|dinner|tea|supper|brunch|a\s+snack|snack)[\s,:]+/i

/**
 * A starting name for "Add to meals", taken from what was typed: "I had 4 eggs and toast"
 * becomes "4 eggs and toast". Only the obvious lead-ins go; the person can still edit it.
 * Returns an empty string when nothing is left, so the field shows its placeholder.
 */
export function suggestMealName(text: string): string {
  let name = text.replace(/\s+/g, ' ').trim()
  for (let pass = 0; pass < 2; pass += 1) {
    name = name.replace(LEAD_INS, '').replace(MEAL_OF_DAY, '')
  }
  name = name.replace(/[.!,;:\s]+$/, '').trim()
  if (name.length > MAX_MEAL_NAME_LENGTH) {
    const cut = name.slice(0, MAX_MEAL_NAME_LENGTH)
    const lastSpace = cut.lastIndexOf(' ')
    name = (lastSpace > MAX_MEAL_NAME_LENGTH / 2 ? cut.slice(0, lastSpace) : cut).trim()
  }
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : ''
}
