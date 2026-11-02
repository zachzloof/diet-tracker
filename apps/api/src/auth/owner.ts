import { env } from '../env.js'

/**
 * The owner (slice 11c, D42): the one account named by `OWNER_EMAIL`, compared without
 * case the way `users.email` (citext) is. Unset means nobody is the owner, so the cost
 * view does not exist on that deployment. There is no role column: one person runs this
 * app for friends, and an env var is the cheapest thing that cannot be set from the app.
 */
export function isOwner(email: string): boolean {
  const owner = env.OWNER_EMAIL
  return typeof owner === 'string' && owner.trim().toLowerCase() === email.trim().toLowerCase()
}
