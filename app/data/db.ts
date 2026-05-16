import { createDatabase } from 'remix/data-table'
import { createPostgresDatabaseAdapter } from 'remix/data-table-postgres'
import pg from 'pg'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL is required')
}

export const pool = new pg.Pool({ connectionString })

export const adapter = createPostgresDatabaseAdapter(pool)

export const db = createDatabase(adapter)
