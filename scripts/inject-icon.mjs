import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';
import os from 'os';

const RCEDIT = resolve(
  os.homedir(),
  'AppData/Local/electron-builder/Cache/winCodeSign/winCodeSign-2.6.0/rcedit-x64.exe'
);
const EXE = resolve('release/win-unpacked/IskeleTakip.exe');
const ICON = resolve('build/icons/icon.ico');

if (process.platform !== 'win32') {
  console.log('[inject-icon] Windows dışı platform, atlanıyor.');
  process.exit(0);
}

if (!existsSync(RCEDIT)) {
  console.error('[inject-icon] rcedit bulunamadı:', RCEDIT);
  process.exit(1);
}

if (!existsSync(EXE)) {
  console.error('[inject-icon] EXE bulunamadı:', EXE);
  process.exit(1);
}

console.log('[inject-icon] Icon enjekte ediliyor...');
execFileSync(RCEDIT, [EXE, '--set-icon', ICON]);
console.log('[inject-icon] Tamamlandı.');
