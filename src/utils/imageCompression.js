const MB = 1024 * 1024;
const MAX_PIXELS = 24_000_000;

function extensionFor(type) {
  return type === 'image/webp' ? 'webp' : type === 'image/png' ? 'png' : 'jpg';
}

function renamedFile(file, type) {
  const base = file.name.replace(/\.[^.]+$/, '') || 'imagem';
  return `${base}.${extensionFor(type)}`;
}

function loadWithImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('O navegador não conseguiu decodificar esta imagem.'));
    };
    image.src = url;
  });
}

const nativeCreateImageBitmap = typeof globalThis.createImageBitmap === 'function'
  ? globalThis.createImageBitmap.bind(globalThis)
  : null;

async function compatibleCreateImageBitmap(source, options) {
  if (nativeCreateImageBitmap) {
    try {
      return options ? await nativeCreateImageBitmap(source, options) : await nativeCreateImageBitmap(source);
    } catch (error) {
      if (options) {
        console.warn('[Imagem] Opções avançadas de decodificação indisponíveis; tentando modo padrão.', error);
        try { return await nativeCreateImageBitmap(source); } catch (fallbackError) {
          console.warn('[Imagem] Decodificação padrão indisponível; usando elemento de imagem.', fallbackError);
        }
      } else {
        console.warn('[Imagem] createImageBitmap indisponível para o arquivo; usando elemento de imagem.', error);
      }
    }
  }
  const decoded = await loadWithImageElement(source);
  const canvas = document.createElement('canvas');
  canvas.width = decoded.width; canvas.height = decoded.height;
  const context = canvas.getContext('2d');
  if (!context) { decoded.close(); throw new Error('O navegador não conseguiu preparar a imagem.'); }
  context.drawImage(decoded.source, 0, 0); decoded.close();
  canvas.close = () => {};
  return canvas;
}

// Compatibilidade para navegadores que expõem createImageBitmap, mas rejeitam
// a opção imageOrientation (ou certos JPEGs/PNGs válidos).
globalThis.createImageBitmap = compatibleCreateImageBitmap;

export async function decodeImageSource(file) {
  const bitmap = await compatibleCreateImageBitmap(file, { imageOrientation: 'from-image' });
  return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
}

export async function compressImage(file, options = {}) {
  const { maxDimension = 2048, quality = 0.9 } = options;
  const decoded = await decodeImageSource(file);
  try {
    if (decoded.width * decoded.height > MAX_PIXELS) throw new Error('A imagem possui resolução excessiva. Use uma foto com até 24 megapixels.');
    const scale = Math.min(1, maxDimension / Math.max(decoded.width, decoded.height));
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    if (scale === 1 && file.size <= 2 * MB) return file;

    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const outputType = file.type === 'image/png' ? 'image/png' : file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
    const context = canvas.getContext('2d', { alpha: outputType === 'image/png' });
    if (!context) throw new Error('O navegador não conseguiu preparar a imagem.');
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
    context.drawImage(decoded.source, 0, 0, width, height);
    const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Falha ao otimizar a imagem.')), outputType, quality));
    return new File([blob], renamedFile(file, outputType), { type: outputType, lastModified: file.lastModified });
  } finally { decoded.close(); }
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}
