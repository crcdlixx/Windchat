FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Compute integrity hash of source at build time
RUN node scripts/compute-integrity.js

EXPOSE 4000

CMD ["sh", "-c", "npm run migrate && npm start"]
