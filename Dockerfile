# syntax=docker/dockerfile:1.7
#
# One image serves the Hono API and the built Vue SPA (railway-deploy skill).
# Build: install the whole workspace, build shared -> api -> web, then `pnpm deploy`
# the API with its production dependencies into /app and drop the web build beside it.

FROM node:24-alpine AS base
RUN npm install -g pnpm@9.15.4
WORKDIR /repo

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
# No BuildKit cache mount: Railway's builder rejects cache ids without its own service
# prefix, and a plain install only costs about a minute per build.
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
RUN pnpm deploy --filter=@diet-tracker/api --prod /app
RUN cp -r apps/web/dist /app/public

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
ENV WEB_DIST_DIR=/app/public
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000
# Migrations run before the server on every boot; already-applied files are skipped.
CMD ["sh", "-c", "node dist/migrate.js && node dist/index.js"]
