FROM node:20-alpine

WORKDIR /app

RUN npm install -g pnpm@10

# Copy minimal workspace bootstrap files
COPY pnpm-workspace.yaml package.json ./

# Copy only the packages we actually need (NO api-spec, NO api-client-react, NO bot-config)
COPY lib/db/package.json ./lib/db/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY artifacts/api-server/package.json ./artifacts/api-server/

# Install without frozen lockfile (lockfile references all workspace packages)
RUN pnpm install --ignore-scripts

# Copy source files
COPY tsconfig.base.json ./
COPY lib/db ./lib/db
COPY lib/api-zod ./lib/api-zod
COPY artifacts/api-server/src ./artifacts/api-server/src
COPY artifacts/api-server/tsconfig.json artifacts/api-server/build.mjs ./artifacts/api-server/

# Write a minimal tsconfig.json that only references the libs we have
RUN echo '{"extends":"./tsconfig.base.json","files":[],"references":[{"path":"./lib/db"},{"path":"./lib/api-zod"}]}' > tsconfig.json

# Build libs first, then api-server
RUN pnpm run typecheck:libs
RUN pnpm --filter @workspace/api-server run build

ENV PORT=3000
ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "--enable-source-maps", "./artifacts/api-server/dist/index.mjs"]
