/**
 * Şablon editörü ↔ PDF eşitlik ölçümü — tek komut.
 *
 *   node tools/document-parity/run.mjs [--backend <IskeleTakipAPI klasörü>] [--out <klasör>]
 *                                      [--margins "15,15,15,15;0,0,0,0;25,20,25,20"]
 *                                      [--dsf "1,native"]   (ekran ölçekleri; native = Windows ayarı)
 *                                      [--templates "stress,features"]
 *
 * 1. Vite ile editör ölçüm sayfasını açar (uygulamanın CSS'i, fontu ve editör eklentileri).
 * 2. Uygulamanın kendi Electron'unda stres şablonunu sayfalar, glif konumlarını ölçer ve
 *    "Önizle" düğmesinin gönderdiği JSON'u üretir.
 * 3. Aynı JSON'u backend'in önizleme koduyla PDF'e basar.
 * 4. Satır satır karşılaştırır. Çıkış kodu 0 = birebir.
 */
import { spawn } from 'child_process';
import { mkdirSync, readdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const backendDir = resolve(arg('backend', resolve(root, '../../source/repos/IskeleTakipAPI')));
const outDir = resolve(arg('out', join(tmpdir(), 'document-parity')));
const margins = arg('margins', '15,15,15,15;0,0,0,0;25,20,25,20');
const port = Number(arg('port', 5199));
const scales = arg('dsf', '1,native').split(',');
const templates = arg('templates', 'stress,features');

function run(cmd, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', ...options });
    child.on('exit', (code) => (code === 0 ? resolvePromise() : reject(new Error(`${cmd} çıkış kodu ${code}`))));
  });
}

async function waitForServer(url) {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* henüz açılmadı */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Vite açılmadı: ${url}`);
}

mkdirSync(outDir, { recursive: true });
const vite = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort'], {
  cwd: root,
  stdio: 'ignore',
});

let exitCode = 1;
try {
  const url = `http://localhost:${port}/tools/document-parity/editor.html`;
  await waitForServer(url);

  // VS Code / Claude Code ELECTRON_RUN_AS_NODE=1 verebilir; Electron uygulama olarak açılmalı
  const electronBin = join(root, 'node_modules/electron/dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
  for (const scale of scales) {
    const env = { ...process.env, PARITY_URL: url, PARITY_OUT: outDir, PARITY_MARGINS: margins, PARITY_TEMPLATES: templates };
    delete env.ELECTRON_RUN_AS_NODE;
    if (scale !== 'native') env.PARITY_DSF = scale;
    await run(electronBin, [join(here, 'electron-main.cjs')], { cwd: root, env });
  }

  const editorFiles = readdirSync(outDir).filter((f) => /^editor-.*\.json$/.test(f)).map((f) => join(outDir, f));
  await run(process.execPath, [join(here, 'render-pdf.mjs'), backendDir, outDir, ...editorFiles], { cwd: backendDir });

  try {
    await run(process.execPath, [join(here, 'compare.mjs'), outDir], { cwd: root });
    exitCode = 0;
  } catch {
    exitCode = 1;
  }
  console.log(`\nÇıktılar: ${outDir}`);
} finally {
  vite.kill();
}
process.exit(exitCode);
