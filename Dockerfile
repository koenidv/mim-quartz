FROM node:slim
WORKDIR /usr/app

# 1. Install system dependencies & rclone
RUN apt-get update && apt-get install -y curl unzip git && rm -rf /var/lib/apt/lists/*
RUN curl https://rclone.org/install.sh | bash

# 2. Install project dependencies
COPY package.json package-lock.json* ./
RUN npm ci

COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm install

# 3. Copy source code
COPY . .

# 4. Build Auth Server (ensures TS is compiled)
RUN cd server && npm run build

EXPOSE 3000

# 5. Start the system
# We run 'quartz build' at runtime because 'content' is mounted at runtime.
# This generates the 'public' folder that our server will serve.
CMD ["sh", "-c", "/usr/local/bin/npx quartz build && cd /usr/app/server && /usr/local/bin/npx tsx src/db-init.ts && npm start"]
