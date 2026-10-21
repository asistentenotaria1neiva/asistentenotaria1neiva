# Imagen de producción de la aplicación (Next.js en modo standalone)
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV BUILD_STANDALONE=1
RUN npx prisma generate && npm run plantillas:construir && npm run build \
 && node -p "require('./node_modules/prisma/package.json').version" > /version-prisma

FROM node:24-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/plantillas ./plantillas
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /version-prisma /version-prisma
# CLI de Prisma (misma versión del lockfile) solo para aplicar migraciones al iniciar
RUN npm install --prefix /opt/prisma "prisma@$(cat /version-prisma)" --no-audit --no-fund --loglevel=error
RUN mkdir -p almacenamiento && chown app:app almacenamiento
USER app
EXPOSE 3000
CMD ["sh", "-c", "node /opt/prisma/node_modules/prisma/build/index.js migrate deploy --schema prisma/schema.prisma && node server.js"]
