FROM node:22-alpine

WORKDIR /app

COPY backend/package*.json ./
RUN npm install --omit=dev

COPY backend/server.js backend/admin-events.js backend/admin-users.js ./

ENV NODE_ENV=production
EXPOSE 10000
USER node

CMD ["node", "server.js"]
