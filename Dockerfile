# CITYMO ERP API — Express backend (Railway)
# Build context : racine du repo. Frontend Vite → Vercel uniquement.
FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

COPY server/ ./

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "index.js"]
