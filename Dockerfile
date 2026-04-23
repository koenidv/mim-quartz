FROM node:slim
WORKDIR /usr/src/app

RUN apt-get update && apt-get install -y curl unzip git && rm -rf /var/lib/apt/lists/*
RUN curl https://rclone.org/install.sh | bash

COPY package.json package-lock.json* ./
RUN npm ci

COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm install

COPY . .

RUN cd server && npm run build

EXPOSE 3000

CMD ["sh", "-c", "cd server && npx tsx src/db-init.ts && npm start"]
