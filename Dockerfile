FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y \
    openssl \
    libssl-dev \
    fonts-noto \
    fonts-noto-extra \
    fonts-liberation \
    fontconfig \
    && fc-cache -f -v \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx prisma generate && npm run build

CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node dist/index.js"]
