FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.base.json ./tsconfig.base.json
COPY api/package.json api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY web/package.json web/package.json
COPY worker/package.json worker/package.json
RUN npm ci

COPY packages packages
COPY web web
RUN npm run build --workspace web

FROM nginx:1.27-alpine

RUN mkdir -p /var/cache/nginx /var/run /var/log/nginx \
  && chown -R nginx:nginx /var/cache/nginx /var/run /var/log/nginx /etc/nginx/conf.d /usr/share/nginx/html
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html

USER nginx
EXPOSE 10000
CMD ["nginx", "-g", "daemon off;"]
