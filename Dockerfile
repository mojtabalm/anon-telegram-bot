FROM node:20-alpine

WORKDIR /app

# Copy pre-built dist files
COPY dist/ ./dist/

# Copy minimal package.json for production deps only
COPY package.json ./

RUN npm install --omit=dev --ignore-scripts

ENV PORT=3000
ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
