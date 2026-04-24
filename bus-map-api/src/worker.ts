import 'dotenv/config'
import { catalogSyncWorker } from './jobs/workers/catalog-sync.worker.js'
import { feedDownloadWorker } from './jobs/workers/feed-download.worker.js'

console.log('[worker] BullMQ workers started')

async function shutdown() {
  console.log('[worker] shutting down...')
  await Promise.all([catalogSyncWorker.close(), feedDownloadWorker.close()])
  console.log('[worker] shutdown complete')
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
