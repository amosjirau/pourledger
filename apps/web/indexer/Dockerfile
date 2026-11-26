FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY app ./app
COPY components ./components
COPY lib ./lib
COPY next.config.ts tsconfig.json postcss.config.mjs ./
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NODE_USE_ENV_PROXY=1
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node indexer ./indexer
COPY --chown=node:node lib ./lib
USER node
CMD ["npm", "run", "index:worker"]

FROM runtime AS web
COPY --chown=node:node next.config.ts ./
COPY --from=build --chown=node:node /app/.next ./.next
CMD ["npm", "run", "start"]
