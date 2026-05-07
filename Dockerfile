FROM node:20-alpine

WORKDIR /app

COPY package.json ./package.json
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json

RUN npm install

COPY . .

EXPOSE 5173 8080

CMD ["sh", "-c", "cp -n .env.example .env && npm run db:generate && npm run db:push && npm run dev"]
