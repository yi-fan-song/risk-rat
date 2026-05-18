#!/bin/sh
# Container entrypoint. Compose's depends_on:service_healthy already waits for
# postgres + redis to be up, so we can run migrations immediately and bail out
# fast if anything is wrong with the schema.
set -eu

echo "==> Applying migrations"
npm run db:migrate

echo "==> Seeding templates (idempotent)"
# Don't fail boot if seeding hits an unexpected error — the app is still usable
# without the public templates and a developer can re-run `npm run db:seed`.
npm run db:seed || echo "WARN: seed failed, continuing"

echo "==> Starting Risk Rat on :${PORT:-44100}"
exec "$@"
