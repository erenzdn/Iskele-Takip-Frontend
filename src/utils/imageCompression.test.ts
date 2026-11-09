import { describe, expect, it } from 'vitest';
import { compressImageFile, fitWithin, isCompressibleImage, toJpegName } from './imageCompression';

describe('imageCompression', () => {
  it('fitWithin en uzun kenarı 1600 px\'e indirir, oranı korur', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: 1600 });
  });

  it('fitWithin küçük görseli büyütmez', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1600, 900)).toEqual({ width: 1600, height: 900 });
  });

  it('toJpegName uzantıyı .jpg yapar', () => {
    expect(toJpegName('irsaliye.PNG')).toBe('irsaliye.jpg');
    expect(toJpegName('şantiye foto.webp')).toBe('şantiye foto.jpg');
    expect(toJpegName('uzantısız')).toBe('uzantısız.jpg');
  });

  it('yalnızca JPEG/PNG/WebP sıkıştırılır', () => {
    expect(isCompressibleImage('image/jpeg')).toBe(true);
    expect(isCompressibleImage('image/png')).toBe(true);
    expect(isCompressibleImage('application/pdf')).toBe(false);
    expect(isCompressibleImage('image/gif')).toBe(false);
  });

  it('PDF dosyasını olduğu gibi döndürür', async () => {
    const pdf = new File(['%PDF-1.7'], 'irsaliye.pdf', { type: 'application/pdf' });
    await expect(compressImageFile(pdf)).resolves.toBe(pdf);
  });
});
