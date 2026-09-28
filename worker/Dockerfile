FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY api/package.json api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY web/package.json web/package.json
COPY worker/package.json worker/package.json
RUN npm ci

COPY packages packages
COPY worker worker
RUN npm run build --workspace worker

FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/worker/package.json ./worker/package.json
COPY --from=build /app/worker/dist ./worker/dist

USER node
CMD ["npm", "--workspace", "worker", "run", "start"]
