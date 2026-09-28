# ITSoc Management API — production image
# Build:  docker build -t itsoc-api ./backend
# Run:    see ../docker-compose.prod.yml

FROM node:22-alpine AS base
RUN apk add --no-cache openssl
WORKDIR /app

# ── Install all dependencies and generate the Prisma client ──
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY prisma ./prisma
RUN npx prisma generate

# ── Compile TypeScript ──
FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev --ignore-scripts

# ── Runtime: only production deps, compiled JS and migrations ──
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=4000 \
    UPLOAD_DIR=/app/uploads
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY prisma ./prisma
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/health || exit 1
# Apply pending migrations, sync roles/permissions, then start.
CMD ["npm", "run", "start:prod"]
