import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema.js'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 10_000,       // evict idle connections before Railway proxy (~30s) kills them
  connectionTimeoutMillis: 10_000,
  keepAlive: true,                  // TCP keepalive to detect dead connections early
  keepAliveInitialDelayMillis: 5_000,
})

// Evict errored connections so the pool doesn't hand out dead ones on next query
pool.on('error', (err) => {
  console.error('[db] pool connection error (evicted):', err.message)
})

export const db = drizzle(pool, { schema })
export type DrizzleDb = typeof db
