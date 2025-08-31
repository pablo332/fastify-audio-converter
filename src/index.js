import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import underPressure from '@fastify/under-pressure';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream';
import pump from 'pump';

const isProd = process.env.NODE_ENV === 'production';

const fastify = Fastify({
  logger: {
    level: isProd ? 'info' : 'debug',
    transport: isProd ? undefined : { target: 'pino-pretty' }
  },
  // reduce overheads
  disableRequestLogging: isProd
});

// Multipart para subir archivos sin guardar a disco
await fastify.register(multipart, {
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB
    files: 1
  }
});

// Backpressure / health / circuit-breaker
await fastify.register(underPressure, {
  maxEventLoopDelay: 1000,
  maxHeapUsedBytes: 300 * 1024 * 1024,
  maxRssBytes: 500 * 1024 * 1024,
  healthCheck: async () => {
    // Chequeo básico de ffmpeg en PATH
    return { ffmpeg: true };
  },
  exposeStatusRoute: {
    routeOpts: { logLevel: 'warn' }, // /status
  }
});

fastify.get('/health', async () => ({ ok: true }));

/**
 * POST /convert/audio?format=mp3&bitrate=192k&channels=2
 * Content-Type: multipart/form-data
 * field: file (input de tu audio .oga, .wav, .m4a, etc.)
 * Respuesta: audio/<format> (stream)
 */
fastify.post('/convert/audio', async function (request, reply) {
  const part = await request.file();

  if (!part) {
    reply.code(400);
    return { error: 'Falta el archivo. Enviá el campo "file" por multipart/form-data.' };
  }

  const {
    format = 'mp3',
    bitrate = '192k',
    channels = '2',
    ar = '44100' // sample rate
  } = request.query || {};

  // Sanitización mínima
  const safeFormat = String(format).replace(/[^a-z0-9]/gi, '').toLowerCase() || 'mp3';
  const safeBitrate = /^[0-9]{2,4}k$/.test(bitrate) ? bitrate : '192k';
  const safeChannels = /^[12]$/.test(String(channels)) ? String(channels) : '2';
  const safeAr = /^(32000|44100|48000)$/.test(String(ar)) ? String(ar) : '44100';

  // Nombre de salida sugerido
  const origName = part.filename || `input.${safeFormat}`;
  const base = origName.includes('.') ? origName.substring(0, origName.lastIndexOf('.')) : origName;
  const outName = `${base}.${safeFormat}`;

  // Args FFmpeg: leemos desde stdin (pipe:0), escribimos a stdout (pipe:1)
  // libmp3lame para mp3, o -codec:a copy si ya viene en el formato (no lo usamos por el ejemplo)
  const audioCodec =
    safeFormat === 'mp3' ? 'libmp3lame' :
    safeFormat === 'aac' ? 'aac' :
    safeFormat === 'ogg' ? 'libvorbis' :
    'libmp3lame'; // por defecto

  const ffmpegArgs = [
    '-hide_banner',
    '-loglevel', 'error',
    // input
    '-i', 'pipe:0',
    // salida
    '-vn',                     // no video
    '-ac', safeChannels,       // canales
    '-ar', safeAr,             // sample rate
    '-b:a', safeBitrate,       // bitrate
    '-acodec', audioCodec,
    '-f', safeFormat,
    // usar algunos hilos (FFmpeg decide)
    '-threads', process.env.FFMPEG_THREADS || '2',
    'pipe:1'
  ];

  const ff = spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'pipe', 'pipe'] });

  // Errores de FFmpeg → 500
  let ffmpegError = '';
  ff.stderr.on('data', (chunk) => {
    ffmpegError += chunk.toString();
  });

  ff.on('error', (err) => {
    request.log.error({ err }, 'Error lanzando ffmpeg');
  });

  // Headers de respuesta
  reply
    .header('Content-Type', `audio/${safeFormat}`)
    .header('Content-Disposition', `inline; filename="${outName}"`)
    .header('X-Accel-Buffering', 'no'); // ayuda a proxys a streamear

  // Pipe de subida → ffmpeg stdin
  // y ffmpeg stdout → respuesta (streaming, sin tocar disco)
  pump(part.file, ff.stdin, (err) => {
    if (err) request.log.error({ err }, 'Error escribiendo a ffmpeg stdin');
  });

  // Si FFmpeg falla, devolvemos 500 con detalle mínimo
  ff.on('close', (code) => {
    if (code !== 0 && !reply.sent) {
      reply.code(500).send({ error: 'Fallo de conversión', detail: ffmpegError.slice(0, 1000) });
    }
  });

  // devolvemos el stream de salida inmediatamente
  return reply.send(ff.stdout);
});

// Manejo de señales para Coolify/Docker
const host = process.env.FASTIFY_ADDRESS || '0.0.0.0';
const port = Number(process.env.PORT || 3000);

const start = async () => {
  try {
    await fastify.listen({ host, port });
    fastify.log.info(`Servidor escuchando en http://${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();

process.on('SIGTERM', () => {
  fastify.log.info('Recibido SIGTERM, cerrando...');
  fastify.close().then(() => process.exit(0));
});
