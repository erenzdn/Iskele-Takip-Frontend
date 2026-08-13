/**
 * GitHub Releases'e electron-builder ile yükleme.
 * SSL "unable to verify the first certificate" hatası için (kurumsal ağ / antivirüs):
 *   $env:RELEASE_SKIP_TLS_VERIFY="1"; npm run release:github
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

if (process.env.RELEASE_SKIP_TLS_VERIFY === '1') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  console.warn(
    '[release] UYARI: TLS sertifika doğrulaması kapatıldı (RELEASE_SKIP_TLS_VERIFY=1). Sadece güvendiğiniz ağda kullanın.'
  );
}

if (!process.env.GH_TOKEN) {
  const gh = spawnSync('gh', ['auth', 'token'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (gh.status === 0 && gh.stdout?.trim()) {
    process.env.GH_TOKEN = gh.stdout.trim();
    console.log('[release] GH_TOKEN gh CLI üzerinden alındı.');
  } else {
    console.error(
      '[release] GH_TOKEN bulunamadı. Önce: gh auth login\n' +
        '  veya PowerShell: $env:GH_TOKEN = "ghp_..."'
    );
    process.exit(1);
  }
}

console.log(`[release] GitHub publish başlıyor (v${pkg.version})...`);

const builder = spawnSync(
  'npx',
  ['electron-builder', '--config', 'electron-builder.config.js', '--win', '--publish', 'always'],
  {
    stdio: 'inherit',
    env: process.env,
    cwd: root,
    shell: process.platform === 'win32',
  }
);

if (builder.status !== 0) {
  console.error('\n[release] GitHub yükleme başarısız.');
  console.error(
    'Kurulum dosyası zaten oluştuysa elle yükleyebilirsiniz:\n' +
      `  gh release create v${pkg.version} "release/IskeleTakip Setup ${pkg.version}.exe" --repo erenzdn/Iskele-Takip-Frontend`
  );
  console.error(
    'SSL hatası için tekrar deneyin:\n' +
      '  PowerShell: $env:RELEASE_SKIP_TLS_VERIFY="1"; npm run release:github'
  );
  process.exit(builder.status ?? 1);
}

console.log('[release] GitHub publish tamamlandı.');
