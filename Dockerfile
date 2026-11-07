FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8000
COPY --from=build /app/dist ./dist
USER node
EXPOSE 8000
CMD ["node", "--enable-source-maps", "dist/main.mjs"]
