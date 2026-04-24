/**
 * Runtime guard: assert no internal_id key leaks into serialised HTTP responses.
 * Called before reply.send() in routes that touch compact tables.
 */

export function assertNoInternalIdLeak(value: unknown, path = ''): void {
  if (value === null || value === undefined) return
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertNoInternalIdLeak(item, `${path}[${i}]`))
    return
  }
  if (typeof value === 'object') {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      if (key === 'internal_id' || key === 'internalId') {
        throw new Error(
          `CONTRACT VIOLATION: internal_id leaked into response at path "${path}.${key}"`,
        )
      }
      assertNoInternalIdLeak((value as Record<string, unknown>)[key], `${path}.${key}`)
    }
  }
}
