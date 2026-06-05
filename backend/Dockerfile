# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM deps AS build
COPY . .
# prisma.config.ts zahtijeva DATABASE_URL pri učitavanju; generate ne spaja se na bazu
ENV DATABASE_URL="mysql://mudzy:nije,kikiriki@sql.ba101.top:3306/inventory-v3"
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# PDF prenosnica (transfer.generate_print_pdf): odkomentirati za LibreOffice u image-u
# RUN apk add --no-cache libreoffice
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./
COPY --from=build /app/generated ./generated
# Mount point za bind mount (produkcija: /mnt/shared-app-files/inventory-v2 → /app/uploads)
RUN mkdir -p /app/uploads && chown -R app:app /app
USER app
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]
