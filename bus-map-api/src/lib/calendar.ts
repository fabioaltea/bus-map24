/**
 * GTFS calendar resolution helpers.
 * Determines whether a given service_id is active on a specific date,
 * taking into account both calendar.txt (weekly schedule) and
 * calendar_dates.txt (exception overrides).
 */

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const
type DayName = (typeof DAY_NAMES)[number]

export interface CalendarRow {
  serviceId: string
  monday: boolean
  tuesday: boolean
  wednesday: boolean
  thursday: boolean
  friday: boolean
  saturday: boolean
  sunday: boolean
  startDate: string // 'YYYY-MM-DD'
  endDate: string   // 'YYYY-MM-DD'
}

export interface CalendarDateRow {
  serviceId: string
  date: string          // 'YYYY-MM-DD'
  exceptionType: number // 1 = added, 2 = removed
}

/**
 * Returns the ISO date string 'YYYY-MM-DD' for a given Date object
 * in local time (avoids UTC offset surprises when comparing GTFS dates).
 */
export function toGtfsDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Resolves whether a service is active on `date` using the provided
 * calendar row and any exception overrides for that date.
 *
 * @param calendar  The calendar row for this service (may be null if service
 *                  only appears in calendar_dates)
 * @param exceptions  All calendar_dates rows for this service on `date`
 * @param date  ISO date string 'YYYY-MM-DD'
 */
export function isServiceActive(
  calendar: CalendarRow | null,
  exceptions: CalendarDateRow[],
  date: string,
): boolean {
  // Check exceptions first (they override the weekly schedule)
  for (const ex of exceptions) {
    if (ex.date === date) {
      return ex.exceptionType === 1
    }
  }

  if (!calendar) return false

  // Check date range
  if (date < calendar.startDate || date > calendar.endDate) return false

  // Map date to day-of-week column
  const d = new Date(date + 'T00:00:00')
  const dayName = DAY_NAMES[d.getDay()] as DayName
  return calendar[dayName]
}
