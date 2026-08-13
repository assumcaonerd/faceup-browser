import fs from 'node:fs';
import OpenAI, { toFile } from 'openai';
import formidable from 'formidable';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const requestWindows = new Map();

function sendJson(response, status, body) {
  response.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.send(JSON.stringify(body));
}

function applySecurityHeaders(response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
}

function isRateLimited(request) {
  const now = Date.now();
  const address = String(request.headers['x-forwarded-for'] || request.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const entry = requestWindows.get(address);
  if (!entry || now - entry.startedAt >= 60_000) {
    requestWindows.set(address, { startedAt: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > 3;
}

function firstFile(files, name) {
  const value = files[name];
  return Array.isArray(value) ? value[0] : value;
}

function validateImage(file, label) {
  if (!file) throw new Error(`A imagem de ${label} não foi enviada.`);
  if (!ALLOWED_TYPES.has(file.mimetype)) throw new Error(`A imagem de ${label} deve ser JPG, PNG ou WebP.`);
  if (!file.size || file.size > MAX_FILE_SIZE) throw new Error(`A imagem de ${label} deve ter no máximo 25 MB.`);
}

function buildPrompt(includeHair) {
  const hair = includeHair
    ? "Replace the target person's complete hairstyle, hairline, hair color, hair length, texture, volume and visible hair accessories with those of the source person."
    : "Keep the target person's original hair unchanged.";
  return `The first image is the TARGET photograph and must remain the compositional base. The second image is the SOURCE identity reference.

Create one photorealistic edited version of the TARGET. Replace only the target person's face with the source person's face, preserving the source identity, facial structure, eyes, eyebrows, nose, mouth and natural skin details. ${hair}

Preserve exactly from the TARGET: body, pose, hands, clothing, accessories unrelated to hair, framing, camera angle, background, objects, lighting direction, shadows and image dimensions. Blend the new face and hair naturally into the target neck, skin tone, perspective and lighting. Do not add text, watermarks, extra people, extra limbs or new accessories. The result must look like a single authentic professional photograph.`;
}

export default async function handler(request, response) {
  applySecurityHeaders(response);
  if (request.method === 'GET') return sendJson(response, 200, { available: Boolean(process.env.OPENAI_API_KEY), model: 'gpt-image-2' });
  if (request.method !== 'POST') return sendJson(response, 405, { error: 'Método não permitido.' });
  if (!process.env.OPENAI_API_KEY) return sendJson(response, 503, { error: 'O modo generativo ainda não foi configurado no servidor.' });
  if (isRateLimited(request)) {
    response.setHeader('Retry-After', '60');
    return sendJson(response, 429, { error: 'Limite temporário atingido. Aguarde um minuto e tente novamente.', fallbackToLocal: true });
  }

  let parsedFiles;
  try {
    const form = formidable({ maxFiles: 2, maxFileSize: MAX_FILE_SIZE, maxTotalFileSize: MAX_FILE_SIZE * 2, allowEmptyFiles: false });
    const [fields, files] = await form.parse(request);
    parsedFiles = files;
    const target = firstFile(files, 'target');
    const source = firstFile(files, 'source');
    validateImage(target, 'destino');
    validateImage(source, 'origem');
    const includeHair = String(fields.includeHair?.[0] ?? fields.includeHair ?? 'true') !== 'false';

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: process.env.OPENAI_BASE_URL, timeout: 180_000, maxRetries: 1 });
    const result = await client.images.edit({
      model: 'gpt-image-2',
      image: [
        await toFile(fs.createReadStream(target.filepath), target.originalFilename || 'target.png', { type: target.mimetype }),
        await toFile(fs.createReadStream(source.filepath), source.originalFilename || 'source.png', { type: source.mimetype }),
      ],
      prompt: buildPrompt(includeHair),
      quality: 'high',
      size: 'auto',
      output_format: 'png',
    });
    const image = result.data?.[0]?.b64_json;
    if (!image) throw new Error('O modelo não retornou uma imagem.');
    return sendJson(response, 200, { image, mimeType: 'image/png', model: 'gpt-image-2' });
  } catch (error) {
    console.error('Generative swap failed', error);
    const status = error.status && Number.isInteger(error.status) ? error.status : 500;
    return sendJson(response, status >= 400 && status < 600 ? status : 500, { error: status === 400 ? error.message : 'Não foi possível concluir a edição generativa. Tente novamente.' });
  } finally {
    if (parsedFiles) for (const values of Object.values(parsedFiles)) for (const file of Array.isArray(values) ? values : [values]) if (file?.filepath) fs.promises.unlink(file.filepath).catch(() => {});
  }
}
