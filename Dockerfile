# Imagen base liviana + ffmpeg
FROM node:20-alpine AS base

# Instala ffmpeg
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copia los archivos de definición de dependencias (incluye el lock)
COPY package*.json ./

# Instala solo las dependencias de producción
RUN npm install --only=production

# Copia el resto del código fuente
COPY . .

# Variables de entorno
ENV NODE_ENV=production \
    PORT=3000 \
    FASTIFY_ADDRESS=0.0.0.0 \
    FFMPEG_THREADS=2

EXPOSE 3000

CMD ["npm", "start"]
