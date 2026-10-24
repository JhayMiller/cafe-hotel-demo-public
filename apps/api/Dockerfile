# Imagen multiarquitectura; compatible con OCI Ampere A1 (linux/arm64).
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY apps/api/package*.json ./
RUN npm install --no-audit --no-fund
COPY apps/api/tsconfig.json ./
COPY apps/api/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/package.json ./package.json
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
