FROM node:22-bookworm-slim AS web-builder
WORKDIR /web
COPY apps/game-core /game-core
COPY apps/web/package*.json ./
RUN npm ci --no-audit --no-fund
COPY apps/web/ ./
RUN npm run build

FROM node:22-bookworm-slim AS api-builder
WORKDIR /api
COPY apps/game-core /game-core
COPY apps/api/package*.json ./
RUN npm install --no-audit --no-fund
COPY apps/api/tsconfig.json ./
COPY apps/api/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production WEB_DIST_DIR=/app/public
WORKDIR /app
COPY --from=api-builder --chown=node:node /api/node_modules ./node_modules
COPY --from=api-builder --chown=node:node /api/dist ./dist
COPY --from=api-builder --chown=node:node /api/package.json ./package.json
COPY --chown=node:node apps/api/sql ./sql
COPY --from=web-builder --chown=node:node /web/dist ./public
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
