import { parse } from 'csv-parse/sync'
import { sql } from 'drizzle-orm'
import { calendarCompact, calendarDatesCompact } from '../../db/schema.js'
import type { DrizzleDb } from '../../db/client.js'
import type { IdMapper } from '../../lib/id-mapper.js'

const BATCH_SIZE = 500

function parseCsv(content: Buffer): Record<string, string>[] {
  return parse(content, { columns: true, skip_empty_lines: true, trim: true, bom: true, relax_column_count: true, relax_quotes: true }) as Record<string, string>[]
}

export async function runCalendarStage(
  db: DrizzleDb,
  feedId: string,
  serviceMapper: IdMapper,
  readFile: (name: string) => Buffer | null,
): Promise<void> {
  const calFile = readFile('calendar.txt')
  if (calFile) {
    const rows = parseCsv(calFile)
    await serviceMapper.bulkGetOrCreate(rows.map((r) => r['service_id']))

    for (const row of rows) {
      const serviceInternalId = await serviceMapper.getOrCreate(row['service_id'])
      await db
        .insert(calendarCompact)
        .values({
          feedId,
          serviceInternalId,
          monday: row['monday'] === '1',
          tuesday: row['tuesday'] === '1',
          wednesday: row['wednesday'] === '1',
          thursday: row['thursday'] === '1',
          friday: row['friday'] === '1',
          saturday: row['saturday'] === '1',
          sunday: row['sunday'] === '1',
          startDate: row['start_date'],
          endDate: row['end_date'],
        })
        .onConflictDoUpdate({
          target: [calendarCompact.feedId, calendarCompact.serviceInternalId],
          set: {
            monday: sql`excluded.monday`,
            tuesday: sql`excluded.tuesday`,
            wednesday: sql`excluded.wednesday`,
            thursday: sql`excluded.thursday`,
            friday: sql`excluded.friday`,
            saturday: sql`excluded.saturday`,
            sunday: sql`excluded.sunday`,
            startDate: sql`excluded.start_date`,
            endDate: sql`excluded.end_date`,
          },
        })
    }
  }

  const calDatesFile = readFile('calendar_dates.txt')
  if (calDatesFile) {
    const rows = parseCsv(calDatesFile)
    await serviceMapper.bulkGetOrCreate([...new Set(rows.map((r) => r['service_id']))])

    type DateRow = { serviceInternalId: number; date: string; exceptionType: number }
    const batch: DateRow[] = []

    for (const row of rows) {
      const serviceInternalId = await serviceMapper.getOrCreate(row['service_id'])
      batch.push({
        serviceInternalId,
        date: row['date'],
        exceptionType: parseInt(row['exception_type'], 10),
      })

      if (batch.length >= BATCH_SIZE) {
        await flushCalendarDates(db, feedId, batch.splice(0))
      }
    }
    if (batch.length > 0) await flushCalendarDates(db, feedId, batch)
  }
}

async function flushCalendarDates(
  db: DrizzleDb,
  feedId: string,
  rows: Array<{ serviceInternalId: number; date: string; exceptionType: number }>,
): Promise<void> {
  // Deduplicate within the batch: same (serviceInternalId, date) twice in one INSERT
  // causes "ON CONFLICT DO UPDATE command cannot affect row a second time".
  const seen = new Map<string, typeof rows[0]>()
  for (const row of rows) seen.set(`${row.serviceInternalId}:${row.date}`, row)
  const deduped = [...seen.values()]

  await db
    .insert(calendarDatesCompact)
    .values(deduped.map((r) => ({ feedId, serviceInternalId: r.serviceInternalId, date: r.date, exceptionType: r.exceptionType })))
    .onConflictDoUpdate({
      target: [calendarDatesCompact.feedId, calendarDatesCompact.serviceInternalId, calendarDatesCompact.date],
      set: { exceptionType: sql`excluded.exception_type` },
    })
}
