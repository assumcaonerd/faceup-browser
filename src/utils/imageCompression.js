const MB = 1024 * 1024;
const MAX_PIXELS = 24_000_000;

function extensionFor(type) {
  return type === 'image/webp' ? 'webp' : type === 'image/png' ? 'png' : 'jpg';
}

function renamedFile(file, type) {
  const base = file.name.replace(/\.[^.]+$/, '') || 'imagem';
  return `${base}.${extensionFor(type)}`;
}

export async function compressImage(file, options = {}) {
  const { maxDimension = 2048, quality = 0.9 } = options;
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    if (bitmap.width * bitmap.height > MAX_PIXELS) throw new Error('A imagem possui resolução excessiva. Use uma foto com até 24 megapixels.');
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    if (scale === 1 && file.size <= 2 * MB) return file;

    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const outputType = file.type === 'image/png' ? 'image/png' : file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
    const context = canvas.getContext('2d', { alpha: outputType === 'image/png' });
    if (!context) throw new Error('O navegador não conseguiu preparar a imagem.');
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Falha ao otimizar a imagem.')), outputType, quality));
    return new File([blob], renamedFile(file, outputType), { type: outputType, lastModified: file.lastModified });
  } finally { bitmap.close(); }
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}
