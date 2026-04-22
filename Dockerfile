FROM node:22-slim AS builder
WORKDIR /usr/src/app
COPY package.json package-lock.json* ./
RUN npm ci

# Copy server package.json and install deps
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm install

FROM node:22-slim
WORKDIR /usr/src/app
COPY --from=builder /usr/src/app/ /usr/src/app/
COPY . .

# Build Quartz and Server
RUN npx quartz build
RUN cd server && npm run build

EXPOSE 3000

# Run database initialization and start server
CMD ["sh", "-c", "cd server && npx tsx src/db-init.ts && npm start"]
