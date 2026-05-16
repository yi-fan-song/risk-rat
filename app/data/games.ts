import {
  boards as boardsTable,
  categories as categoriesTable,
  clues as cluesTable,
  games as gamesTable,
  gamePlayers as gamePlayersTable,
  emptyGameState,
  type Board,
  type Category,
  type Clue,
  type Game,
  type GamePlayer,
  type GameState,
  type GameStatus,
} from './schema.ts'
import { db } from './db.ts'
import { generateCode } from './codes.ts'
import { publishGameEvent } from './redis.ts'

export interface GameWithBoard {
  game: Game
  state: GameState
  board: Board
  categories: Category[]
  clues: Clue[]
  players: GamePlayer[]
}

export async function createGame(boardId: string, hostId: string): Promise<Game> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateCode(6)
    const existing = await db.findOne(gamesTable, { where: { join_code: code } })
    if (existing) continue
    return db.create(
      gamesTable,
      {
        board_id: boardId,
        host_id: hostId,
        join_code: code,
        status: 'lobby',
        state: emptyGameState() as never,
      },
      { returnRow: true },
    )
  }
  throw new Error('Could not generate unique join code')
}

export async function loadGameByCode(joinCode: string): Promise<GameWithBoard | null> {
  const game = await db.findOne(gamesTable, { where: { join_code: joinCode } })
  if (!game) return null
  const board = await db.find(boardsTable, game.board_id)
  if (!board) return null
  const cats = await db.findMany(categoriesTable, {
    where: { board_id: board.id },
    orderBy: ['position', 'asc'],
  })
  const cs: Clue[] = []
  for (const cat of cats) {
    const found = await db.findMany(cluesTable, {
      where: { category_id: cat.id },
      orderBy: ['row_position', 'asc'],
    })
    cs.push(...found)
  }
  const players = await db.findMany(gamePlayersTable, {
    where: { game_id: game.id },
    orderBy: ['joined_at', 'asc'],
  })
  return {
    game,
    state: game.state as unknown as GameState,
    board,
    categories: cats,
    clues: cs,
    players,
  }
}

export async function patchGameState(
  joinCode: string,
  updater: (state: GameState, ctx: GameWithBoard) => GameState,
  extraUpdates: Partial<{ status: GameStatus }> = {},
): Promise<GameWithBoard | null> {
  const ctx = await loadGameByCode(joinCode)
  if (!ctx) return null
  const nextState = updater(ctx.state, ctx)
  await db.update(gamesTable, ctx.game.id, {
    state: nextState as never,
    ...extraUpdates,
  })
  await publishGameEvent(joinCode, { type: 'state' })
  return { ...ctx, state: nextState }
}

export async function joinAsPlayer(
  joinCode: string,
  options: { userId: string | null; displayName: string },
): Promise<GamePlayer | null> {
  const game = await db.findOne(gamesTable, { where: { join_code: joinCode } })
  if (!game) return null

  if (options.userId) {
    const existing = await db.findOne(gamePlayersTable, {
      where: { game_id: game.id, user_id: options.userId },
    })
    if (existing) return existing
  }

  const player = await db.create(
    gamePlayersTable,
    {
      game_id: game.id,
      user_id: options.userId,
      display_name: options.displayName.trim() || 'Anonymous',
      score: 0,
    },
    { returnRow: true },
  )
  await publishGameEvent(joinCode, { type: 'state' })
  return player
}

export async function addPlayerScore(
  joinCode: string,
  playerId: string,
  delta: number,
): Promise<void> {
  const game = await db.findOne(gamesTable, { where: { join_code: joinCode } })
  if (!game) return
  const player = await db.findOne(gamePlayersTable, {
    where: { id: playerId, game_id: game.id },
  })
  if (!player) return
  await db.update(gamePlayersTable, playerId, { score: player.score + delta })
  await publishGameEvent(joinCode, { type: 'state' })
}
