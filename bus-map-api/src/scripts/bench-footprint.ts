/**
 * Bench footprint script — measure PostgreSQL table sizes for compact vs legacy pipeline.
 *
 * Modes:
 *   Measure:      --mobility-id tld-576 --output bench/snapshot.json
 *   Self-compare: --self-compare --input bench/snapshot.json
 *                 Compares legacy GTFS group vs compact GTFS group within one snapshot.
 *                 Use when both pipelines ran on the same DB.
 *   Snapshot-compare: --compare --baseline bench/legacy.json --candidate bench/compact.json
 *                 Compares total bytes across two snapshots (requires clean DB per run).
 */

import 'dotenv/config'
import { writeFile, readFile } from 'node:fs/promises'

// ── Table groups ──────────────────────────────────────────────────────────────

const LEGACY_GTFS_TABLES = new Set([
  'agencies', 'routes', 'stops', 'trips', 'stop_times',
  'shapes', 'calendars', 'calendar_dates',
])

const COMPACT_GTFS_TABLES = new Set([
  'stops_compact', 'shapes_compact', 'agencies_compact', 'routes_compact',
  'stop_patterns', 'pattern_stops', 'trips_compact', 'frequencies_compact',
  'calendar_compact', 'calendar_dates_compact',
  'feed_stops', 'feed_routes', 'feed_trips', 'feed_services', 'feed_shapes', 'feed_agencies',
])

// ── CLI arg parsing ───────────────────────────────────────────────────────────

const args = process.argv.slice(2)

const mobilityId    = args[args.indexOf('--mobility-id') + 1] ?? null
const outputPath    = args[args.indexOf('--output') + 1] ?? null
const compareMode   = args.includes('--compare')
const selfCompare   = args.includes('--self-compare')
const inputPath     = args[args.indexOf('--input') + 1] ?? null
const baselinePath  = args[args.indexOf('--baseline') + 1] ?? null
const candidatePath = args[args.indexOf('--candidate') + 1] ?? null

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(bytes: number): string {
  if (bytes === 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function groupTotal(tables: Record<string, { totalBytes: number }>, group: Set<string>): number {
  return [...group].reduce((s, t) => s + (tables[t]?.totalBytes ?? 0), 0)
}

// ── FootprintReport ───────────────────────────────────────────────────────────

interface FootprintReport {
  mobilityId: string
  capturedAt: string
  tables: Record<string, { totalBytes: number; indexBytes: number }>
  totalBytes: number
  legacyGroupBytes: number
  compactGroupBytes: number
}

// ── Self-compare mode (legacy group vs compact group in ONE snapshot) ─────────

async function runSelfCompare(input: string): Promise<void> {
  const snap = JSON.parse(await readFile(input, 'utf8')) as FootprintReport

  const legacyTotal  = snap.legacyGroupBytes  ?? groupTotal(snap.tables, LEGACY_GTFS_TABLES)
  const compactTotal = snap.compactGroupBytes ?? groupTotal(snap.tables, COMPACT_GTFS_TABLES)

  console.log('\n── Legacy GTFS tables ───────────────────────────────────────────')
  for (const tbl of [...LEGACY_GTFS_TABLES].sort()) {
    const b = snap.tables[tbl]?.totalBytes ?? 0
    if (b > 0) console.log(`  ${tbl.padEnd(36)} ${fmt(b).padStart(10)}`)
  }
  console.log(`  ${'SUBTOTAL'.padEnd(36)} ${fmt(legacyTotal).padStart(10)}`)

  console.log('\n── Compact GTFS tables ──────────────────────────────────────────')
  for (const tbl of [...COMPACT_GTFS_TABLES].sort()) {
    const b = snap.tables[tbl]?.totalBytes ?? 0
    if (b > 0) console.log(`  ${tbl.padEnd(36)} ${fmt(b).padStart(10)}`)
  }
  console.log(`  ${'SUBTOTAL'.padEnd(36)} ${fmt(compactTotal).padStart(10)}`)

  if (legacyTotal === 0) {
    console.error('\nNo legacy GTFS data found — run with legacy pipeline first to compare.')
    process.exit(1)
  }

  const reduction = ((legacyTotal - compactTotal) / legacyTotal) * 100
  console.log(`\nCompact vs Legacy reduction: ${reduction.toFixed(1)}% (SC-001 target: ≥ 70%)`)

  if (reduction < 70) {
    console.error('\n✗ FAIL: reduction < 70%')
    process.exit(1)
  }
  console.log('\n✓ PASS: reduction ≥ 70%')
}

// ── Snapshot-compare mode (two separate JSON files) ───────────────────────────

async function runCompare(baseline: string, candidate: string): Promise<void> {
  const [b, c] = await Promise.all([
    readFile(baseline, 'utf8').then((s) => JSON.parse(s) as FootprintReport),
    readFile(candidate, 'utf8').then((s) => JSON.parse(s) as FootprintReport),
  ])

  const allTables = new Set([...Object.keys(b.tables), ...Object.keys(c.tables)])
  let baseTotal = 0
  let candTotal = 0

  console.log('\nTable-level size comparison\n')
  console.log(
    `${'Table'.padEnd(40)} ${'Baseline'.padStart(12)} ${'Candidate'.padStart(12)} ${'Delta'.padStart(8)}`,
  )
  console.log('-'.repeat(76))

  for (const tbl of [...allTables].sort()) {
    const bBytes = b.tables[tbl]?.totalBytes ?? 0
    const cBytes = c.tables[tbl]?.totalBytes ?? 0
    baseTotal += bBytes
    candTotal += cBytes
    const delta = bBytes === 0 ? 'N/A' : `${(((cBytes - bBytes) / bBytes) * 100).toFixed(1)}%`
    console.log(
      `${tbl.padEnd(40)} ${fmt(bBytes).padStart(12)} ${fmt(cBytes).padStart(12)} ${delta.padStart(8)}`,
    )
  }

  console.log('-'.repeat(76))
  const totalReduction = baseTotal === 0 ? 0 : ((baseTotal - candTotal) / baseTotal) * 100
  console.log(
    `${'TOTAL'.padEnd(40)} ${fmt(baseTotal).padStart(12)} ${fmt(candTotal).padStart(12)} ${`-${totalReduction.toFixed(1)}%`.padStart(8)}`,
  )
  console.log(`\nTotal size reduction: ${totalReduction.toFixed(1)}% (SC-001 target: ≥ 70%)`)

  if (totalReduction < 70) {
    console.error('\n✗ FAIL: reduction < 70%')
    process.exit(1)
  }
  console.log('\n✓ PASS: reduction ≥ 70%')
}

// ── Measure mode ──────────────────────────────────────────────────────────────

async function runMeasure(mId: string, out: string): Promise<void> {
  const { db } = await import('../db/client.js')
  const { sql } = await import('drizzle-orm')

  const rows = await db.execute<{ table_name: string; total_bytes: number; index_bytes: number }>(
    sql`
      SELECT
        c.relname AS table_name,
        pg_total_relation_size(c.oid) AS total_bytes,
        pg_indexes_size(c.oid)        AS index_bytes
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
      ORDER BY c.relname
    `,
  )

  const tables: FootprintReport['tables'] = {}
  let totalBytes = 0

  for (const row of rows.rows) {
    tables[row.table_name] = {
      totalBytes: Number(row.total_bytes),
      indexBytes: Number(row.index_bytes),
    }
    totalBytes += Number(row.total_bytes)
  }

  const legacyGroupBytes  = groupTotal(tables, LEGACY_GTFS_TABLES)
  const compactGroupBytes = groupTotal(tables, COMPACT_GTFS_TABLES)

  const report: FootprintReport = {
    mobilityId: mId,
    capturedAt: new Date().toISOString(),
    tables,
    totalBytes,
    legacyGroupBytes,
    compactGroupBytes,
  }

  await writeFile(out, JSON.stringify(report, null, 2))

  console.log(`Footprint written to ${out}`)
  console.log(`  Total DB:      ${fmt(totalBytes)}`)
  console.log(`  Legacy group:  ${fmt(legacyGroupBytes)}`)
  console.log(`  Compact group: ${fmt(compactGroupBytes)}`)
  if (legacyGroupBytes > 0 && compactGroupBytes > 0) {
    const r = ((legacyGroupBytes - compactGroupBytes) / legacyGroupBytes) * 100
    console.log(`  Reduction:     ${r.toFixed(1)}% (legacy→compact, SC-001 target ≥ 70%)`)
  }
  process.exit(0)
}

// ── Entry ─────────────────────────────────────────────────────────────────────

if (selfCompare) {
  if (!inputPath) {
    console.error('Usage: --self-compare --input <snapshot.json>')
    process.exit(1)
  }
  runSelfCompare(inputPath).catch((err) => { console.error(err); process.exit(1) })
} else if (compareMode) {
  if (!baselinePath || !candidatePath) {
    console.error('Usage: --compare --baseline <path> --candidate <path>')
    process.exit(1)
  }
  runCompare(baselinePath, candidatePath).catch((err) => { console.error(err); process.exit(1) })
} else {
  if (!mobilityId || !outputPath) {
    console.error('Usage: --mobility-id <id> --output <path>')
    process.exit(1)
  }
  runMeasure(mobilityId, outputPath).catch((err) => { console.error(err); process.exit(1) })
}
