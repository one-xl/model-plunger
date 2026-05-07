FROM swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/node:20

WORKDIR /app

COPY package.json ./package.json
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json

RUN npm config set registry https://registry.npmmirror.com && npm install

COPY . .

EXPOSE 5173 8080

CMD ["sh", "-c", "cp -n .env.example .env && cp -n .env.example apps/api/.env && npm run db:generate && npm run db:push && npm run db:seed && npm run dev"]
