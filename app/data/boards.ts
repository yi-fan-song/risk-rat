import { Database } from 'remix/data-table'

import {
  boards,
  categories,
  clues,
  type Board,
  type Category,
  type Clue,
} from './schema.ts'
import { db } from './db.ts'
import { generateCode } from './codes.ts'

export const DEFAULT_ROW_VALUES = [200, 400, 600, 800, 1000]
export const DEFAULT_COLUMN_COUNT = 6

export interface BoardWithGrid {
  board: Board
  categories: Category[]
  clues: Clue[]
}

export async function createBoardWithGrid(
  ownerId: string,
  title: string,
  columnCount = DEFAULT_COLUMN_COUNT,
  rowValues: number[] = DEFAULT_ROW_VALUES,
): Promise<Board> {
  return db.transaction(async (tx) => {
    const board = await tx.create(
      boards,
      {
        owner_id: ownerId,
        title,
        row_values: { values: rowValues },
      },
      { returnRow: true },
    )

    for (let col = 0; col < columnCount; col++) {
      const category = await tx.create(
        categories,
        {
          board_id: board.id,
          position: col,
          title: `Category ${col + 1}`,
        },
        { returnRow: true },
      )
      for (let row = 0; row < rowValues.length; row++) {
        await tx.create(clues, {
          category_id: category.id,
          row_position: row,
          value: rowValues[row],
          prompt: null,
          response: null,
          payload: null,
        })
      }
    }

    return board
  })
}

export async function loadBoardWithGrid(boardId: string): Promise<BoardWithGrid | null> {
  const board = await db.find(boards, boardId)
  if (!board) return null

  const cats = await db.findMany(categories, {
    where: { board_id: boardId },
    orderBy: ['position', 'asc'],
  })

  const allClues: Clue[] = []
  for (const cat of cats) {
    const found = await db.findMany(clues, {
      where: { category_id: cat.id },
      orderBy: ['row_position', 'asc'],
    })
    allClues.push(...found)
  }

  return { board, categories: cats, clues: allClues }
}

export async function generateUniqueShareCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateCode(8)
    const existing = await db.findOne(boards, { where: { share_code: code } })
    if (!existing) return code
  }
  throw new Error('Could not generate unique share code')
}
