FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY apps/web/package*.json ./
RUN npm install --no-audit --no-fund
COPY apps/web/ ./
RUN npm run build

FROM caddy:2-alpine
COPY --from=builder /app/dist /srv
COPY deploy/oci/Caddyfile /etc/caddy/Caddyfile
EXPOSE 80 443
