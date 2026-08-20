# ---- Build client ----
FROM node:22-alpine AS client-builder
WORKDIR /app
COPY package*.json ./
COPY shared/package*.json shared/
COPY client/package*.json client/
RUN npm install
COPY shared/ shared/
COPY client/ client/
RUN npm run build -w client

# ---- Build server ----
FROM node:22-alpine AS server-builder
WORKDIR /app
COPY package*.json ./
COPY shared/package*.json shared/
COPY server/package*.json server/
RUN npm install
COPY shared/ shared/
COPY server/ server/
RUN npx prisma generate --schema=server/prisma/schema.prisma
RUN npm run build -w server

# ---- Runtime ----
FROM node:22-alpine
WORKDIR /app

# Copy server build & dependencies
COPY --from=server-builder /app/server/dist ./server/dist
COPY --from=server-builder /app/server/prisma ./server/prisma
COPY --from=server-builder /app/server/package.json ./server/package.json
COPY --from=server-builder /app/node_modules ./node_modules
COPY --from=server-builder /app/shared ./shared

# Copy client dist (place where server app.ts expects it)
COPY --from=client-builder /app/client/dist ./server/dist/client/dist

# Generate Prisma client in runtime
RUN cd server && npx prisma generate

# Expose port
ENV PORT=3000
EXPOSE 3000
ENV NODE_ENV=production

# Push DB schema in the background so the server starts immediately
# (prevents Render's port scan from cancelling the deploy when the
#  database connection is slow). Tables are created as soon as the
#  connection succeeds; the app retries on subsequent deploys if needed.
CMD ["sh", "-c", "cd server && (npx prisma db push --skip-generate || true) & node dist/server/src/index.js"]