import { describe, it, expect } from 'vitest'
import { isServiceActive, toGtfsDate, type CalendarRow, type CalendarDateRow } from '../../src/lib/calendar.js'

const baseCalendar: CalendarRow = {
  serviceId: 'WD',
  monday: true,
  tuesday: true,
  wednesday: true,
  thursday: true,
  friday: true,
  saturday: false,
  sunday: false,
  startDate: '2024-01-01',
  endDate: '2024-12-31',
}

describe('toGtfsDate', () => {
  it('formats a Date to YYYY-MM-DD', () => {
    expect(toGtfsDate(new Date('2024-06-15T00:00:00'))).toBe('2024-06-15')
  })
})

describe('isServiceActive', () => {
  it('returns true for a weekday within range', () => {
    // 2024-04-15 is a Monday
    expect(isServiceActive(baseCalendar, [], '2024-04-15')).toBe(true)
  })

  it('returns false for a weekend when saturday/sunday are false', () => {
    // 2024-04-13 is a Saturday
    expect(isServiceActive(baseCalendar, [], '2024-04-13')).toBe(false)
  })

  it('returns false when date is outside range', () => {
    expect(isServiceActive(baseCalendar, [], '2025-01-01')).toBe(false)
  })

  it('exception type 1 adds service on a normally inactive day', () => {
    const exceptions: CalendarDateRow[] = [
      { serviceId: 'WD', date: '2024-04-13', exceptionType: 1 },
    ]
    expect(isServiceActive(baseCalendar, exceptions, '2024-04-13')).toBe(true)
  })

  it('exception type 2 removes service on a normally active day', () => {
    const exceptions: CalendarDateRow[] = [
      { serviceId: 'WD', date: '2024-04-15', exceptionType: 2 },
    ]
    expect(isServiceActive(baseCalendar, exceptions, '2024-04-15')).toBe(false)
  })

  it('returns false when calendar is null and no add exception', () => {
    expect(isServiceActive(null, [], '2024-04-15')).toBe(false)
  })

  it('handles calendar_dates-only service (null calendar, add exception)', () => {
    const exceptions: CalendarDateRow[] = [
      { serviceId: 'SPECIAL', date: '2024-12-25', exceptionType: 1 },
    ]
    expect(isServiceActive(null, exceptions, '2024-12-25')).toBe(true)
  })
})
