FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
COPY tsconfig.json ./
RUN npm install
COPY . .
CMD ["npx", "ts-node", "index.ts"]