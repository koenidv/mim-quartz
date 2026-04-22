FROM node:slim AS builder
WORKDIR /usr/src/app

COPY package.json package-lock.json ./
RUN npm ci

COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci

COPY . .
RUN npx quartz build
RUN cd server && npm run build

FROM node:slim
WORKDIR /usr/src/app
COPY --from=builder /usr/src/app/ /usr/src/app/

RUN apt-get update && apt-get install -y curl unzip git
RUN curl https://rclone.org/install.sh | bash

EXPOSE 3000
CMD ["sh", "-c", "cd server && npx tsx src/db-init.ts && npm start"]