FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_URL=https://evidens.ba101.top/backend
ARG VITE_APP_NAME=Evidens
ARG VITE_APP_URL=https://evidens.ba101.top

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_APP_NAME=$VITE_APP_NAME
ENV VITE_APP_URL=$VITE_APP_URL

RUN npm run build

FROM node:22-alpine
WORKDIR /app
RUN npm install -g serve@14.2.4
COPY --from=builder /app/dist ./dist
EXPOSE 3000

CMD ["serve", "-s", "dist", "-l", "3000"]