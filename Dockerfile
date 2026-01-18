# Build stage
FROM node:20-alpine AS build
WORKDIR /app

# Cache-buster: changes every build without needing build args
ARG BUILD_TS
RUN echo "BUILD_TS=${BUILD_TS:-dev}-$(date +%s)"

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Run stage
FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

EXPOSE 8080
CMD ["node", "dist/api/server.js"]
