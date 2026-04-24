import { parse } from 'csv-parse/sync'
import { sql } from 'drizzle-orm'
import type { DrizzleDb } from '../../db/client.js'
import type { IdMapper } from '../../lib/id-mapper.js'

function parseCsv(content: Buffer): Record<string, string>[] {
  return parse(content, { columns: true, skip_empty_lines: true, trim: true, bom: true }) as Record<string, string>[]
}

export async function runCalendarStage(
  db: DrizzleDb,
  feedId: string,
  serviceMapper: IdMapper,
  readFile: (name: string) => Buffer | null,
): Promise<void> {
  const calFile = readFile('calendar.txt')
  if (calFile) {
    for (const row of parseCsv(calFile)) {
      const serviceInternalId = await serviceMapper.getOrCreate(row['service_id'])
      await db.execute(sql`
        INSERT INTO calendar_compact
          (feed_id, service_internal_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date)
        VALUES (
          ${feedId}::uuid,
          ${serviceInternalId},
          ${row['monday'] === '1'},
          ${row['tuesday'] === '1'},
          ${row['wednesday'] === '1'},
          ${row['thursday'] === '1'},
          ${row['friday'] === '1'},
          ${row['saturday'] === '1'},
          ${row['sunday'] === '1'},
          ${row['start_date']}::date,
          ${row['end_date']}::date
        )
        ON CONFLICT (feed_id, service_internal_id) DO UPDATE
          SET monday = EXCLUDED.monday,
              tuesday = EXCLUDED.tuesday,
              wednesday = EXCLUDED.wednesday,
              thursday = EXCLUDED.thursday,
              friday = EXCLUDED.friday,
              saturday = EXCLUDED.saturday,
              sunday = EXCLUDED.sunday,
              start_date = EXCLUDED.start_date,
              end_date = EXCLUDED.end_date
      `)
    }
  }

  const calDatesFile = readFile('calendar_dates.txt')
  if (calDatesFile) {
    for (const row of parseCsv(calDatesFile)) {
      const serviceInternalId = await serviceMapper.getOrCreate(row['service_id'])
      await db.execute(sql`
        INSERT INTO calendar_dates_compact
          (feed_id, service_internal_id, date, exception_type)
        VALUES (
          ${feedId}::uuid,
          ${serviceInternalId},
          ${row['date']}::date,
          ${parseInt(row['exception_type'], 10)}
        )
        ON CONFLICT (feed_id, service_internal_id, date) DO UPDATE
          SET exception_type = EXCLUDED.exception_type
      `)
    }
  }
}
