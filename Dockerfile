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
# Added 'ls -R' to debug exactly what files exist at runtime
CMD ["sh", "-c", "ls -R auth-system && npx tsx auth-system/db-init.ts && npx tsx auth-system/auth-server.ts"]
