import 'dotenv/config'
import { createServer, type Server } from 'node:http'
import { catalogSyncWorker } from './jobs/workers/catalog-sync.worker.js'
import { feedDownloadWorker } from './jobs/workers/feed-download.worker.js'
import { catalogSyncQueue } from './jobs/queues.js'

console.log('[worker] BullMQ workers started')

async function ensureCatalogSyncSchedule() {
  const cronPattern = process.env.FEED_REFRESH_CRON?.trim()
  if (!cronPattern) {
    console.log('[worker] FEED_REFRESH_CRON not set, periodic catalog sync disabled')
    return
  }

  await catalogSyncQueue.add(
    'catalog-sync',
    { force: false },
    {
      jobId: 'catalog-sync:scheduled',
      repeat: { pattern: cronPattern },
    }
  )

  console.log(`[worker] catalog-sync schedule enabled (${cronPattern})`)
}

void ensureCatalogSyncSchedule().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  console.error('[worker] failed to enable catalog-sync schedule:', message)
})

catalogSyncWorker.on('ready', () => {
  console.log('[worker] catalog-sync worker ready')
})

feedDownloadWorker.on('ready', () => {
  console.log('[worker] feed-download worker ready')
})

catalogSyncWorker.on('error', (err) => {
  console.error('[worker] catalog-sync worker error:', err.message)
})

feedDownloadWorker.on('error', (err) => {
  console.error('[worker] feed-download worker error:', err.message)
})

let healthServer: Server | null = null
const healthPort = Number.parseInt(process.env.PORT ?? '', 10)

if (Number.isFinite(healthPort) && healthPort > 0) {
  healthServer = createServer((req, res) => {
    if (req.url === '/healthz') {
      res.statusCode = 200
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ status: 'ok' }))
      return
    }

    res.statusCode = 404
    res.end('Not Found')
  })

  healthServer.listen(healthPort, '0.0.0.0', () => {
    console.log(`[worker] health server listening on :${healthPort}`)
  })
}

async function shutdown() {
  console.log('[worker] shutting down...')
  if (healthServer) {
    await new Promise<void>((resolve) => {
      healthServer!.close(() => resolve())
    })
  }
  await Promise.all([catalogSyncWorker.close(), feedDownloadWorker.close()])
  console.log('[worker] shutdown complete')
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
