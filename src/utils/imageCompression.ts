/**
 * Yüklemeden önce görsel sıkıştırma: en uzun kenar MAX_EDGE px'e indirilir, JPEG'e çevrilir.
 * Telefon fotoğrafları (3–6 MB) tipik olarak 200–400 KB'a düşer; imzalı irsaliye taraması okunaklı kalır.
 * PDF ve küçük görseller olduğu gibi gönderilir.
 */

export const MAX_EDGE = 1600;
export const JPEG_QUALITY = 0.82;
/** Bu boyutun altındaki ve zaten küçük boyutlu görseller yeniden kodlanmaz */
export const SKIP_BELOW_BYTES = 400 * 1024;

const COMPRESSIBLE = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function isCompressibleImage(type: string): boolean {
  return COMPRESSIBLE.has(type);
}

/** En boy oranını koruyarak en uzun kenarı maxEdge'e indirir (büyütmez). */
export function fitWithin(width: number, height: number, maxEdge = MAX_EDGE): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge || longest === 0) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Uzantıyı .jpg yapar: "irsaliye.png" → "irsaliye.jpg" */
export function toJpegName(name: string): string {
  const base = name.replace(/\.[a-z0-9]{1,5}$/i, '') || 'gorsel';
  return `${base}.jpg`;
}

/**
 * Görseli sıkıştırır. Sıkıştırılamayan türleri (PDF) ve sıkıştırmanın büyüttüğü durumları
 * orijinal dosyayla döndürür.
 */
export async function compressImageFile(file: File): Promise<File> {
  if (!isCompressibleImage(file.type)) return file;

  // EXIF yönünü uygula: telefon fotoğrafları yan dönmesin
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const target = fitWithin(bitmap.width, bitmap.height);
    const needsResize = target.width !== bitmap.width || target.height !== bitmap.height;
    if (!needsResize && file.size <= SKIP_BELOW_BYTES) return file;

    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    // Şeffaf PNG'ler JPEG'de siyaha dönmesin
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, target.width, target.height);
    ctx.drawImage(bitmap, 0, 0, target.width, target.height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], toJpegName(file.name), { type: 'image/jpeg', lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}
