import { hash, verify } from '@node-rs/argon2'

/**
 * argon2id with the OWASP-recommended minimum (19 MiB, 2 passes, 1 lane). These are also
 * the library defaults, and the algorithm default is argon2id; a test pins both.
 */
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS)
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password)
  } catch {
    return false
  }
}
