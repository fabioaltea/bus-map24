import { Worker } from 'bullmq'
import { Redis } from 'ioredis'
import { QUEUE_FEED_DOWNLOAD, type FeedDownloadJobData } from '../queues.js'
import { runFeedDownload } from '../feed-download.job.js'

const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})

const MAX_WORKERS = parseInt(process.env.MAX_DOWNLOAD_WORKERS ?? '3', 10)

export const feedDownloadWorker = new Worker<FeedDownloadJobData>(
  QUEUE_FEED_DOWNLOAD,
  async (job) => {
    console.log(`[feed-download] starting job ${job.id} — ${job.data.mobilityDbId}`)
    await runFeedDownload(job.data)
  },
  {
    connection,
    concurrency: MAX_WORKERS,
  },
)

feedDownloadWorker.on('failed', (job, err) => {
  console.error(`[feed-download] job ${job?.id} (${job?.data.mobilityDbId}) failed:`, err.message)
})
