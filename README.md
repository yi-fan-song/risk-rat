# Risk Rat

A self-hosted trivia game builder. Design category-by-value boards, share
them with a code, and run live games with separate host, player, and
spectator views.

## Stack

- [Remix v3 beta](https://remix.run) (server-first framework)
- Postgres 16 (via `remix/data-table-postgres`)
- Redis 7 (sessions + pub/sub for live game state)

## Running locally

Two modes, pick one:

**Dev mode** — fast restarts on file changes, containerized infra only:

```sh
docker compose up -d        # postgres + redis
npm install
npm run db:migrate
npm run db:seed             # public template boards (idempotent)
npm run dev                 # http://localhost:44100
```

**Full stack in Docker** — for production-like local runs or trying the
app without Node installed. Runs migrations + seed automatically on
container start:

```sh
docker compose --profile app up -d --build
# http://localhost:44100
```

Stop everything:

```sh
docker compose --profile app down
```

The `app` profile is opt-in, so plain `docker compose up -d` still only
brings up postgres + redis (matching the dev workflow). You can't run
both modes at once — both bind host port 44100.

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
