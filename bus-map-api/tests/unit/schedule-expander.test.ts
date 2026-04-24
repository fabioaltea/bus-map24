/**
 * T037 — Unit test: schedule expansion reconstructs HH:MM:SS from pattern offsets.
 */

import { describe, it, expect } from 'vitest'

function secToHms(sec: number): string {
  const h = String(Math.floor(sec / 3600)).padStart(2, '0')
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0')
  const s = String(sec % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

function expandDeparture(startTimeSec: number, offsetDepartureSec: number): string {
  return secToHms(startTimeSec + offsetDepartureSec)
}

describe('Schedule expansion', () => {
  it('reconstructs HH:MM:SS from trip start + offset', () => {
    // Trip starts at 08:00:00 = 28800s, stop offset = 600s → 08:10:00
    expect(expandDeparture(28800, 600)).toBe('08:10:00')
  })

  it('handles midnight boundary (0s start, 0s offset)', () => {
    expect(expandDeparture(0, 0)).toBe('00:00:00')
  })

  it('handles overnight 24:00:00+ times', () => {
    // start = 24:00:00 = 86400s, offset = 300s → 24:05:00
    expect(expandDeparture(86400, 300)).toBe('24:05:00')
  })

  it('handles 25:30:45', () => {
    const sec = 25 * 3600 + 30 * 60 + 45
    expect(expandDeparture(sec, 0)).toBe('25:30:45')
  })

  it('two trips with same pattern offsets differ only in start_time_sec', () => {
    // Both trips serve the same pattern (offset 1800s), but different start times
    expect(expandDeparture(28800, 1800)).toBe('08:30:00') // 08:00 start
    expect(expandDeparture(36000, 1800)).toBe('10:30:00') // 10:00 start
  })
})
