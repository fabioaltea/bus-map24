import { Worker } from 'bullmq'
import { Redis } from 'ioredis'
import { QUEUE_CATALOG_SYNC, type CatalogSyncJobData } from '../queues.js'
import { runCatalogSync } from '../catalog-sync.job.js'

const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})

export const catalogSyncWorker = new Worker<CatalogSyncJobData>(
  QUEUE_CATALOG_SYNC,
  async (job) => {
    console.log(`[catalog-sync] starting job ${job.id}`)
    await runCatalogSync(job.data)
  },
  {
    connection,
    concurrency: 1, // catalog sync is inherently serial
  },
)

catalogSyncWorker.on('failed', (job, err) => {
  console.error(`[catalog-sync] job ${job?.id} failed:`, err.message)
})
