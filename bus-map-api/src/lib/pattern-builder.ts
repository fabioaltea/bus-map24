import xxhash from 'xxhash-wasm'

export interface PatternStop {
  stopInternalId: number
  offsetArrivalSec: number
  offsetDepartureSec: number
}

export interface Pattern {
  stops: PatternStop[]
  hash: bigint
}

export const PATTERN_HASH_SEED = 0x54455354n

export async function hashPattern(stops: PatternStop[]): Promise<bigint> {
  const { h64Raw } = await xxhash()
  const buffer = new Int32Array(stops.length * 3)
  for (let i = 0; i < stops.length; i++) {
    buffer[i * 3 + 0] = stops[i].stopInternalId
    buffer[i * 3 + 1] = stops[i].offsetArrivalSec
    buffer[i * 3 + 2] = stops[i].offsetDepartureSec
  }
  const raw = h64Raw(new Uint8Array(buffer.buffer), PATTERN_HASH_SEED)
  // xxhash returns uint64; PostgreSQL bigint is signed int64 — convert via two's complement
  return raw > 9223372036854775807n ? raw - 18446744073709551616n : raw
}

export async function buildPattern(
  stopTimes: Array<{
    stopInternalId: number
    arrivalSec: number
    departureSec: number
  }>,
): Promise<Pattern> {
  if (stopTimes.length === 0) {
    const hash = await hashPattern([])
    return { stops: [], hash }
  }

  const baseArrivalSec = stopTimes[0].arrivalSec

  const stops: PatternStop[] = stopTimes.map((row) => ({
    stopInternalId: row.stopInternalId,
    offsetArrivalSec: row.arrivalSec - baseArrivalSec,
    offsetDepartureSec: row.departureSec - baseArrivalSec,
  }))

  const hash = await hashPattern(stops)
  return { stops, hash }
}
