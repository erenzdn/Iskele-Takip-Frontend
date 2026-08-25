import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const destDir = join(root, 'dist-electron');
mkdirSync(destDir, { recursive: true });
copyFileSync(join(root, 'electron', 'preload.cjs'), join(destDir, 'preload.cjs'));
console.log('[preload] dist-electron/preload.cjs kopyalandı');
