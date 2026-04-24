import 'dotenv/config'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import { join } from 'path'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const db = drizzle(pool)

try {
  await migrate(db, { migrationsFolder: join(process.cwd(), 'src/db/migrations') })
  console.log('Migrations applied successfully')
  await pool.end()
} catch (err) {
  console.error('Migration failed:', err)
  await pool.end()
  process.exit(1)
}
