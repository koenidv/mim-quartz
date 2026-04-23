FROM node:22-slim
WORKDIR /usr/app

# 1. Install system tools & rclone
RUN apt-get update && apt-get install -y curl unzip git && rm -rf /var/lib/apt/lists/*
RUN curl https://rclone.org/install.sh | bash

# 2. Copy source code
COPY . .

# 3. Install dependencies
RUN npm install --legacy-peer-deps

EXPOSE 3000

# 4. Start Command
# Runs database initialization then starts the Auth server.
# The server will handle the Quartz build in the background if needed.
CMD ["sh", "-c", "npx tsx auth-system/db-init.ts && npx tsx auth-system/auth-server.ts"]
