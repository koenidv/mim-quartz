FROM node:22-slim
WORKDIR /usr/app

# 1. Install system tools
RUN apt-get update && apt-get install -y curl unzip git && rm -rf /var/lib/apt/lists/*
RUN curl https://rclone.org/install.sh | bash

# 2. Copy source code (respecting .dockerignore)
COPY . .

# 3. Install dependencies
# Root (Quartz)
RUN npm install
# Server (Auth)
RUN cd server && npm install

# 4. Pre-build server
RUN cd server && ./node_modules/.bin/tsc

EXPOSE 3000

# 5. Start Command
# We bypass root 'npm run' and target the server's local scripts directly.
# This ensures that even if root package.json is missing or weirdly mounted, 
# the server will still start.
CMD ["sh", "-c", "cd /usr/app/server && ./node_modules/.bin/tsx src/db-init.ts && ./node_modules/.bin/tsx src/index.ts"]
