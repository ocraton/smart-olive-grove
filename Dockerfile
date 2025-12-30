FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
COPY tsconfig.json ./
RUN npm install
COPY . .

# Comando di fallback (solo se lanci il container senza docker-compose)
CMD ["echo", "Utilizza docker-compose per avviare i servizi specifici (monitor, analyzer, ecc.)"]