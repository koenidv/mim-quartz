FROM node:22-slim
WORKDIR /usr/app

# 1. Install system tools
RUN apt-get update && apt-get install -y curl unzip git && rm -rf /var/lib/apt/lists/*
RUN curl https://rclone.org/install.sh | bash

# 2. Copy code
COPY . .

# 3. Install dependencies
RUN npm install --legacy-peer-deps

EXPOSE 3000

# 4. Start Command
# Using absolute paths to remove all doubt
CMD ["sh", "-c", "ls -R /usr/app && npx tsx /usr/app/auth-system/db-init.ts && npx tsx /usr/app/auth-system/auth-server.ts"]
