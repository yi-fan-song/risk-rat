import { createMigration } from 'remix/data-table/migrations'

import {
  boards,
  categories,
  clues,
  games,
  gamePlayers,
  users,
} from '../../app/data/schema.ts'

export default createMigration({
  async up({ schema }) {
    await schema.plan('CREATE EXTENSION IF NOT EXISTS pgcrypto')

    await schema.createTable(users)
    await schema.createTable(boards)
    await schema.createTable(categories)
    await schema.createTable(clues)
    await schema.createTable(games)
    await schema.createTable(gamePlayers)

    await schema.createIndex(boards, 'owner_id')
    await schema.createIndex(boards, 'share_code')
    await schema.createIndex(categories, ['board_id', 'position'])
    await schema.createIndex(clues, ['category_id', 'row_position'])
    await schema.createIndex(games, 'join_code')
    await schema.createIndex(gamePlayers, 'game_id')
  },

  async down({ schema }) {
    await schema.dropTable(gamePlayers, { ifExists: true })
    await schema.dropTable(games, { ifExists: true })
    await schema.dropTable(clues, { ifExists: true })
    await schema.dropTable(categories, { ifExists: true })
    await schema.dropTable(boards, { ifExists: true })
    await schema.dropTable(users, { ifExists: true })
  },
})
