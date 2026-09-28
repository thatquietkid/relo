FROM node:22-alpine

ENV NODE_ENV=production
ENV PORT=10000

WORKDIR /app

COPY --chown=node:node prototype/ ./

USER node

EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 10000) + '/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
