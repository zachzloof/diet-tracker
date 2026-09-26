import { getConnInfo } from '@hono/node-server/conninfo'
import type { Context } from 'hono'

/**
 * In-memory sliding-window limiter. One API instance serves everyone, so a process-local
 * map is enough; move the hits into Postgres or Redis if the API ever scales out.
 */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>()

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  /** Seconds until `key` is allowed again, or 0 if it is allowed now. */
  retryAfter(key: string, now: number = Date.now()): number {
    const stamps = this.prune(key, now)
    if (stamps.length < this.max) return 0
    const oldest = stamps[0] ?? now
    return Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000))
  }

  hit(key: string, now: number = Date.now()): void {
    const stamps = this.prune(key, now)
    stamps.push(now)
    this.hits.set(key, stamps)
  }

  reset(key: string): void {
    this.hits.delete(key)
  }

  clear(): void {
    this.hits.clear()
  }

  /** Drops expired timestamps so the map does not grow without bound. */
  sweep(now: number = Date.now()): void {
    for (const key of this.hits.keys()) this.prune(key, now)
  }

  private prune(key: string, now: number): number[] {
    const cutoff = now - this.windowMs
    const stamps = (this.hits.get(key) ?? []).filter((t) => t > cutoff)
    if (stamps.length === 0) this.hits.delete(key)
    else this.hits.set(key, stamps)
    return stamps
  }
}

const MINUTE = 60_000

/** Failed logins per email: 10 in 15 minutes. Protects one account from guessing. */
export const loginEmailLimiter = new SlidingWindowLimiter(10, 15 * MINUTE)
/** Failed logins per IP: 30 in 15 minutes. Slows spraying across accounts. */
export const loginIpLimiter = new SlidingWindowLimiter(30, 15 * MINUTE)
/** Registrations per IP: 10 per hour. */
export const registerIpLimiter = new SlidingWindowLimiter(10, 60 * MINUTE)
/** Wrong-password attempts on change password or delete account, per user: 10 in 15 minutes. */
export const passwordAttemptLimiter = new SlidingWindowLimiter(10, 15 * MINUTE)

const limiters = [loginEmailLimiter, loginIpLimiter, registerIpLimiter, passwordAttemptLimiter]

export function sweepRateLimits(): void {
  for (const limiter of limiters) limiter.sweep()
}

/** Test helper. */
export function resetRateLimits(): void {
  for (const limiter of limiters) limiter.clear()
}

/**
 * Best-effort client address. Railway's edge appends the real client to
 * `x-forwarded-for`, so the last entry is the trustworthy one behind exactly one proxy.
 * Locally there is no proxy and the socket address is used.
 */
export function clientIp(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for')
  if (forwarded) {
    const parts = forwarded
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
    const last = parts.at(-1)
    if (last) return last
  }
  try {
    return getConnInfo(c).remote.address ?? 'unknown'
  } catch {
    return 'unknown'
  }
}
