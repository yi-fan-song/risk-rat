import { Database } from 'remix/data-table'
import type { Controller } from 'remix/fetch-router'
import { redirect } from 'remix/response/redirect'
import { css } from 'remix/ui'

import { loadBoardWithGrid } from '../data/boards.ts'
import { createGame } from '../data/games.ts'
import {
  boards as boardsTable,
  type Board,
  type Category,
  type Clue,
  type User,
} from '../data/schema.ts'
import { routes } from '../routes.ts'
import { Layout } from '../ui/layout.tsx'
import { c, fonts } from '../ui/theme.ts'
import { getCurrentUserOrNull } from '../utils/auth.ts'
import { render } from '../utils/render.tsx'

interface BoardRowValuesShape {
  values: number[]
}

export const templates = {
  actions: {
    async index({ request, get }) {
      const db = get(Database)
      const list = await db.findMany(boardsTable, {
        where: { is_template: true },
        orderBy: ['created_at', 'asc'],
      })
      const user = getCurrentUserOrNull({ get })
      return render(<TemplatesIndexPage user={user} templates={list} />, request)
    },

    async show({ request, params, get }) {
      const db = get(Database)
      const board = await db.find(boardsTable, params.boardId)
      if (!board || !board.is_template) {
        return new Response('Not Found', { status: 404 })
      }
      const grid = await loadBoardWithGrid(board.id)
      if (!grid) return new Response('Not Found', { status: 404 })
      const user = getCurrentUserOrNull({ get })
      return render(<TemplateShowPage user={user} grid={grid} />, request)
    },

    async play({ params, get }) {
      const user = getCurrentUserOrNull({ get })
      if (!user) return redirect(routes.auth.login.index.href())

      const db = get(Database)
      const board = await db.find(boardsTable, params.boardId)
      if (!board || !board.is_template) {
        return new Response('Not Found', { status: 404 })
      }

      const game = await createGame(board.id, user.id)
      return redirect(routes.games.host.href({ joinCode: game.join_code }))
    },
  },
} satisfies Controller<typeof routes.templates>

interface TemplatesIndexProps {
  user: User | null
  templates: Board[]
}

function TemplatesIndexPage() {
  return ({ user, templates: list }: TemplatesIndexProps) => (
    <Layout title="Templates" user={user}>
      <header mix={headerStyle}>
        <h1 mix={pageHeadingStyle}>Templates</h1>
        <p mix={subtitleStyle}>
          Ready-made boards you can host straight away — no need to write your own clues.
        </p>
      </header>
      {list.length === 0 ? (
        <p mix={emptyStyle}>No templates yet.</p>
      ) : (
        <ul mix={cardsStyle}>
          {list.map((b) => (
            <li mix={cardStyle}>
              <a href={routes.templates.show.href({ boardId: b.id })} mix={cardLinkStyle}>
                <h2 mix={cardTitleStyle}>{b.title}</h2>
                <span mix={cardCtaStyle}>Preview →</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Layout>
  )
}

interface TemplateShowProps {
  user: User | null
  grid: { board: Board; categories: Category[]; clues: Clue[] }
}

function TemplateShowPage() {
  return ({ user, grid }: TemplateShowProps) => {
    const rowValues =
      (grid.board.row_values as unknown as BoardRowValuesShape)?.values ?? []
    const cluesByCat = new Map<string, Clue[]>()
    for (const clue of grid.clues) {
      const arr = cluesByCat.get(clue.category_id) ?? []
      arr.push(clue)
      cluesByCat.set(clue.category_id, arr)
    }
    return (
      <Layout title={`Template · ${grid.board.title}`} user={user}>
        <div mix={detailHeaderStyle}>
          <div>
            <p mix={breadcrumbStyle}>
              <a href={routes.templates.index.href()}>← Templates</a>
            </p>
            <h1 mix={detailTitleStyle}>{grid.board.title}</h1>
          </div>
          {user ? (
            <form
              method="post"
              action={routes.templates.play.href({ boardId: grid.board.id })}
            >
              <button type="submit" mix={primaryButtonStyle}>
                Host a game with this template
              </button>
            </form>
          ) : (
            <a href={routes.auth.signup.index.href()} mix={primaryButtonStyle}>
              Sign up to host
            </a>
          )}
        </div>
        <div mix={gridWrapperStyle}>
          <div
            mix={gridStyle}
            style={{
              gridTemplateColumns: `repeat(${grid.categories.length}, minmax(90px, 1fr))`,
            }}
          >
            {grid.categories.map((cat) => (
              <div mix={categoryCellStyle}>{cat.title}</div>
            ))}
            {rowValues.map((_, rowIdx) => (
              <>
                {grid.categories.map((cat) => {
                  const clue = cluesByCat
                    .get(cat.id)
                    ?.find((cc) => cc.row_position === rowIdx)
                  return (
                    <div mix={cellStyle}>
                      <span mix={cellValueStyle}>${clue?.value ?? rowValues[rowIdx]}</span>
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

const headerStyle = css({
  marginBottom: '32px',
})

const pageHeadingStyle = css({
  fontFamily: fonts.display,
  margin: '0 0 8px',
  color: c.accent,
  fontSize: '36px',
  letterSpacing: '0.04em',
  '@media (max-width: 640px)': { fontSize: '26px' },
})

const subtitleStyle = css({
  margin: 0,
  color: c.textMuted,
  fontSize: '16px',
})

const emptyStyle = css({
  padding: '40px',
  textAlign: 'center',
  color: c.textMuted,
  border: `2px dashed ${c.border}`,
  borderRadius: '8px',
})

const cardsStyle = css({
  listStyle: 'none',
  padding: 0,
  margin: 0,
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  gap: '16px',
})

const cardStyle = css({
  background: c.surface,
  border: `1px solid ${c.border}`,
  borderRadius: '8px',
  transition: 'border-color 120ms ease, transform 120ms ease',
  '&:hover': { borderColor: c.borderStrong, transform: 'translateY(-2px)' },
})

const cardLinkStyle = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  padding: '24px',
  textDecoration: 'none',
  color: c.text,
  '&:hover': { color: c.text },
})

const cardTitleStyle = css({
  fontFamily: fonts.display,
  margin: 0,
  fontSize: '24px',
  letterSpacing: '0.03em',
})

const cardCtaStyle = css({
  fontSize: '13px',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: c.accent,
})

const detailHeaderStyle = css({
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'space-between',
  gap: '16px',
  marginBottom: '24px',
  flexWrap: 'wrap',
})

const breadcrumbStyle = css({
  margin: '0 0 4px',
  fontSize: '13px',
  '& a': { textDecoration: 'none' },
  '& a:hover': { textDecoration: 'underline' },
})

const detailTitleStyle = css({
  fontFamily: fonts.display,
  margin: 0,
  color: c.accent,
  fontSize: '32px',
  letterSpacing: '0.04em',
  '@media (max-width: 640px)': { fontSize: '24px' },
})

const primaryButtonStyle = css({
  display: 'inline-block',
  padding: '12px 22px',
  background: c.accent,
  color: c.onAccent,
  fontWeight: 700,
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  textDecoration: 'none',
  fontSize: '14px',
  transition: 'background 120ms ease',
  '&:hover': { background: c.accentStrong, color: c.onAccent },
  '@media (max-width: 640px)': { padding: '14px 18px' },
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
  background: c.surface,
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
  background: c.surface,
  minHeight: '90px',
  display: 'flex',
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
