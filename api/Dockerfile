FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.base.json tsconfig.base.json
COPY api/package.json api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY web/package.json web/package.json
COPY worker/package.json worker/package.json
RUN npm ci

COPY packages packages
COPY api api
RUN npm run build --workspace api

FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=10000

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/api/dist ./api/dist

USER node
EXPOSE 10000
CMD ["node", "api/dist/server.js"]
