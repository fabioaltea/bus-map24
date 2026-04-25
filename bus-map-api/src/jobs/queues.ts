import { Queue } from 'bullmq'
import { Redis } from 'ioredis'

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379'

// Shared connection (BullMQ requires a dedicated connection per queue/worker)
function makeConnection() {
  return new Redis(redisUrl, { maxRetriesPerRequest: null })
}

// ── Queue names ──────────────────────────────────────────────────────────────

export const QUEUE_CATALOG_SYNC = 'catalog-sync'
export const QUEUE_FEED_DOWNLOAD = 'feed-download'
export const QUEUE_TILE_GEN = 'tile-gen'

// ── Default job options ──────────────────────────────────────────────────────

const DEFAULT_ATTEMPTS = 5
const BACKOFF_DELAY_MS = 30_000 // Railway DB recovery takes 30-60s; schedule: 30s, 60s, 120s, 240s

// ── Queues ───────────────────────────────────────────────────────────────────

export const catalogSyncQueue = new Queue(QUEUE_CATALOG_SYNC, {
  connection: makeConnection(),
  defaultJobOptions: {
    attempts: DEFAULT_ATTEMPTS,
    backoff: { type: 'exponential', delay: BACKOFF_DELAY_MS },
    removeOnComplete: { count: 20 },
    removeOnFail: { count: 50 },
  },
})

export const feedDownloadQueue = new Queue(QUEUE_FEED_DOWNLOAD, {
  connection: makeConnection(),
  defaultJobOptions: {
    attempts: DEFAULT_ATTEMPTS,
    backoff: { type: 'exponential', delay: BACKOFF_DELAY_MS },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 100 },
  },
})

export const tileGenQueue = new Queue(QUEUE_TILE_GEN, {
  connection: makeConnection(),
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 10_000 },
    removeOnComplete: { count: 20 },
    removeOnFail: { count: 50 },
  },
})

// ── Job payload types ────────────────────────────────────────────────────────

export interface CatalogSyncJobData {
  /** Force re-download of catalog CSV even if recently fetched */
  force?: boolean
}

export interface FeedDownloadJobData {
  feedId: string
  mobilityDbId: string
  downloadUrl: string
  forceRefresh?: boolean
}

export interface TileGenJobData {
  feedId: string
  /** Output PMTiles archive path (relative to tile output dir) */
  outputPath: string
}

// ── Graceful shutdown ────────────────────────────────────────────────────────

export async function closeQueues(): Promise<void> {
  await Promise.all([catalogSyncQueue.close(), feedDownloadQueue.close(), tileGenQueue.close()])
}
