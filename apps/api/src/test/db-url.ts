/** Tests run against `diet_tracker_test` on the same server as DATABASE_URL. */
export const TEST_DB_NAME = 'diet_tracker_test'

export function testDatabaseUrl(base: string): string {
  const url = new URL(base)
  url.pathname = `/${TEST_DB_NAME}`
  return url.toString()
}

export function adminDatabaseUrl(base: string): string {
  const url = new URL(base)
  url.pathname = '/postgres'
  return url.toString()
}
