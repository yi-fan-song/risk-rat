# Risk Rat

A self-hosted trivia game builder. Design category-by-value boards, share
them with a code, and run live games with separate host, player, and
spectator views.

## Stack

- [Remix v3 beta](https://remix.run) (server-first framework)
- Postgres 16 (via `remix/data-table-postgres`)
- Redis 7 (sessions + pub/sub for live game state)

## Running locally

```sh
docker compose up -d        # postgres + redis
npm install
npm run db:migrate
npm run dev                 # http://localhost:44100
```

## Tests

```sh
npm run typecheck
npm run test:e2e            # Playwright end-to-end suite
```

## Project layout

- `app/controllers/` — route handlers + page UI
- `app/data/` — schema, db client, redis client, file storage
- `app/middleware/` — auth, session, database injection
- `app/ui/` — shared layout, document, form primitives, theme
- `app/routes.ts` — typed route contract
- `app/router.ts` — middleware stack + controller wiring
- `db/migrations/` — schema migrations
- `tests/e2e/` — Playwright tests

## Theming

All colors live in `app/ui/theme.ts`. Edit `themeValues` to recolor the
entire site — every component reads from `var(--rr-*)` CSS custom
properties.
