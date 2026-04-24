import { describe, it, expect } from 'vitest'
import { buildPattern, hashPattern, PATTERN_HASH_SEED } from '../../src/lib/pattern-builder.js'

describe('buildPattern / hashPattern', () => {
  it('two trips with identical stop sequences produce the same hash', async () => {
    const tripA = [
      { stopInternalId: 1, arrivalSec: 3600, departureSec: 3610 },
      { stopInternalId: 2, arrivalSec: 3700, departureSec: 3710 },
      { stopInternalId: 3, arrivalSec: 3800, departureSec: 3810 },
    ]
    const tripB = [
      { stopInternalId: 1, arrivalSec: 7200, departureSec: 7210 },
      { stopInternalId: 2, arrivalSec: 7300, departureSec: 7310 },
      { stopInternalId: 3, arrivalSec: 7400, departureSec: 7410 },
    ]
    const patternA = await buildPattern(tripA)
    const patternB = await buildPattern(tripB)
    expect(patternA.hash).toBe(patternB.hash)
  })

  it('trips with different stop sequences produce different hashes', async () => {
    const tripA = [
      { stopInternalId: 1, arrivalSec: 3600, departureSec: 3610 },
      { stopInternalId: 2, arrivalSec: 3700, departureSec: 3710 },
    ]
    const tripB = [
      { stopInternalId: 1, arrivalSec: 3600, departureSec: 3610 },
      { stopInternalId: 99, arrivalSec: 3700, departureSec: 3710 },
    ]
    const patternA = await buildPattern(tripA)
    const patternB = await buildPattern(tripB)
    expect(patternA.hash).not.toBe(patternB.hash)
  })

  it('preserves overnight times (>24:00:00) and computes offsets correctly', async () => {
    const stopTimes = [
      { stopInternalId: 10, arrivalSec: 90000, departureSec: 90060 },
      { stopInternalId: 11, arrivalSec: 90600, departureSec: 90660 },
    ]
    const pattern = await buildPattern(stopTimes)
    expect(pattern.stops).toHaveLength(2)
    expect(pattern.stops[0].offsetArrivalSec).toBe(0)
    expect(pattern.stops[0].offsetDepartureSec).toBe(60)
    expect(pattern.stops[1].offsetArrivalSec).toBe(600)
    expect(pattern.stops[1].offsetDepartureSec).toBe(660)
  })

  it('handles single-stop input without crashing', async () => {
    const stopTimes = [{ stopInternalId: 5, arrivalSec: 5000, departureSec: 5010 }]
    const pattern = await buildPattern(stopTimes)
    expect(pattern.stops).toHaveLength(1)
    expect(pattern.stops[0].stopInternalId).toBe(5)
    expect(pattern.stops[0].offsetArrivalSec).toBe(0)
    expect(pattern.stops[0].offsetDepartureSec).toBe(10)
    expect(typeof pattern.hash).toBe('bigint')
  })

  it('empty stop_times returns empty pattern with hash of empty buffer', async () => {
    const pattern = await buildPattern([])
    expect(pattern.stops).toHaveLength(0)
    const emptyHash = await hashPattern([])
    expect(pattern.hash).toBe(emptyHash)
    expect(typeof pattern.hash).toBe('bigint')
  })

  it('PATTERN_HASH_SEED is the expected constant', () => {
    expect(PATTERN_HASH_SEED).toBe(0x54455354n)
  })
})
