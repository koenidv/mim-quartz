FROM node:22-slim
WORKDIR /usr/app

# 1. Install system tools
RUN apt-get update && apt-get install -y curl unzip git && rm -rf /var/lib/apt/lists/*
RUN curl https://rclone.org/install.sh | bash

# 2. Copy code
COPY . .

# 3. Install dependencies
RUN npm install

EXPOSE 3000

# 4. Start Command
# Added 'cat package.json' to debug exactly what Node is seeing at runtime
CMD ["sh", "-c", "cat package.json && npx tsx scripts/db-init.ts && npx tsx scripts/auth-server.ts"]
