FROM node:24-alpine

WORKDIR /app

# Instala dependencias del sistema
RUN apk update && apk upgrade && \
    apk add --no-cache \
    ffmpeg \
    make \
    g++ \
    git \
    openssl \
    ca-certificates \
    && rm -rf /var/cache/apk/*

# Copia e instala dependencias de Node.js
COPY package*.json ./
RUN npm ci --only=production && \
    npm cache clean --force

# Copia la aplicación
COPY . .

# Configuración de seguridad y permisos
RUN addgroup -g 1001 -S nodejs && \
    adduser -S fastify -u 1001 && \
    chown -R fastify:nodejs /app

USER fastify

# Variables de entorno (puedes agruparlas en una sola línea)
EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000
ENV FASTIFY_ADDRESS=0.0.0.0
ENV FFMPEG_THREADS=2

CMD ["npm", "start"]
