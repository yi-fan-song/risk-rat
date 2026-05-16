import 'dotenv/config'

import { createMigrationRunner } from 'remix/data-table/migrations'
import { loadMigrations } from 'remix/data-table/migrations/node'

import { adapter, pool } from '../app/data/db.ts'

async function main() {
  const direction = process.argv[2] ?? 'up'
  const migrations = await loadMigrations('./db/migrations')
  const runner = createMigrationRunner(adapter, migrations)

  if (direction === 'down') {
    const result = await runner.down({ step: 1 })
    console.log(`Reverted ${result.reverted.length} migration(s).`)
  } else if (direction === 'status') {
    const status = await runner.status()
    for (const entry of status) {
      console.log(`${entry.status.padEnd(8)} ${entry.id}  ${entry.name}`)
    }
  } else {
    const result = await runner.up()
    console.log(`Applied ${result.applied.length} migration(s).`)
  }

  await pool.end()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
