# Imagen base liviana + ffmpeg
FROM node:20-alpine AS base
RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=3000
ENV FASTIFY_ADDRESS=0.0.0.0
# Ajustá si tu server tiene más cores
ENV FFMPEG_THREADS=2

EXPOSE 3000
CMD ["npm", "start"]
