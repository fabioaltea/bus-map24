import { describe, it, expect, vi } from 'vitest'
import { IdMapper } from '../../src/lib/id-mapper.js'

const makeMockDb = (internalId = 42) => {
  const mockExecute = vi
    .fn()
    .mockImplementation(async () => ({ rows: [{ internal_id: internalId }] }))
  const mockDb = { execute: mockExecute } as unknown as typeof import('../../src/db/client.js').db
  return { mockDb, mockExecute }
}

describe('IdMapper', () => {
  describe('getOrCreate — idempotency', () => {
    it('returns the same internalId for the same externalId called twice', async () => {
      const { mockDb } = makeMockDb(42)
      const mapper = new IdMapper(mockDb, 'feed-uuid-001', 'stops')

      const first = await mapper.getOrCreate('stop-A')
      const second = await mapper.getOrCreate('stop-A')

      expect(first).toBe(42)
      expect(second).toBe(42)
    })
  })

  describe('reverse — consistency', () => {
    it('reverse(getOrCreate(x)) returns x', async () => {
      const { mockDb } = makeMockDb(7)
      const mapper = new IdMapper(mockDb, 'feed-uuid-001', 'routes')

      const internalId = await mapper.getOrCreate('route-X')
      const externalId = await mapper.reverse(internalId)

      expect(externalId).toBe('route-X')
    })
  })

  describe('per-feed scoping', () => {
    it('two mappers with different feedIds have independent mappings', async () => {
      const executeA = vi.fn().mockResolvedValue({ rows: [{ internal_id: 1 }] })
      const executeB = vi.fn().mockResolvedValue({ rows: [{ internal_id: 1 }] })

      const dbA = { execute: executeA } as unknown as typeof import('../../src/db/client.js').db
      const dbB = { execute: executeB } as unknown as typeof import('../../src/db/client.js').db

      const mapperA = new IdMapper(dbA, 'feed-uuid-aaa', 'trips')
      const mapperB = new IdMapper(dbB, 'feed-uuid-bbb', 'trips')

      await mapperA.getOrCreate('trip-1')
      await mapperB.getOrCreate('trip-1')

      expect(executeA).toHaveBeenCalledTimes(1)
      expect(executeB).toHaveBeenCalledTimes(1)
    })
  })

  describe('in-memory cache', () => {
    it('second call to getOrCreate with same id does not call db.execute again', async () => {
      const { mockDb, mockExecute } = makeMockDb(99)
      const mapper = new IdMapper(mockDb, 'feed-uuid-001', 'agencies')

      await mapper.getOrCreate('agency-Z')
      await mapper.getOrCreate('agency-Z')

      expect(mockExecute).toHaveBeenCalledTimes(1)
    })
  })
})
