FROM node:22-slim
WORKDIR /usr/app

# 1. Install system tools
RUN apt-get update && apt-get install -y curl unzip git && rm -rf /var/lib/apt/lists/*
RUN curl https://rclone.org/install.sh | bash

# 2. Copy code
COPY . .

# 3. Install ALL dependencies into one root node_modules
RUN npm install --legacy-peer-deps

EXPOSE 3000

# 4. Start Command
# Using 'npx' ensures binaries are found in the local node_modules
CMD ["sh", "-c", "cat package.json && npx tsx scripts/db-init.ts && npx tsx scripts/auth-server.ts"]
