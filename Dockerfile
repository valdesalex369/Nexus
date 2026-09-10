FROM node:22-slim

WORKDIR /app

COPY server/package*.json ./server/
RUN cd server && npm ci --production

COPY server/ ./server/
COPY .env.example ./.env.example

RUN mkdir -p server/data/memory server/data/logs

EXPOSE 3001

WORKDIR /app/server
CMD ["node", "src/index.js"]
