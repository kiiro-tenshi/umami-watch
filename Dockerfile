FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
COPY .env* ./
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install --omit=dev
COPY server/ ./
WORKDIR /app
COPY --from=frontend-builder /app/frontend/dist ./public
WORKDIR /app/server
ENV PORT=8080
EXPOSE 8080
CMD ["node", "index.js"]
