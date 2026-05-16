import { requireAuth } from 'remix/auth-middleware'
import { Database } from 'remix/data-table'
import { Session } from 'remix/session'
import { redirect } from 'remix/response/redirect'
import type { Controller } from 'remix/fetch-router'
import * as s from 'remix/data-schema'
import * as f from 'remix/data-schema/form-data'
import { minLength } from 'remix/data-schema/checks'
import { css, type RemixNode } from 'remix/ui'

import {
  createBoardWithGrid,
  generateUniqueShareCode,
  loadBoardWithGrid,
} from '../data/boards.ts'
import {
  boards as boardsTable,
  categories as categoriesTable,
  clues as cluesTable,
  parseCluePayload,
  type Board,
  type Category,
  type Clue,
  type CluePayload,
  type User,
} from '../data/schema.ts'
import { fileStorage, mediaKindFor } from '../data/file-storage.ts'
import { routes } from '../routes.ts'
import { Layout } from '../ui/layout.tsx'
import { FormCard, SubmitButton, TextField } from '../ui/form.tsx'
import { c } from '../ui/theme.ts'
import { getCurrentUser } from '../utils/auth.ts'
import { render } from '../utils/render.tsx'

interface BoardRowValuesShape {
  values: number[]
}

const newBoardSchema = f.object({
  title: f.field(s.string().pipe(minLength(1))),
})

const updateBoardSchema = f.object({
  title: f.field(s.string().pipe(minLength(1))),
})

const updateClueSchema = f.object({
  value: f.field(s.string()),
  prompt: f.field(s.defaulted(s.string(), '')),
  response: f.field(s.defaulted(s.string(), '')),
  payloadType: f.field(s.defaulted(s.string(), 'question')),
})

const MAX_OPTIONS = 6

export const boards = {
  middleware: [requireAuth()],
  actions: {
    async index({ request, get }) {
      const user = getCurrentUser({ get })
      const db = get(Database)
      const all = await db.findMany(boardsTable, {
        where: { owner_id: user.id },
        orderBy: ['created_at', 'desc'],
      })
      return render(<BoardsIndexPage user={user} boards={all} />, request)
    },

    new: {
      actions: {
        index({ request, get }) {
          const user = getCurrentUser({ get })
          const session = get(Session)
          const error = (session.get('error') as string | null) ?? null
          return render(<NewBoardPage user={user} error={error} />, request)
        },
        async action({ get }) {
          const user = getCurrentUser({ get })
          const parsed = s.parseSafe(newBoardSchema, get(FormData))
          const session = get(Session)
          if (!parsed.success) {
            session.flash('error', 'Title is required.')
            return redirect(routes.boards.new.index.href())
          }
          const board = await createBoardWithGrid(user.id, parsed.value.title.trim())
          return redirect(routes.boards.edit.href({ boardId: board.id }))
        },
      },
    },

    async show({ request, params, get }) {
      const user = getCurrentUser({ get })
      const grid = await loadBoardWithGrid(params.boardId)
      if (!grid || grid.board.owner_id !== user.id) {
        return new Response('Not Found', { status: 404 })
      }
      return render(<BoardViewPage user={user} grid={grid} />, request)
    },

    async edit({ request, params, get }) {
      const user = getCurrentUser({ get })
      const grid = await loadBoardWithGrid(params.boardId)
      if (!grid || grid.board.owner_id !== user.id) {
        return new Response('Not Found', { status: 404 })
      }
      const session = get(Session)
      const flash = (session.get('message') as string | null) ?? null
      return render(<BoardEditPage user={user} grid={grid} flash={flash} />, request)
    },

    async update({ params, get }) {
      const user = getCurrentUser({ get })
      const db = get(Database)
      const board = await db.find(boardsTable, params.boardId)
      if (!board || board.owner_id !== user.id) {
        return new Response('Not Found', { status: 404 })
      }
      const parsed = s.parseSafe(updateBoardSchema, get(FormData))
      if (!parsed.success) {
        return redirect(routes.boards.edit.href({ boardId: params.boardId }))
      }

      await db.update(boardsTable, params.boardId, {
        title: parsed.value.title.trim(),
        updated_at: new Date(),
      })

      const cats = await db.findMany(categoriesTable, {
        where: { board_id: params.boardId },
      })
      const formData = get(FormData)
      for (const cat of cats) {
        const value = formData.get(`category_${cat.id}`)
        if (typeof value === 'string') {
          await db.update(categoriesTable, cat.id, { title: value.trim() || cat.title })
        }
      }

      const session = get(Session)
      session.flash('message', 'Saved.')
      return redirect(routes.boards.edit.href({ boardId: params.boardId }))
    },

    async destroy({ params, get }) {
      const user = getCurrentUser({ get })
      const db = get(Database)
      const board = await db.find(boardsTable, params.boardId)
      if (!board || board.owner_id !== user.id) {
        return new Response('Not Found', { status: 404 })
      }
      await db.delete(boardsTable, params.boardId)
      return redirect(routes.boards.index.href())
    },

    async share({ params, get }) {
      const user = getCurrentUser({ get })
      const db = get(Database)
      const board = await db.find(boardsTable, params.boardId)
      if (!board || board.owner_id !== user.id) {
        return new Response('Not Found', { status: 404 })
      }
      let code = board.share_code
      if (!code) {
        code = await generateUniqueShareCode()
        await db.update(boardsTable, params.boardId, { share_code: code })
      }
      const session = get(Session)
      session.flash('message', `Share link ready: /share/${code}`)
      return redirect(routes.boards.edit.href({ boardId: params.boardId }))
    },

    clue: {
      actions: {
        async index({ request, params, get }) {
          const user = getCurrentUser({ get })
          const db = get(Database)
          const clue = await db.find(cluesTable, params.clueId)
          if (!clue) return new Response('Not Found', { status: 404 })
          const cat = await db.find(categoriesTable, clue.category_id)
          if (!cat || cat.board_id !== params.boardId) {
            return new Response('Not Found', { status: 404 })
          }
          const board = await db.find(boardsTable, cat.board_id)
          if (!board || board.owner_id !== user.id) {
            return new Response('Not Found', { status: 404 })
          }
          return render(
            <ClueEditPage user={user} board={board} category={cat} clue={clue} />,
            request,
          )
        },
        async action({ params, get }) {
          const user = getCurrentUser({ get })
          const db = get(Database)
          const clue = await db.find(cluesTable, params.clueId)
          if (!clue) return new Response('Not Found', { status: 404 })
          const cat = await db.find(categoriesTable, clue.category_id)
          if (!cat || cat.board_id !== params.boardId) {
            return new Response('Not Found', { status: 404 })
          }
          const board = await db.find(boardsTable, cat.board_id)
          if (!board || board.owner_id !== user.id) {
            return new Response('Not Found', { status: 404 })
          }

          const fd = get(FormData)
          const parsed = s.parseSafe(updateClueSchema, fd)
          if (!parsed.success) {
            return redirect(
              routes.boards.clue.index.href({
                boardId: params.boardId,
                clueId: params.clueId,
              }),
            )
          }

          const value = parseInt(parsed.value.value, 10) || clue.value
          const session = get(Session)
          const existingPayload = parseCluePayload(clue.payload)
          const payload = await buildCluePayload(
            parsed.value.payloadType,
            fd,
            existingPayload,
          )

          if (!payload) {
            session.flash('error', 'Please upload a file before saving.')
            return redirect(
              routes.boards.clue.index.href({
                boardId: params.boardId,
                clueId: params.clueId,
              }),
            )
          }

          await db.update(cluesTable, params.clueId, {
            value,
            prompt: parsed.value.prompt.trim() || null,
            response: parsed.value.response.trim() || null,
            payload: payload as never,
          })

          session.flash('message', 'Clue saved.')
          return redirect(routes.boards.edit.href({ boardId: params.boardId }))
        },
      },
    },
  },
} satisfies Controller<typeof routes.boards>

async function buildCluePayload(
  rawType: string,
  fd: FormData,
  existing: CluePayload,
): Promise<CluePayload | null> {
  if (rawType === 'multiple_choice') {
    const options: string[] = []
    for (let i = 0; i < MAX_OPTIONS; i++) {
      const opt = fd.get(`option_${i}`)
      if (typeof opt === 'string' && opt.trim()) {
        options.push(opt.trim())
      }
    }
    if (options.length < 2) {
      return existing.type === 'multiple_choice' ? existing : { type: 'question' }
    }
    const correctRaw = fd.get('correct')
    let correct = 0
    if (typeof correctRaw === 'string') {
      const n = parseInt(correctRaw, 10)
      if (!Number.isNaN(n)) correct = Math.max(0, Math.min(n, options.length - 1))
    }
    return { type: 'multiple_choice', options, correct }
  }

  if (rawType === 'file') {
    const fileKey = fd.get('file')
    if (typeof fileKey === 'string' && fileKey) {
      const stored = await fileStorage.get(fileKey)
      if (stored) {
        const media = mediaKindFor(stored.type)
        if (media) {
          return { type: 'file', media, key: fileKey, mime: stored.type }
        }
      }
    }
    if (existing.type === 'file') return existing
    return null
  }

  return { type: 'question' }
}

interface BoardsIndexProps {
  user: User
  boards: Board[]
}

function BoardsIndexPage() {
  return ({ user, boards: list }: BoardsIndexProps) => (
    <Layout title="My boards" user={user}>
      <div mix={headingRowStyle}>
        <h1 mix={pageHeadingStyle}>My boards</h1>
        <a href={routes.boards.new.index.href()} mix={primaryButtonStyle}>
          + New board
        </a>
      </div>
      {list.length === 0 ? (
        <p mix={emptyStyle}>You haven't made any boards yet. Start with a new one.</p>
      ) : (
        <ul mix={boardsListStyle}>
          {list.map((b) => (
            <li mix={boardCardStyle}>
              <a
                href={routes.boards.edit.href({ boardId: b.id })}
                mix={cardLinkStyle}
              >
                <strong>{b.title}</strong>
                {b.share_code ? (
                  <span mix={shareTagStyle}>SHARED · {b.share_code}</span>
                ) : null}
              </a>
              <form
                method="post"
                action={routes.boards.destroy.href({ boardId: b.id })}
                mix={inlineFormStyle}
              >
                <input type="hidden" name="_method" value="DELETE" />
                <button type="submit" mix={dangerButtonStyle}>
                  Delete
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </Layout>
  )
}

interface NewBoardProps {
  user: User
  error: string | null
}

function NewBoardPage() {
  return ({ user, error }: NewBoardProps) => (
    <Layout title="New board" user={user}>
      <FormCard title="New board">
        {error ? <p mix={errorStyle}>{error}</p> : null}
        <form method="post" action={routes.boards.new.action.href()}>
          <TextField name="title" label="Title" autoFocus />
          <SubmitButton>Create board</SubmitButton>
        </form>
      </FormCard>
    </Layout>
  )
}

interface BoardViewProps {
  user: User
  grid: { board: Board; categories: Category[]; clues: Clue[] }
}

function BoardViewPage() {
  return ({ user, grid }: BoardViewProps) => (
    <Layout title={grid.board.title} user={user}>
      <BoardGrid grid={grid} readOnly={true} />
    </Layout>
  )
}

interface BoardEditProps {
  user: User
  grid: { board: Board; categories: Category[]; clues: Clue[] }
  flash: string | null
}

function BoardEditPage() {
  return ({ user, grid, flash }: BoardEditProps) => {
    return (
      <Layout title={`Edit · ${grid.board.title}`} user={user} flash={flash}>
        <form method="post" action={routes.boards.update.href({ boardId: grid.board.id })}>
          <div mix={editHeaderStyle}>
            <input
              type="text"
              name="title"
              value={grid.board.title}
              role="textbox"
              mix={titleInputStyle}
            />
            <div mix={editActionsStyle}>
              <button type="submit" mix={primaryButtonStyle}>
                Save
              </button>
            </div>
          </div>
          <BoardGrid grid={grid} readOnly={false} />
        </form>
        <div mix={editToolbarStyle}>
          <form
            method="post"
            action={routes.boards.share.href({ boardId: grid.board.id })}
            mix={inlineFormStyle}
          >
            <button type="submit" mix={secondaryButtonStyle}>
              {grid.board.share_code ? 'Reveal share link' : 'Generate share link'}
            </button>
          </form>
          {grid.board.share_code ? (
            <code mix={shareCodeStyle}>
              {`/share/${grid.board.share_code}`}
            </code>
          ) : null}
          <form method="post" action={routes.games.create.href()} mix={inlineFormStyle}>
            <input type="hidden" name="boardId" value={grid.board.id} />
            <button type="submit" mix={primaryButtonStyle}>
              Start live game
            </button>
          </form>
        </div>
      </Layout>
    )
  }
}

interface BoardGridProps {
  grid: { board: Board; categories: Category[]; clues: Clue[] }
  readOnly: boolean
}

function BoardGrid() {
  return ({ grid, readOnly }: BoardGridProps) => {
    const rowValues = (grid.board.row_values as unknown as BoardRowValuesShape)?.values ?? []

    const cluesByCat = new Map<string, Clue[]>()
    for (const c of grid.clues) {
      const arr = cluesByCat.get(c.category_id) ?? []
      arr.push(c)
      cluesByCat.set(c.category_id, arr)
    }

    return (
      <div mix={gridWrapperStyle}>
        <div
          mix={gridStyle}
          style={{
            gridTemplateColumns: `repeat(${grid.categories.length}, minmax(90px, 1fr))`,
          }}
        >
          {grid.categories.map((cat) => (
            <div mix={categoryCellStyle}>
              {readOnly ? (
                <span>{cat.title}</span>
              ) : (
                <input
                  type="text"
                  role="textbox"
                  name={`category_${cat.id}`}
                  value={cat.title}
                  mix={categoryInputStyle}
                />
              )}
            </div>
          ))}
          {rowValues.map((_, rowIdx) => (
            <>
              {grid.categories.map((cat) => {
                const clue =
                  cluesByCat.get(cat.id)?.find((c) => c.row_position === rowIdx) ?? null
                return <ClueCell board={grid.board} clue={clue} readOnly={readOnly} />
              })}
            </>
          ))}
        </div>
      </div>
    )
  }
}

interface ClueCellProps {
  board: Board
  clue: Clue | null
  readOnly: boolean
}

function ClueCell() {
  return ({ board, clue, readOnly }: ClueCellProps) => {
    if (!clue) {
      return <div mix={cellStyle}>—</div>
    }
    const hasContent = clue.prompt || clue.response
    if (readOnly) {
      return (
        <div mix={cellStyle}>
          <strong mix={cellValueStyle}>${clue.value}</strong>
          {hasContent ? null : <span mix={emptyMarkStyle}>empty</span>}
        </div>
      )
    }
    return (
      <a
        href={routes.boards.clue.index.href({ boardId: board.id, clueId: clue.id })}
        mix={cellLinkStyle}
      >
        <strong mix={cellValueStyle}>${clue.value}</strong>
        <span mix={cellLabelStyle}>{hasContent ? 'edit' : 'add'}</span>
      </a>
    )
  }
}

interface ClueEditProps {
  user: User
  board: Board
  category: Category
  clue: Clue
}

function ClueEditPage() {
  return ({ user, board, category, clue }: ClueEditProps) => {
    const payload = parseCluePayload(clue.payload)
    const mc =
      payload.type === 'multiple_choice'
        ? payload
        : { type: 'multiple_choice' as const, options: [], correct: 0 }
    const file = payload.type === 'file' ? payload : null

    return (
      <Layout title={`Clue · ${category.title} · $${clue.value}`} user={user}>
        <a
          href={routes.boards.edit.href({ boardId: board.id })}
          mix={backLinkStyle}
        >
          ← Back to board
        </a>
        <FormCard title={`${category.title} — $${clue.value}`}>
          <form
            method="post"
            encType="multipart/form-data"
            action={routes.boards.clue.action.href({
              boardId: board.id,
              clueId: clue.id,
            })}
          >
            <TextField
              name="value"
              label="Dollar value"
              value={String(clue.value)}
            />

            <label mix={labelStyle}>
              <span>Prompt (what the host reads)</span>
              <textarea name="prompt" rows={3} mix={textareaStyle}>
                {clue.prompt ?? ''}
              </textarea>
            </label>

            <label mix={labelStyle}>
              <span>Correct response</span>
              <textarea name="response" rows={2} mix={textareaStyle}>
                {clue.response ?? ''}
              </textarea>
            </label>

            <fieldset mix={fieldsetStyle}>
              <legend mix={legendStyle}>Building block</legend>

              <label mix={radioRowStyle}>
                <input
                  type="radio"
                  name="payloadType"
                  value="question"
                  checked={payload.type === 'question'}
                />
                <span>
                  <strong>Question</strong> — text-only prompt and response (default).
                </span>
              </label>

              <label mix={radioRowStyle}>
                <input
                  type="radio"
                  name="payloadType"
                  value="multiple_choice"
                  checked={payload.type === 'multiple_choice'}
                />
                <span>
                  <strong>Multiple choice</strong> — show options alongside the prompt.
                </span>
              </label>
              <div mix={subFieldsStyle}>
                {Array.from({ length: MAX_OPTIONS }).map((_, i) => (
                  <div mix={optionRowStyle}>
                    <input
                      type="radio"
                      name="correct"
                      value={String(i)}
                      checked={mc.correct === i}
                      aria-label={`Option ${i + 1} is correct`}
                    />
                    <input
                      type="text"
                      role="textbox"
                      name={`option_${i}`}
                      value={mc.options[i] ?? ''}
                      placeholder={`Option ${i + 1}`}
                      mix={optionInputStyle}
                    />
                  </div>
                ))}
                <p mix={hintStyle}>Select the radio next to the correct option.</p>
              </div>

              <label mix={radioRowStyle}>
                <input
                  type="radio"
                  name="payloadType"
                  value="file"
                  checked={payload.type === 'file'}
                />
                <span>
                  <strong>File</strong> — attach an image, audio, or video.
                </span>
              </label>
              <div mix={subFieldsStyle}>
                {file ? (
                  <div mix={existingFileStyle}>
                    <span>
                      Current: <code>{file.media}</code> · <code>{file.mime}</code>
                    </span>
                    <a
                      href={routes.files.show.href({ key: file.key })}
                      target="_blank"
                    >
                      preview
                    </a>
                  </div>
                ) : null}
                <input
                  type="file"
                  name="file"
                  accept="image/*,audio/*,video/*"
                  mix={fileInputStyle}
                />
                <p mix={hintStyle}>
                  Uploading a new file replaces the existing one.
                </p>
              </div>
            </fieldset>

            <SubmitButton>Save clue</SubmitButton>
          </form>
        </FormCard>
      </Layout>
    )
  }
}

const headingRowStyle = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '24px',
  flexWrap: 'wrap',
  gap: '12px',
  '@media (max-width: 640px)': { marginBottom: '16px' },
})

const pageHeadingStyle = css({
  margin: 0,
  color: c.accent,
  fontSize: '28px',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  '@media (max-width: 640px)': { fontSize: '22px' },
})

const emptyStyle = css({
  padding: '40px',
  textAlign: 'center',
  opacity: 0.7,
  border: `2px dashed ${c.border}`,
  borderRadius: '8px',
})

const boardsListStyle = css({
  listStyle: 'none',
  padding: 0,
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
})

const boardCardStyle = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  background: c.surface,
  border: `1px solid ${c.border}`,
  borderRadius: '6px',
  padding: '14px 18px',
  gap: '12px',
  '@media (max-width: 640px)': { padding: '12px 14px' },
})

const cardLinkStyle = css({
  color: c.text,
  textDecoration: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  flex: 1,
  '&:hover': { color: c.accent },
})

const shareTagStyle = css({
  fontSize: '11px',
  letterSpacing: '0.1em',
  color: c.accent,
})

const inlineFormStyle = css({ display: 'inline' })

const dangerButtonStyle = css({
  background: 'transparent',
  color: c.danger,
  border: `1px solid ${c.danger}`,
  borderRadius: '4px',
  padding: '6px 12px',
  cursor: 'pointer',
  fontSize: '12px',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  '&:hover': { background: c.danger, color: c.surfaceMuted },
})

const primaryButtonStyle = css({
  display: 'inline-block',
  padding: '10px 18px',
  background: c.accent,
  color: c.surfaceMuted,
  fontWeight: 700,
  textDecoration: 'none',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  fontSize: '14px',
  '&:hover': { background: c.text },
})

const secondaryButtonStyle = css({
  display: 'inline-block',
  padding: '10px 18px',
  background: 'transparent',
  color: c.accent,
  border: `1px solid ${c.borderStrong}`,
  borderRadius: '4px',
  cursor: 'pointer',
  fontWeight: 700,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  fontSize: '14px',
  '&:hover': { borderColor: c.text, color: c.text },
})

const errorStyle = css({
  background: c.dangerSoft,
  color: c.danger,
  padding: '10px 12px',
  borderRadius: '4px',
  marginBottom: '16px',
  textAlign: 'center',
})

const editHeaderStyle = css({
  display: 'flex',
  alignItems: 'center',
  gap: '16px',
  marginBottom: '16px',
  flexWrap: 'wrap',
})

const titleInputStyle = css({
  flex: 1,
  minWidth: '160px',
  background: 'transparent',
  border: 'none',
  borderBottom: `2px solid ${c.borderStrong}`,
  color: c.accent,
  fontSize: '28px',
  padding: '4px 0',
  outline: 'none',
  fontWeight: 700,
  '&:focus': { borderBottomColor: c.accent },
  '@media (max-width: 640px)': { fontSize: '20px' },
})

const editActionsStyle = css({
  display: 'flex',
  gap: '8px',
})

const editToolbarStyle = css({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  marginBottom: '24px',
  flexWrap: 'wrap',
  '@media (max-width: 640px)': { gap: '8px' },
})

const shareCodeStyle = css({
  fontFamily: 'monospace',
  background: c.accentSoft,
  padding: '8px 12px',
  borderRadius: '4px',
  color: c.accent,
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

const categoryInputStyle = css({
  background: 'transparent',
  border: 'none',
  textAlign: 'center',
  color: c.accent,
  fontWeight: 700,
  width: '100%',
  fontSize: '14px',
  textTransform: 'uppercase',
  outline: 'none',
  '&:focus': { background: c.accentSoft },
  '@media (max-width: 640px)': { fontSize: '11px' },
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
  '@media (max-width: 640px)': { minHeight: '64px', fontSize: '18px' },
})

const cellLinkStyle = css({
  background: c.surfaceMuted,
  minHeight: '90px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  color: c.accent,
  fontSize: '28px',
  fontWeight: 700,
  textDecoration: 'none',
  cursor: 'pointer',
  '&:hover': { background: c.surfaceAlt },
  '@media (max-width: 640px)': { minHeight: '64px', fontSize: '18px' },
})

const cellValueStyle = css({
  fontFamily: "'Helvetica Neue', Arial, sans-serif",
  textShadow: '3px 3px 0 #000',
})

const cellLabelStyle = css({
  fontSize: '11px',
  marginTop: '4px',
  opacity: 0.7,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  '@media (max-width: 640px)': { fontSize: '9px' },
})

const emptyMarkStyle = css({
  fontSize: '10px',
  marginTop: '4px',
  opacity: 0.5,
  textTransform: 'uppercase',
})

const labelStyle = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  marginBottom: '16px',
  fontSize: '14px',
  '& > span:first-child': {
    color: c.accent,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontSize: '12px',
  },
})

const textareaStyle = css({
  padding: '10px 12px',
  background: c.surfaceMuted,
  border: `1px solid ${c.borderStrong}`,
  borderRadius: '4px',
  color: c.text,
  fontSize: '15px',
  outline: 'none',
  resize: 'vertical',
  fontFamily: 'inherit',
  '&:focus': { borderColor: c.text },
  '@media (max-width: 640px)': { fontSize: '16px' },
})

const textareaMonoStyle = css({
  padding: '10px 12px',
  background: c.surfaceMuted,
  border: `1px solid ${c.borderStrong}`,
  borderRadius: '4px',
  color: c.text,
  fontSize: '13px',
  outline: 'none',
  resize: 'vertical',
  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  '&:focus': { borderColor: c.text },
  '@media (max-width: 640px)': { fontSize: '16px' },
})

const backLinkStyle = css({
  display: 'inline-block',
  marginBottom: '12px',
  color: c.accent,
  textDecoration: 'none',
  fontSize: '14px',
  '&:hover': { color: c.text },
})

const fieldsetStyle = css({
  border: `1px solid ${c.border}`,
  borderRadius: '6px',
  padding: '12px 16px 16px',
  margin: '0 0 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
})

const legendStyle = css({
  padding: '0 6px',
  color: c.accent,
  fontSize: '12px',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
})

const radioRowStyle = css({
  display: 'flex',
  alignItems: 'flex-start',
  gap: '10px',
  fontSize: '14px',
  '& input[type=radio]': { marginTop: '3px' },
})

const subFieldsStyle = css({
  marginLeft: '24px',
  marginBottom: '8px',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
})

const optionRowStyle = css({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
})

const optionInputStyle = css({
  flex: 1,
  padding: '8px 10px',
  background: c.surfaceMuted,
  border: `1px solid ${c.borderStrong}`,
  borderRadius: '4px',
  color: c.text,
  fontSize: '14px',
  outline: 'none',
  '&:focus': { borderColor: c.accent },
  '@media (max-width: 640px)': { fontSize: '16px', padding: '10px 12px' },
})

const fileInputStyle = css({
  fontSize: '13px',
  color: c.text,
  '&::file-selector-button': {
    background: c.accent,
    color: c.surfaceMuted,
    border: 'none',
    padding: '6px 12px',
    borderRadius: '4px',
    cursor: 'pointer',
    marginRight: '8px',
    fontWeight: 700,
  },
})

const existingFileStyle = css({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '6px 8px',
  background: c.accentSoft,
  borderRadius: '4px',
  fontSize: '13px',
  '& code': { fontFamily: 'monospace', opacity: 0.85 },
})

const hintStyle = css({
  fontSize: '12px',
  opacity: 0.7,
  margin: '4px 0 0',
})
