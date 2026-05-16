import { Auth } from 'remix/auth-middleware'
import { Database } from 'remix/data-table'
import { Session } from 'remix/session'
import { redirect } from 'remix/response/redirect'
import type { Controller } from 'remix/fetch-router'
import { css } from 'remix/ui'

import {
  addPlayerScore,
  createGame,
  joinAsPlayer,
  loadGameByCode,
  patchGameState,
  type GameWithBoard,
} from '../data/games.ts'
import { createSubscriber, gameChannel } from '../data/redis.ts'
import {
  parseCluePayload,
  type Clue,
  type CluePayload,
  type GameState,
  type User,
} from '../data/schema.ts'
import { routes } from '../routes.ts'
import { Layout } from '../ui/layout.tsx'
import { render } from '../utils/render.tsx'

interface BoardRowValuesShape {
  values: number[]
}

interface GuestPlayerData {
  playerId: string
  displayName: string
}

function getGuestPlayer(session: { get(name: string): unknown }, joinCode: string): GuestPlayerData | null {
  const map = session.get('guest_players') as Record<string, GuestPlayerData> | undefined
  return map?.[joinCode] ?? null
}

function setGuestPlayer(
  session: {
    get(name: string): unknown
    set(name: string, value: unknown): void
  },
  joinCode: string,
  data: GuestPlayerData,
): void {
  const map =
    (session.get('guest_players') as Record<string, GuestPlayerData> | undefined) ?? {}
  map[joinCode] = data
  session.set('guest_players', map)
}

function currentUserOrNull(get: (k: unknown) => unknown): User | null {
  const auth = get(Auth) as { ok: boolean; identity?: User }
  return auth.ok ? auth.identity ?? null : null
}

export const games = {
  actions: {
    async create({ get }) {
      const user = currentUserOrNull(get as never)
      if (!user) return redirect(routes.auth.login.index.href())
      const fd = get(FormData)
      const boardId = String(fd.get('boardId') ?? '')
      if (!boardId) return new Response('Bad Request', { status: 400 })

      const db = get(Database)
      const { boards: boardsTable } = await import('../data/schema.ts')
      const board = await db.find(boardsTable, boardId)
      if (!board) return new Response('Not Found', { status: 404 })
      // Owner OR shared board: allow if owner or if board has share_code
      if (board.owner_id !== user.id && !board.share_code) {
        return new Response('Forbidden', { status: 403 })
      }

      const game = await createGame(boardId, user.id)
      return redirect(routes.games.host.href({ joinCode: game.join_code }))
    },

    async host({ request, params, get }) {
      const user = currentUserOrNull(get as never)
      if (!user) return redirect(routes.auth.login.index.href())
      const ctx = await loadGameByCode(params.joinCode)
      if (!ctx) return new Response('Not Found', { status: 404 })
      if (ctx.game.host_id !== user.id) {
        return new Response('Forbidden', { status: 403 })
      }
      return render(<HostPage user={user} ctx={ctx} />, request)
    },

    async play({ request, params, get }) {
      const user = currentUserOrNull(get as never)
      const session = get(Session)
      const ctx = await loadGameByCode(params.joinCode)
      if (!ctx) return new Response('Not Found', { status: 404 })

      let playerId: string | null = null
      let displayName: string | null = null
      if (user) {
        const existing = ctx.players.find((p) => p.user_id === user.id)
        if (existing) {
          playerId = existing.id
          displayName = existing.display_name
        }
      } else {
        const guest = getGuestPlayer(session, params.joinCode)
        if (guest) {
          const existing = ctx.players.find((p) => p.id === guest.playerId)
          if (existing) {
            playerId = existing.id
            displayName = existing.display_name
          }
        }
      }

      if (!playerId) {
        return render(
          <JoinPage joinCode={params.joinCode} user={user} ctx={ctx} />,
          request,
        )
      }
      return render(
        <PlayerPage
          user={user}
          ctx={ctx}
          playerId={playerId}
          displayName={displayName ?? 'Player'}
        />,
        request,
      )
    },

    async watch({ request, params, get }) {
      const user = currentUserOrNull(get as never)
      const ctx = await loadGameByCode(params.joinCode)
      if (!ctx) return new Response('Not Found', { status: 404 })
      return render(<SpectatorPage user={user} ctx={ctx} />, request)
    },

    async join({ params, get }) {
      const fd = get(FormData)
      const displayName = String(fd.get('displayName') ?? '').trim()
      if (!displayName) {
        return redirect(routes.games.play.href({ joinCode: params.joinCode }))
      }
      const user = currentUserOrNull(get as never)
      const session = get(Session)
      const player = await joinAsPlayer(params.joinCode, {
        userId: user?.id ?? null,
        displayName,
      })
      if (!player) return new Response('Not Found', { status: 404 })

      if (!user) {
        setGuestPlayer(session, params.joinCode, {
          playerId: player.id,
          displayName: player.display_name,
        })
      }
      return redirect(routes.games.play.href({ joinCode: params.joinCode }))
    },

    async action({ params, get }) {
      const user = currentUserOrNull(get as never)
      const session = get(Session)
      const fd = get(FormData)
      const action = String(fd.get('action') ?? '')

      const ctxBefore = await loadGameByCode(params.joinCode)
      if (!ctxBefore) return new Response('Not Found', { status: 404 })

      const isHost = user && ctxBefore.game.host_id === user.id

      let playerId: string | null = null
      if (user) {
        playerId = ctxBefore.players.find((p) => p.user_id === user.id)?.id ?? null
      } else {
        const guest = getGuestPlayer(session, params.joinCode)
        playerId =
          guest && ctxBefore.players.find((p) => p.id === guest.playerId)
            ? guest.playerId
            : null
      }

      switch (action) {
        case 'start': {
          if (!isHost) return new Response('Forbidden', { status: 403 })
          await patchGameState(
            params.joinCode,
            (state) => state,
            { status: 'in_progress' },
          )
          return redirect(routes.games.host.href({ joinCode: params.joinCode }))
        }
        case 'open_clue': {
          if (!isHost) return new Response('Forbidden', { status: 403 })
          const clueId = String(fd.get('clueId') ?? '')
          await patchGameState(params.joinCode, (state, ctx) => {
            const clue = ctx.clues.find((c) => c.id === clueId)
            if (!clue) return state
            return {
              ...state,
              current_clue_id: clue.id,
              revealed: { ...state.revealed, [clue.id]: true },
              buzzer_open: false,
              buzzes: [],
            }
          })
          return redirect(routes.games.host.href({ joinCode: params.joinCode }))
        }
        case 'open_buzzer': {
          if (!isHost) return new Response('Forbidden', { status: 403 })
          await patchGameState(params.joinCode, (state) => ({
            ...state,
            buzzer_open: true,
            buzzes: [],
          }))
          return redirect(routes.games.host.href({ joinCode: params.joinCode }))
        }
        case 'close_clue': {
          if (!isHost) return new Response('Forbidden', { status: 403 })
          await patchGameState(params.joinCode, (state) => ({
            ...state,
            current_clue_id: null,
            buzzer_open: false,
            buzzes: [],
          }))
          return redirect(routes.games.host.href({ joinCode: params.joinCode }))
        }
        case 'award': {
          if (!isHost) return new Response('Forbidden', { status: 403 })
          const awardPlayerId = String(fd.get('playerId') ?? '')
          const clueId = ctxBefore.state.current_clue_id
          if (!clueId) {
            return redirect(routes.games.host.href({ joinCode: params.joinCode }))
          }
          const clue = ctxBefore.clues.find((c) => c.id === clueId)
          if (clue && awardPlayerId) {
            await addPlayerScore(params.joinCode, awardPlayerId, clue.value)
          }
          await patchGameState(params.joinCode, (state) => ({
            ...state,
            current_clue_id: null,
            buzzer_open: false,
            buzzes: [],
          }))
          return redirect(routes.games.host.href({ joinCode: params.joinCode }))
        }
        case 'penalize': {
          if (!isHost) return new Response('Forbidden', { status: 403 })
          const penPlayerId = String(fd.get('playerId') ?? '')
          const clueId = ctxBefore.state.current_clue_id
          if (clueId && penPlayerId) {
            const clue = ctxBefore.clues.find((c) => c.id === clueId)
            if (clue) {
              await addPlayerScore(params.joinCode, penPlayerId, -clue.value)
            }
          }
          await patchGameState(params.joinCode, (state) => ({
            ...state,
            buzzer_open: true,
            buzzes: [],
          }))
          return redirect(routes.games.host.href({ joinCode: params.joinCode }))
        }
        case 'end_game': {
          if (!isHost) return new Response('Forbidden', { status: 403 })
          await patchGameState(
            params.joinCode,
            (state, ctx) => {
              const sorted = [...ctx.players].sort((a, b) => b.score - a.score)
              return { ...state, winner_id: sorted[0]?.id ?? null }
            },
            { status: 'finished' },
          )
          return redirect(routes.games.host.href({ joinCode: params.joinCode }))
        }
        case 'buzz': {
          if (!playerId) return new Response('Forbidden', { status: 403 })
          await patchGameState(params.joinCode, (state) => {
            if (!state.buzzer_open) return state
            if (state.buzzes.some((b) => b.player_id === playerId)) return state
            return {
              ...state,
              buzzes: [...state.buzzes, { player_id: playerId!, at: Date.now() }],
            }
          })
          return redirect(routes.games.play.href({ joinCode: params.joinCode }))
        }
        default:
          return new Response('Bad Request', { status: 400 })
      }
    },

    async events({ params }) {
      const channel = gameChannel(params.joinCode)
      const subscriber = createSubscriber()
      const encoder = new TextEncoder()

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          let closed = false
          const close = () => {
            if (closed) return
            closed = true
            subscriber.unsubscribe().catch(() => undefined)
            subscriber.quit().catch(() => undefined)
            try {
              controller.close()
            } catch {
              /* ignore */
            }
          }

          subscriber.subscribe(channel).catch((err) => {
            console.error('SSE subscribe failed', err)
            close()
          })

          subscriber.on('message', (_chan, message) => {
            if (closed) return
            try {
              controller.enqueue(encoder.encode(`data: ${message}\n\n`))
            } catch {
              close()
            }
          })

          const keepalive = setInterval(() => {
            if (closed) return
            try {
              controller.enqueue(encoder.encode(`: ping\n\n`))
            } catch {
              close()
            }
          }, 25_000)

          // The node-fetch-server adapter waits for the *second* chunk before
          // writing the first to the response. Enqueue two chunks immediately
          // so the first event reaches the client without a 25s stall.
          controller.enqueue(encoder.encode(`: sse-open\n\n`))
          controller.enqueue(encoder.encode(`data: {"type":"ready"}\n\n`))

          ;(controller as unknown as { _close?: () => void })._close = () => {
            clearInterval(keepalive)
            close()
          }
        },
        cancel() {
          const ctrl = this as unknown as { _close?: () => void }
          ctrl._close?.()
        },
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Connection: 'keep-alive',
        },
      })
    },
  },
} satisfies Controller<typeof routes.games>

interface HostProps {
  user: User
  ctx: GameWithBoard
}

function HostPage() {
  return ({ user, ctx }: HostProps) => {
    const rowValues =
      (ctx.board.row_values as unknown as BoardRowValuesShape)?.values ?? []
    const currentClue = ctx.state.current_clue_id
      ? ctx.clues.find((c) => c.id === ctx.state.current_clue_id)
      : null
    const firstBuzzer = ctx.state.buzzes[0]
    const firstBuzzerPlayer = firstBuzzer
      ? ctx.players.find((p) => p.id === firstBuzzer.player_id)
      : null

    return (
      <Layout title={`Host · ${ctx.game.join_code}`} user={user}>
        <GameHeader ctx={ctx} role="host" />

        {ctx.game.status === 'lobby' ? (
          <LobbyView ctx={ctx} canStart={true} />
        ) : currentClue ? (
          <div mix={clueViewStyle}>
            <p mix={clueValueStyle}>${currentClue.value}</p>
            <ClueBlock clue={currentClue} audience="host" />
            <p mix={clueResponseStyle}>
              <strong>Answer:</strong> {currentClue.response ?? '(none)'}
            </p>
            <div mix={buzzerStateStyle}>
              {ctx.state.buzzer_open ? (
                <span>BUZZER OPEN</span>
              ) : (
                <span>buzzer closed</span>
              )}
              {firstBuzzerPlayer ? (
                <strong> · First: {firstBuzzerPlayer.display_name}</strong>
              ) : null}
            </div>

            <div mix={hostActionsStyle}>
              {!ctx.state.buzzer_open ? (
                <ActionButton joinCode={ctx.game.join_code} action="open_buzzer">
                  Open buzzer
                </ActionButton>
              ) : null}
              {firstBuzzerPlayer ? (
                <>
                  <ActionButton
                    joinCode={ctx.game.join_code}
                    action="award"
                    extra={{ playerId: firstBuzzerPlayer.id }}
                  >
                    Correct (+${currentClue.value})
                  </ActionButton>
                  <ActionButton
                    joinCode={ctx.game.join_code}
                    action="penalize"
                    extra={{ playerId: firstBuzzerPlayer.id }}
                  >
                    Wrong (-${currentClue.value})
                  </ActionButton>
                </>
              ) : null}
              <ActionButton joinCode={ctx.game.join_code} action="close_clue">
                Close clue (no answer)
              </ActionButton>
            </div>
          </div>
        ) : ctx.game.status === 'finished' ? (
          <FinishedView ctx={ctx} />
        ) : (
          <>
            <BoardForHost ctx={ctx} rowValues={rowValues} />
            <div mix={endGameRowStyle}>
              <ActionButton joinCode={ctx.game.join_code} action="end_game">
                End game
              </ActionButton>
            </div>
          </>
        )}

        <Scoreboard ctx={ctx} />
        <LiveScript joinCode={ctx.game.join_code} />
      </Layout>
    )
  }
}

interface JoinPageProps {
  joinCode: string
  user: User | null
  ctx: GameWithBoard
}

function JoinPage() {
  return ({ joinCode, user, ctx }: JoinPageProps) => (
    <Layout title={`Join · ${joinCode}`} user={user}>
      <GameHeader ctx={ctx} role="player" />
      <form
        method="post"
        action={routes.games.join.href({ joinCode })}
        mix={joinFormStyle}
      >
        <label mix={joinLabelStyle}>
          <span>Display name</span>
          <input
            type="text"
            role="textbox"
            name="displayName"
            value={user?.username ?? ''}
            required
            mix={joinInputStyle}
          />
        </label>
        <button type="submit" mix={primaryButtonStyle}>
          Join game
        </button>
      </form>
    </Layout>
  )
}

interface PlayerProps {
  user: User | null
  ctx: GameWithBoard
  playerId: string
  displayName: string
}

function PlayerPage() {
  return ({ user, ctx, playerId, displayName }: PlayerProps) => {
    const rowValues =
      (ctx.board.row_values as unknown as BoardRowValuesShape)?.values ?? []
    const currentClue = ctx.state.current_clue_id
      ? ctx.clues.find((c) => c.id === ctx.state.current_clue_id)
      : null
    const meBuzzed = ctx.state.buzzes.some((b) => b.player_id === playerId)
    const me = ctx.players.find((p) => p.id === playerId)

    return (
      <Layout title={`Play · ${ctx.game.join_code}`} user={user}>
        <GameHeader ctx={ctx} role="player" />
        <p mix={playerBadgeStyle}>
          Playing as <strong>{displayName}</strong> · Score:{' '}
          <strong>${me?.score ?? 0}</strong>
        </p>

        {ctx.game.status === 'lobby' ? (
          <p mix={emptyStyle}>Waiting for the host to start the game…</p>
        ) : currentClue ? (
          <div mix={clueViewStyle}>
            <p mix={clueValueStyle}>${currentClue.value}</p>
            <ClueBlock clue={currentClue} audience="player" />
            {ctx.state.buzzer_open && !meBuzzed ? (
              <ActionButton
                joinCode={ctx.game.join_code}
                action="buzz"
                big
              >
                BUZZ!
              </ActionButton>
            ) : meBuzzed ? (
              <p mix={alreadyBuzzedStyle}>You buzzed in!</p>
            ) : (
              <p mix={waitingStyle}>Wait for host to open buzzer…</p>
            )}
          </div>
        ) : ctx.game.status === 'finished' ? (
          <FinishedView ctx={ctx} />
        ) : (
          <BoardForPlayer ctx={ctx} rowValues={rowValues} />
        )}

        <Scoreboard ctx={ctx} highlightId={playerId} />
        <LiveScript joinCode={ctx.game.join_code} />
      </Layout>
    )
  }
}

interface SpectatorProps {
  user: User | null
  ctx: GameWithBoard
}

function SpectatorPage() {
  return ({ user, ctx }: SpectatorProps) => {
    const rowValues =
      (ctx.board.row_values as unknown as BoardRowValuesShape)?.values ?? []
    const currentClue = ctx.state.current_clue_id
      ? ctx.clues.find((c) => c.id === ctx.state.current_clue_id)
      : null

    return (
      <Layout title={`Watch · ${ctx.game.join_code}`} user={user}>
        <GameHeader ctx={ctx} role="spectator" />

        {ctx.game.status === 'lobby' ? (
          <p mix={emptyStyle}>Waiting for the host to start the game…</p>
        ) : currentClue ? (
          <div mix={clueViewStyle}>
            <p mix={clueValueStyle}>${currentClue.value}</p>
            <ClueBlock clue={currentClue} audience="spectator" />
            <p mix={waitingStyle}>
              {ctx.state.buzzer_open ? 'Players may buzz in.' : 'Buzzer closed.'}
            </p>
          </div>
        ) : ctx.game.status === 'finished' ? (
          <FinishedView ctx={ctx} />
        ) : (
          <BoardForPlayer ctx={ctx} rowValues={rowValues} />
        )}

        <Scoreboard ctx={ctx} />
        <LiveScript joinCode={ctx.game.join_code} />
      </Layout>
    )
  }
}

interface GameHeaderProps {
  ctx: GameWithBoard
  role: 'host' | 'player' | 'spectator'
}

function GameHeader() {
  return ({ ctx, role }: GameHeaderProps) => (
    <div mix={gameHeaderStyle}>
      <div>
        <h1 mix={gameHeaderTitleStyle}>{ctx.board.title}</h1>
        <p mix={gameHeaderJoinStyle}>
          JOIN CODE:{' '}
          <code mix={gameJoinCodeStyle}>{ctx.game.join_code}</code> · {role.toUpperCase()}
        </p>
      </div>
      <nav mix={gameHeaderNavStyle}>
        <a href={routes.games.host.href({ joinCode: ctx.game.join_code })}>Host</a>
        <a href={routes.games.play.href({ joinCode: ctx.game.join_code })}>Play</a>
        <a href={routes.games.watch.href({ joinCode: ctx.game.join_code })}>Watch</a>
      </nav>
    </div>
  )
}

interface LobbyProps {
  ctx: GameWithBoard
  canStart: boolean
}

function LobbyView() {
  return ({ ctx, canStart }: LobbyProps) => {
    const playUrl = routes.games.play.href({ joinCode: ctx.game.join_code })
    const watchUrl = routes.games.watch.href({ joinCode: ctx.game.join_code })
    return (
      <div mix={lobbyBoxStyle}>
        <h2 mix={subHeadingStyle}>Lobby</h2>
        <p>Players can join at:</p>
        <p>
          <code mix={joinUrlStyle}>{playUrl}</code>
        </p>
        <p>Spectators can watch at:</p>
        <p>
          <code mix={joinUrlStyle}>{watchUrl}</code>
        </p>
        <p mix={css({ marginTop: '24px' })}>
          {ctx.players.length === 0 ? (
            <em>No players yet…</em>
          ) : (
            <>
              <strong>Players ({ctx.players.length}):</strong>{' '}
              {ctx.players.map((p) => p.display_name).join(', ')}
            </>
          )}
        </p>
        {canStart ? (
          <div mix={css({ marginTop: '24px' })}>
            <ActionButton joinCode={ctx.game.join_code} action="start" big>
              Start game
            </ActionButton>
          </div>
        ) : null}
      </div>
    )
  }
}

interface BoardForHostProps {
  ctx: GameWithBoard
  rowValues: number[]
}

function BoardForHost() {
  return ({ ctx, rowValues }: BoardForHostProps) => {
    const cluesByCat = groupCluesByCat(ctx.clues)
    return (
      <div mix={gridWrapperStyle}>
        <div
          mix={gridStyle}
          style={{ gridTemplateColumns: `repeat(${ctx.categories.length}, minmax(90px, 1fr))` }}
        >
          {ctx.categories.map((cat) => (
            <div mix={categoryCellStyle}>{cat.title}</div>
          ))}
          {rowValues.map((_, rowIdx) => (
            <>
              {ctx.categories.map((cat) => {
                const clue = cluesByCat
                  .get(cat.id)
                  ?.find((c) => c.row_position === rowIdx)
                if (!clue) return <div mix={cellStyle}>—</div>
                const revealed = ctx.state.revealed[clue.id]
                if (revealed) {
                  return <div mix={cellRevealedStyle}>—</div>
                }
                return (
                  <form
                    method="post"
                    action={routes.games.action.href({ joinCode: ctx.game.join_code })}
                    mix={cellFormStyle}
                  >
                    <input type="hidden" name="action" value="open_clue" />
                    <input type="hidden" name="clueId" value={clue.id} />
                    <button type="submit" mix={cellButtonStyle}>
                      <span mix={cellValueStyle2}>${clue.value}</span>
                    </button>
                  </form>
                )
              })}
            </>
          ))}
        </div>
      </div>
    )
  }
}

function BoardForPlayer() {
  return ({ ctx, rowValues }: BoardForHostProps) => {
    const cluesByCat = groupCluesByCat(ctx.clues)
    return (
      <div mix={gridWrapperStyle}>
        <div
          mix={gridStyle}
          style={{ gridTemplateColumns: `repeat(${ctx.categories.length}, minmax(90px, 1fr))` }}
        >
          {ctx.categories.map((cat) => (
            <div mix={categoryCellStyle}>{cat.title}</div>
          ))}
          {rowValues.map((_, rowIdx) => (
            <>
              {ctx.categories.map((cat) => {
                const clue = cluesByCat
                  .get(cat.id)
                  ?.find((c) => c.row_position === rowIdx)
                if (!clue) return <div mix={cellStyle}>—</div>
                const revealed = ctx.state.revealed[clue.id]
                return (
                  <div mix={revealed ? cellRevealedStyle : cellStyle}>
                    <span mix={cellValueStyle2}>
                      {revealed ? '—' : `$${clue.value}`}
                    </span>
                  </div>
                )
              })}
            </>
          ))}
        </div>
      </div>
    )
  }
}

function FinishedView() {
  return ({ ctx }: { ctx: GameWithBoard }) => {
    const winner = ctx.state.winner_id
      ? ctx.players.find((p) => p.id === ctx.state.winner_id)
      : null
    return (
      <div mix={finishedStyle}>
        <h2 mix={css({ color: 'var(--rr-accent)', fontSize: '32px', margin: '0 0 16px' })}>
          Game over!
        </h2>
        {winner ? (
          <p>
            🏆 <strong>{winner.display_name}</strong> wins with ${winner.score}.
          </p>
        ) : (
          <p>No winner determined.</p>
        )}
      </div>
    )
  }
}

function Scoreboard() {
  return ({
    ctx,
    highlightId,
  }: {
    ctx: GameWithBoard
    highlightId?: string
  }) => {
    const sorted = [...ctx.players].sort((a, b) => b.score - a.score)
    return (
      <div mix={scoreboardStyle}>
        <h3 mix={subHeadingStyle}>Scores</h3>
        {sorted.length === 0 ? (
          <p mix={css({ opacity: 0.6 })}>No players yet</p>
        ) : (
          <ul mix={css({ listStyle: 'none', margin: 0, padding: 0 })}>
            {sorted.map((p) => (
              <li
                mix={scoreRowStyle}
                style={{
                  fontWeight: p.id === highlightId ? 700 : 400,
                  color: p.id === highlightId ? 'var(--rr-text)' : 'var(--rr-accent)',
                }}
              >
                <span>{p.display_name}</span>
                <span>${p.score}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }
}

interface ActionButtonProps {
  joinCode: string
  action: string
  extra?: Record<string, string>
  big?: boolean
  children?: import('remix/ui').RemixNode
}

function ActionButton() {
  return ({ joinCode, action, extra, big, children }: ActionButtonProps) => (
    <form
      method="post"
      action={routes.games.action.href({ joinCode })}
      mix={css({ display: 'inline' })}
    >
      <input type="hidden" name="action" value={action} />
      {extra
        ? Object.entries(extra).map(([k, v]) => (
            <input type="hidden" name={k} value={v} />
          ))
        : null}
      <button type="submit" mix={big ? bigButtonStyle : primaryButtonStyle}>
        {children}
      </button>
    </form>
  )
}

function LiveScript() {
  return ({ joinCode }: { joinCode: string }) => (
    <script
      type="module"
      src={routes.assets.href({ path: 'app/assets/live-game.ts' })}
      data-join-code={joinCode}
    />
  )
}

function groupCluesByCat(clues: Clue[]): Map<string, Clue[]> {
  const map = new Map<string, Clue[]>()
  for (const c of clues) {
    const arr = map.get(c.category_id) ?? []
    arr.push(c)
    map.set(c.category_id, arr)
  }
  return map
}

interface ClueBlockProps {
  clue: Clue
  audience: 'host' | 'player' | 'spectator'
}

function ClueBlock() {
  return ({ clue, audience }: ClueBlockProps) => {
    const payload: CluePayload = parseCluePayload(clue.payload)
    return (
      <>
        <p mix={cluePromptStyle}>{clue.prompt ?? '(no prompt)'}</p>
        {payload.type === 'multiple_choice' ? (
          <ul mix={optionsListStyle}>
            {payload.options.map((opt, i) => {
              const isCorrect = audience === 'host' && i === payload.correct
              return (
                <li
                  mix={optionItemStyle}
                  style={
                    isCorrect
                      ? { borderColor: 'var(--rr-success)', color: 'var(--rr-success)' }
                      : undefined
                  }
                >
                  <span mix={optionLetterStyle}>
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span>{opt}</span>
                  {isCorrect ? <span mix={correctTagStyle}>correct</span> : null}
                </li>
              )
            })}
          </ul>
        ) : null}
        {payload.type === 'file' ? (
          <div mix={mediaWrapperStyle}>
            <ClueMedia payload={payload} />
          </div>
        ) : null}
      </>
    )
  }
}

interface ClueMediaProps {
  payload: Extract<CluePayload, { type: 'file' }>
}

function ClueMedia() {
  return ({ payload }: ClueMediaProps) => {
    const src = routes.files.show.href({ key: payload.key })
    if (payload.media === 'image') {
      return <img src={src} alt="" mix={mediaImageStyle} />
    }
    if (payload.media === 'audio') {
      return <audio src={src} controls mix={mediaAudioStyle} />
    }
    return <video src={src} controls mix={mediaVideoStyle} />
  }
}

const optionsListStyle = css({
  listStyle: 'none',
  padding: 0,
  margin: '8px 0 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  textAlign: 'left',
})

const optionItemStyle = css({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '10px 14px',
  border: '1px solid var(--rr-border)',
  borderRadius: '4px',
  fontSize: '16px',
  textAlign: 'left',
  '@media (max-width: 640px)': { padding: '10px 12px', fontSize: '15px' },
})

const optionLetterStyle = css({
  width: '28px',
  height: '28px',
  borderRadius: '50%',
  background: 'var(--rr-accent)',
  color: 'var(--rr-surface-muted)',
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
})

const correctTagStyle = css({
  marginLeft: 'auto',
  fontSize: '12px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
})

const mediaWrapperStyle = css({
  display: 'flex',
  justifyContent: 'center',
  margin: '8px 0 16px',
})

const mediaImageStyle = css({
  maxWidth: '100%',
  maxHeight: '360px',
  borderRadius: '6px',
  '@media (max-width: 640px)': { maxHeight: '240px' },
})

const mediaAudioStyle = css({
  width: '100%',
  maxWidth: '480px',
})

const mediaVideoStyle = css({
  maxWidth: '100%',
  maxHeight: '360px',
  borderRadius: '6px',
  '@media (max-width: 640px)': { maxHeight: '240px' },
})

// styles

const gameHeaderStyle = css({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '20px',
  flexWrap: 'wrap',
  gap: '12px',
  '@media (max-width: 640px)': { marginBottom: '16px' },
})

const gameHeaderTitleStyle = css({
  margin: 0,
  color: 'var(--rr-accent)',
  fontSize: '24px',
  '@media (max-width: 640px)': { fontSize: '18px' },
})

const gameHeaderJoinStyle = css({
  margin: '4px 0 0',
  fontSize: '13px',
  opacity: 0.85,
  '@media (max-width: 640px)': { fontSize: '12px' },
})

const gameJoinCodeStyle = css({
  fontFamily: 'monospace',
  background: 'var(--rr-accent-soft)',
  padding: '2px 8px',
  borderRadius: '3px',
  color: 'var(--rr-accent)',
})

const gameHeaderNavStyle = css({
  display: 'flex',
  gap: '12px',
  fontSize: '13px',
  '& a': { textDecoration: 'none' },
  '& a:hover': { textDecoration: 'underline' },
})

const lobbyBoxStyle = css({
  background: 'var(--rr-surface)',
  border: '1px solid var(--rr-border-strong)',
  borderRadius: '8px',
  padding: '32px',
  marginBottom: '24px',
  '@media (max-width: 640px)': { padding: '20px 16px', borderWidth: '1px' },
})

const subHeadingStyle = css({
  margin: '0 0 12px',
  color: 'var(--rr-accent)',
  fontSize: '20px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  '@media (max-width: 640px)': { fontSize: '16px' },
})

const joinUrlStyle = css({
  fontFamily: 'monospace',
  background: 'var(--rr-accent-soft)',
  padding: '6px 12px',
  borderRadius: '4px',
  color: 'var(--rr-accent)',
  wordBreak: 'break-all',
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
  background: 'var(--rr-surface-muted)',
  padding: '4px',
  border: '1px solid var(--rr-border-strong)',
})

const categoryCellStyle = css({
  background: 'var(--rr-surface-muted)',
  padding: '16px 8px',
  minHeight: '64px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  textTransform: 'uppercase',
  fontWeight: 700,
  letterSpacing: '0.04em',
  color: 'var(--rr-accent)',
  fontSize: '14px',
  '@media (max-width: 640px)': { padding: '10px 4px', minHeight: '48px', fontSize: '11px' },
})

const cellStyle = css({
  background: 'var(--rr-surface-muted)',
  minHeight: '90px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--rr-accent)',
  fontSize: '28px',
  fontWeight: 700,
  '@media (max-width: 640px)': { minHeight: '64px', fontSize: '18px' },
})

const cellRevealedStyle = css({
  background: 'var(--rr-surface-muted)',
  minHeight: '90px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--rr-border)',
  fontSize: '28px',
  '@media (max-width: 640px)': { minHeight: '64px', fontSize: '18px' },
})

const cellFormStyle = css({ display: 'block' })

const cellButtonStyle = css({
  width: '100%',
  height: '100%',
  minHeight: '90px',
  background: 'var(--rr-surface-muted)',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--rr-accent)',
  fontFamily: 'inherit',
  '&:hover': { background: 'var(--rr-surface-alt)' },
  '@media (max-width: 640px)': { minHeight: '64px' },
})

const cellValueStyle2 = css({
  fontSize: '28px',
  fontWeight: 700,
  fontFamily: "'Helvetica Neue', Arial, sans-serif",
  textShadow: '3px 3px 0 #000',
  '@media (max-width: 640px)': { fontSize: '18px', textShadow: '2px 2px 0 #000' },
})

const clueViewStyle = css({
  background: 'var(--rr-surface-muted)',
  padding: '40px',
  border: '1px solid var(--rr-border-strong)',
  borderRadius: '8px',
  textAlign: 'center',
  marginBottom: '24px',
  '@media (max-width: 640px)': { padding: '20px 14px', borderWidth: '1px' },
})

const clueValueStyle = css({
  fontSize: '48px',
  color: 'var(--rr-accent)',
  margin: '0 0 16px',
  fontWeight: 700,
  textShadow: '4px 4px 0 #000',
  '@media (max-width: 640px)': { fontSize: '32px', textShadow: '3px 3px 0 #000' },
})

const cluePromptStyle = css({
  fontSize: '24px',
  margin: '0 0 16px',
  lineHeight: 1.4,
  '@media (max-width: 640px)': { fontSize: '18px' },
})

const clueResponseStyle = css({
  fontSize: '16px',
  opacity: 0.85,
  margin: '0 0 24px',
  '@media (max-width: 640px)': { fontSize: '14px', margin: '0 0 16px' },
})

const buzzerStateStyle = css({
  marginBottom: '16px',
  fontSize: '14px',
  color: 'var(--rr-accent)',
})

const hostActionsStyle = css({
  display: 'flex',
  gap: '8px',
  justifyContent: 'center',
  flexWrap: 'wrap',
  '@media (max-width: 640px)': { flexDirection: 'column', alignItems: 'stretch' },
})

const alreadyBuzzedStyle = css({
  fontSize: '20px',
  color: 'var(--rr-accent)',
  fontWeight: 700,
})

const waitingStyle = css({
  fontSize: '16px',
  opacity: 0.7,
})

const playerBadgeStyle = css({
  textAlign: 'center',
  marginBottom: '16px',
  fontSize: '15px',
})

const emptyStyle = css({
  padding: '40px',
  textAlign: 'center',
  opacity: 0.7,
  border: '2px dashed var(--rr-border)',
  borderRadius: '8px',
})

const endGameRowStyle = css({
  marginTop: '16px',
  textAlign: 'right',
})

const scoreboardStyle = css({
  marginTop: '32px',
  padding: '20px',
  background: 'var(--rr-surface)',
  border: '1px solid var(--rr-border)',
  borderRadius: '6px',
})

const scoreRowStyle = css({
  display: 'flex',
  justifyContent: 'space-between',
  padding: '8px 0',
  borderBottom: '1px solid var(--rr-accent-soft)',
  '&:last-child': { borderBottom: 'none' },
})

const finishedStyle = css({
  textAlign: 'center',
  padding: '40px',
  background: 'var(--rr-surface)',
  border: '1px solid var(--rr-border-strong)',
  borderRadius: '8px',
})

const joinFormStyle = css({
  maxWidth: '420px',
  margin: '40px auto',
  background: 'var(--rr-surface)',
  padding: '24px',
  border: '1px solid var(--rr-border-strong)',
  borderRadius: '8px',
})

const joinLabelStyle = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  marginBottom: '16px',
  '& > span:first-child': {
    color: 'var(--rr-accent)',
    fontSize: '12px',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
})

const joinInputStyle = css({
  padding: '10px 12px',
  background: 'var(--rr-surface-muted)',
  border: '1px solid var(--rr-border-strong)',
  borderRadius: '4px',
  color: 'var(--rr-text)',
  fontSize: '16px',
  outline: 'none',
  '&:focus': { borderColor: 'var(--rr-text)' },
})

const primaryButtonStyle = css({
  display: 'inline-block',
  padding: '12px 18px',
  background: 'var(--rr-accent)',
  color: 'var(--rr-surface-muted)',
  fontWeight: 700,
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  fontSize: '14px',
  '&:hover': { background: 'var(--rr-text)' },
  '@media (max-width: 640px)': { width: '100%', padding: '14px 18px', fontSize: '15px' },
})

const bigButtonStyle = css({
  display: 'inline-block',
  padding: '24px 48px',
  background: 'var(--rr-accent)',
  color: 'var(--rr-surface-muted)',
  fontWeight: 700,
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  fontSize: '24px',
  boxShadow: '0 4px 0 var(--rr-accent-shadow)',
  '&:hover': { background: 'var(--rr-text)', boxShadow: '0 4px 0 var(--rr-accent-shadow)' },
  '&:active': { transform: 'translateY(2px)', boxShadow: '0 2px 0 var(--rr-accent-shadow)' },
  '@media (max-width: 640px)': {
    width: '100%',
    padding: '24px 24px',
    fontSize: '22px',
    boxShadow: '0 3px 0 var(--rr-accent-shadow)',
  },
})
