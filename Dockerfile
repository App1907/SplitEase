# ---- build ----
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- run ----
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# Shared volume for CSV exports (written by the consumer, served by the api).
# Created here so a fresh named volume inherits node:node ownership.
RUN mkdir -p /app/exports && chown -R node:node /app/exports
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
