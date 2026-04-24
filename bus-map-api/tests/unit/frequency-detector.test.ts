import { describe, it, expect } from 'vitest'
import { collapseToFrequencies } from '../../src/lib/frequency-detector.js'

describe('collapseToFrequencies', () => {
  it('run of exactly 4 evenly-spaced trips (600s headway) → 1 FrequencyRun', () => {
    const times = [0, 600, 1200, 1800]
    const runs = collapseToFrequencies(times)
    expect(runs).toHaveLength(1)
    expect(runs[0].headwaySec).toBe(600)
    expect(runs[0].startTimeSec).toBe(0)
    expect(runs[0].endTimeSec).toBe(2400)
    expect(runs[0].startIdx).toBe(0)
    expect(runs[0].endIdx).toBe(3)
  })

  it('run of 10 evenly-spaced trips → 1 run with correct start/end/headway', () => {
    const times = Array.from({ length: 10 }, (_, i) => i * 300)
    const runs = collapseToFrequencies(times)
    expect(runs).toHaveLength(1)
    expect(runs[0].headwaySec).toBe(300)
    expect(runs[0].startIdx).toBe(0)
    expect(runs[0].endIdx).toBe(9)
    expect(runs[0].endTimeSec).toBe(9 * 300 + 300)
  })

  it('uneven gaps (600, 600, 720) for 4 trips → no collapse', () => {
    const times = [0, 600, 1200, 1920]
    const runs = collapseToFrequencies(times)
    expect(runs).toHaveLength(0)
  })

  it('mixed: evenly-spaced prefix + isolated tail', () => {
    const times = [0, 600, 1200, 1800, 2400, 5000, 5700]
    const runs = collapseToFrequencies(times)
    // First 5 form a run with 600s headway
    expect(runs).toHaveLength(1)
    expect(runs[0].startIdx).toBe(0)
    expect(runs[0].endIdx).toBe(4)
    expect(runs[0].headwaySec).toBe(600)
  })

  it('empty input → []', () => {
    expect(collapseToFrequencies([])).toEqual([])
  })

  it('3 evenly-spaced trips → [] (below threshold of 4)', () => {
    const times = [0, 600, 1200]
    expect(collapseToFrequencies(times)).toHaveLength(0)
  })
})
