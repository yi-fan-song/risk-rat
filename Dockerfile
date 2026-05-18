# syntax=docker/dockerfile:1.7

# --- deps stage: install node_modules once, cache the layer ---
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# --- runtime stage: copy source + a non-root user ---
FROM node:24-alpine AS runtime
WORKDIR /app

# Source layers ordered most-stable → least-stable for caching.
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json tsconfig.json server.ts ./
COPY --chown=node:node docker-entrypoint.sh ./docker-entrypoint.sh
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node db ./db
COPY --chown=node:node app ./app

# Uploads live under tmp/; declare it as a mount target so compose can
# persist them across container restarts.
RUN mkdir -p tmp/uploads && chown -R node:node tmp \
    && chmod +x docker-entrypoint.sh

ENV NODE_ENV=production
ENV PORT=44100
EXPOSE 44100

USER node
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "run", "start:prod"]
