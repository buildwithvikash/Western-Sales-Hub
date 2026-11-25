# Western Sales Hub: one container serving the API and the built React app.
#   docker build -t western-sales-hub .
#   docker compose up -d          (see docker-compose.yml: app + PostgreSQL)

# 1) Build the React app.
FROM node:22-alpine AS client
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --workspace client --include-workspace-root=false
COPY client client
RUN npm run build -w client

# 2) Server with production dependencies only.
FROM node:22-alpine
ENV NODE_ENV=production PORT=4000 UPLOAD_DIR=/data/uploads
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --workspace server --omit=dev --include-workspace-root=false && npm cache clean --force
COPY server server
COPY --from=client /app/client/dist client/dist
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
WORKDIR /app/server
EXPOSE 4000
VOLUME ["/data/uploads"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1
# Migrations run automatically at start.
CMD ["node", "src/index.js"]
