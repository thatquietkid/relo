FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY api/package.json api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY web/package.json web/package.json
COPY worker/package.json worker/package.json
RUN npm ci

COPY packages packages
COPY web web
RUN npm run build --workspace web

FROM nginx:1.27-alpine

COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html

EXPOSE 10000
CMD ["nginx", "-g", "daemon off;"]
