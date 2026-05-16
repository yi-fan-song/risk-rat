import { Database } from 'remix/data-table'
import type { BuildAction } from 'remix/fetch-router'
import { css } from 'remix/ui'

import { loadBoardWithGrid } from '../data/boards.ts'
import {
  boards as boardsTable,
  type Board,
  type Category,
  type Clue,
  type User,
} from '../data/schema.ts'
import { routes } from '../routes.ts'
import { Layout } from '../ui/layout.tsx'
import { c } from '../ui/theme.ts'
import { getCurrentUserOrNull } from '../utils/auth.ts'
import { render } from '../utils/render.tsx'

interface BoardRowValuesShape {
  values: number[]
}

export const share: BuildAction<'GET', typeof routes.share> = {
  async handler({ request, params, get }) {
    const db = get(Database)
    const board = await db.findOne(boardsTable, {
      where: { share_code: params.shareCode },
    })
    if (!board) return new Response('Not Found', { status: 404 })

    const grid = await loadBoardWithGrid(board.id)
    if (!grid) return new Response('Not Found', { status: 404 })

    const viewer = getCurrentUserOrNull({ get })
    return render(<SharedBoardPage user={viewer} grid={grid} />, request)
  },
}

interface SharedBoardProps {
  user: User | null
  grid: { board: Board; categories: Category[]; clues: Clue[] }
}

function SharedBoardPage() {
  return ({ user, grid }: SharedBoardProps) => {
    const rowValues =
      (grid.board.row_values as unknown as BoardRowValuesShape)?.values ?? []
    const cluesByCat = new Map<string, Clue[]>()
    for (const c of grid.clues) {
      const arr = cluesByCat.get(c.category_id) ?? []
      arr.push(c)
      cluesByCat.set(c.category_id, arr)
    }
    return (
      <Layout title={`Shared · ${grid.board.title}`} user={user}>
        <h1 mix={titleStyle}>{grid.board.title}</h1>
        <p mix={shareNoteStyle}>
          Shared board · {user ? null : <a href={routes.auth.signup.index.href()}>sign up to host games</a>}
          {user ? (
            <form
              method="post"
              action={routes.games.create.href()}
              mix={css({ display: 'inline' })}
            >
              <input type="hidden" name="boardId" value={grid.board.id} />
              <button type="submit" mix={hostButtonStyle}>
                Host a game with this board
              </button>
            </form>
          ) : null}
        </p>
        <div mix={gridWrapperStyle}>
        <div
          mix={gridStyle}
          style={{ gridTemplateColumns: `repeat(${grid.categories.length}, minmax(90px, 1fr))` }}
        >
          {grid.categories.map((cat) => (
            <div mix={categoryCellStyle}>{cat.title}</div>
          ))}
          {rowValues.map((_, rowIdx) => (
            <>
              {grid.categories.map((cat) => {
                const clue =
                  cluesByCat.get(cat.id)?.find((c) => c.row_position === rowIdx) ?? null
                return (
                  <div mix={cellStyle}>
                    <strong mix={cellValueStyle}>${clue?.value ?? rowValues[rowIdx]}</strong>
                  </div>
                )
              })}
            </>
          ))}
        </div>
        </div>
      </Layout>
    )
  }
}

const titleStyle = css({
  margin: '0 0 8px',
  color: c.accent,
  fontSize: '32px',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
})

const shareNoteStyle = css({
  marginBottom: '24px',
  opacity: 0.85,
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
})

const hostButtonStyle = css({
  background: c.accent,
  color: c.surfaceMuted,
  border: 'none',
  padding: '8px 16px',
  borderRadius: '4px',
  cursor: 'pointer',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  fontSize: '13px',
  '&:hover': { background: c.text },
})

const gridWrapperStyle = css({
  overflowX: 'auto',
  WebkitOverflowScrolling: 'touch',
  margin: '0 -12px',
  padding: '0 12px',
})

const gridStyle = css({
  display: 'grid',
  gap: '4px',
  background: c.surfaceMuted,
  padding: '4px',
  border: `1px solid ${c.borderStrong}`,
})

const categoryCellStyle = css({
  background: c.surfaceMuted,
  padding: '16px 8px',
  minHeight: '64px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  textTransform: 'uppercase',
  fontWeight: 700,
  letterSpacing: '0.04em',
  color: c.accent,
  fontSize: '14px',
  '@media (max-width: 640px)': { padding: '10px 4px', minHeight: '48px', fontSize: '11px' },
})

const cellStyle = css({
  background: c.surfaceMuted,
  minHeight: '90px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  color: c.accent,
  fontSize: '28px',
  fontWeight: 700,
  '@media (max-width: 640px)': { minHeight: '64px', fontSize: '20px' },
})

const cellValueStyle = css({
  fontFamily: "'Helvetica Neue', Arial, sans-serif",
  textShadow: '3px 3px 0 #000',
})
