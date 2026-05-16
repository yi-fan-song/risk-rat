import { column as c, table } from 'remix/data-table'
import type { TableRow } from 'remix/data-table'

export const users = table({
  name: 'users',
  columns: {
    id: c.uuid().primaryKey().defaultSql('gen_random_uuid()'),
    username: c.text().notNull().unique(),
    password_hash: c.text().notNull(),
    created_at: c.timestamp().notNull().defaultNow(),
  },
})

export const boards = table({
  name: 'boards',
  columns: {
    id: c.uuid().primaryKey().defaultSql('gen_random_uuid()'),
    owner_id: c.uuid().notNull().references('users', 'boards_owner_id_fk'),
    title: c.text().notNull(),
    share_code: c.text().nullable().unique(),
    row_values: c.json().notNull(),
    created_at: c.timestamp().notNull().defaultNow(),
    updated_at: c.timestamp().notNull().defaultNow(),
  },
})

export const categories = table({
  name: 'categories',
  columns: {
    id: c.uuid().primaryKey().defaultSql('gen_random_uuid()'),
    board_id: c
      .uuid()
      .notNull()
      .references('boards', 'categories_board_id_fk')
      .onDelete('cascade'),
    position: c.integer().notNull(),
    title: c.text().notNull(),
  },
})

export const clues = table({
  name: 'clues',
  columns: {
    id: c.uuid().primaryKey().defaultSql('gen_random_uuid()'),
    category_id: c
      .uuid()
      .notNull()
      .references('categories', 'clues_category_id_fk')
      .onDelete('cascade'),
    row_position: c.integer().notNull(),
    value: c.integer().notNull(),
    prompt: c.text().nullable(),
    response: c.text().nullable(),
    payload: c.json().nullable(),
  },
})

export const games = table({
  name: 'games',
  columns: {
    id: c.uuid().primaryKey().defaultSql('gen_random_uuid()'),
    board_id: c.uuid().notNull().references('boards', 'games_board_id_fk'),
    host_id: c.uuid().notNull().references('users', 'games_host_id_fk'),
    join_code: c.text().notNull().unique(),
    status: c.text().notNull().default('lobby'),
    state: c.json().notNull(),
    created_at: c.timestamp().notNull().defaultNow(),
  },
})

export const gamePlayers = table({
  name: 'game_players',
  columns: {
    id: c.uuid().primaryKey().defaultSql('gen_random_uuid()'),
    game_id: c
      .uuid()
      .notNull()
      .references('games', 'game_players_game_id_fk')
      .onDelete('cascade'),
    user_id: c.uuid().nullable().references('users', 'game_players_user_id_fk'),
    display_name: c.text().notNull(),
    score: c.integer().notNull().default(0),
    joined_at: c.timestamp().notNull().defaultNow(),
  },
})

export type User = TableRow<typeof users>
export type Board = TableRow<typeof boards>
export type Category = TableRow<typeof categories>
export type Clue = TableRow<typeof clues>
export type Game = TableRow<typeof games>
export type GamePlayer = TableRow<typeof gamePlayers>

export type ClueMedia = 'image' | 'audio' | 'video'

export type CluePayload =
  | { type: 'question' }
  | { type: 'multiple_choice'; options: string[]; correct: number }
  | { type: 'file'; media: ClueMedia; key: string; mime: string }

export function parseCluePayload(value: unknown): CluePayload {
  if (!value || typeof value !== 'object') return { type: 'question' }
  const v = value as Record<string, unknown>
  if (v.type === 'multiple_choice' && Array.isArray(v.options)) {
    const correct = typeof v.correct === 'number' ? v.correct : 0
    const options = v.options.map((o) => String(o))
    return { type: 'multiple_choice', options, correct }
  }
  if (v.type === 'file' && typeof v.key === 'string' && typeof v.mime === 'string') {
    const media =
      v.media === 'image' || v.media === 'audio' || v.media === 'video'
        ? v.media
        : 'image'
    return { type: 'file', media, key: v.key, mime: v.mime }
  }
  return { type: 'question' }
}

export interface BoardRowValues {
  values: number[]
}

export type GameStatus = 'lobby' | 'in_progress' | 'finished'

export interface GameState {
  revealed: Record<string, boolean>
  current_clue_id: string | null
  buzzer_open: boolean
  buzzes: Array<{ player_id: string; at: number }>
  winner_id: string | null
}

export function emptyGameState(): GameState {
  return {
    revealed: {},
    current_clue_id: null,
    buzzer_open: false,
    buzzes: [],
    winner_id: null,
  }
}
