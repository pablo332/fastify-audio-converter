FROM node:24-alpine

WORKDIR /app

# Instala dependencias del sistema
RUN apk update && apk upgrade && \
    apk add --no-cache \
    ffmpeg \
    python3 \
    make \
    g++ \
    git \
    openssl \
    ca-certificates \
    && rm -rf /var/cache/apk/* \
    && ln -sf /usr/bin/python3 /usr/bin/python

# Verifica versiones
RUN node -v && npm -v

# Copia solo los archivos de dependencias primero
COPY package*.json ./

# Instala dependencias
# Más rápido y confiable que npm install
RUN npm ci --only=production  

# Copia el resto de la aplicación
COPY . .

# Configura seguridad
RUN addgroup -g 1001 -S nodejs && \
    adduser -S fastify -u 1001 && \
    chown -R fastify:nodejs /app

USER fastify

# Variables de entorno
EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000
ENV FASTIFY_ADDRESS=0.0.0.0
ENV FFMPEG_THREADS=2

CMD ["npm", "start"]