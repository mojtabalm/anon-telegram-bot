FROM node:20-alpine

WORKDIR /app

RUN npm install -g pnpm@10

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY lib/db/package.json ./lib/db/
COPY lib/api-spec/package.json ./lib/api-spec/ 2>/dev/null || true
COPY lib/api-zod/package.json ./lib/api-zod/
COPY artifacts/api-server/package.json ./artifacts/api-server/

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY tsconfig.base.json tsconfig.json ./
COPY lib/ ./lib/
COPY artifacts/api-server/src ./artifacts/api-server/src
COPY artifacts/api-server/tsconfig.json artifacts/api-server/build.mjs ./artifacts/api-server/

RUN pnpm run typecheck:libs
RUN pnpm --filter @workspace/api-server run build

ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "--enable-source-maps", "./artifacts/api-server/dist/index.mjs"]
