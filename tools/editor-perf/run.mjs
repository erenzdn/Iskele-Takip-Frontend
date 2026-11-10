/**
 * Şablon editörü performans ölçümü: node tools/editor-perf/run.mjs [--port 5198]
 */
import { spawn } from 'child_process';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const portIndex = process.argv.indexOf('--port');
const port = portIndex >= 0 ? Number(process.argv[portIndex + 1]) : 5198;

const vite = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort'], {
  cwd: root,
  stdio: 'ignore',
});

const url = `http://localhost:${port}/tools/editor-perf/perf.html`;
let code = 1;
try {
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {
      /* henüz açılmadı */
    }
    if (i > 120) throw new Error('Vite açılmadı');
    await new Promise((r) => setTimeout(r, 500));
  }
  const electronBin = join(root, 'node_modules/electron/dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
  const env = { ...process.env, PERF_URL: url };
  delete env.ELECTRON_RUN_AS_NODE;
  code = await new Promise((res) => {
    const child = spawn(electronBin, [join(here, 'electron-main.cjs')], { cwd: root, env, stdio: 'inherit' });
    child.on('exit', res);
  });
} finally {
  vite.kill();
}
process.exit(code ?? 1);
