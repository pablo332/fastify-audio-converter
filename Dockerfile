# ---------------------------------------
# 1️⃣ Imagen base más nueva
FROM node:24-alpine AS base

# Instala ffmpeg (y otras utilidades de compilación si lo requieres)
RUN apk add --no-cache ffmpeg python3 make g++

WORKDIR /app

# 2️⃣ Copiar los archivos de dependencias
COPY package*.json ./

# 3️⃣ Instalar solo producción
RUN npm install --omit=dev
#RUN npm ci --only=production

# 4️⃣ Copia el resto del código
COPY . .

# Variables de entorno (puedes agruparlas en una sola línea)
ENV NODE_ENV=production \
    PORT=3000 \
    FASTIFY_ADDRESS=0.0.0.0 \
    FFMPEG_THREADS=2

EXPOSE 3000

CMD ["npm", "start"]
