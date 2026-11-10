/**
 * Şablon editörü performans + tabloya görsel ekleme senaryosu (uygulamanın Electron'u ile).
 * PERF_URL ortam değişkeniyle run.mjs üzerinden çalıştırın.
 */
const { app, BrowserWindow } = require('electron');

const url = process.env.PERF_URL;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 2x1 kırmızı PNG
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR42mP8z8DwnwEIGAEAHgMCAK2bR6kAAAAASUVORK5CYII=';

async function js(win, code) {
  return win.webContents.executeJavaScript(code);
}

async function typeChars(win, text) {
  const start = Date.now();
  for (const ch of text) {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: ch });
    win.webContents.sendInputEvent({ type: 'char', keyCode: ch });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: ch });
  }
  // Tüm girdiler işlenene kadar bekle (ana iş parçacığı boşalınca yanıt gelir)
  await js(win, 'new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)))');
  return Date.now() - start;
}

async function longTaskStats(win, reset = true) {
  return js(
    win,
    `(() => { const t = window.__longTasks; const s = { count: t.length, total: Math.round(t.reduce((a, b) => a + b, 0)), max: Math.round(Math.max(0, ...t)) }; ${reset ? 'window.__longTasks = [];' : ''} return s; })()`
  );
}

async function startProfile(win) {
  const dbg = win.webContents.debugger;
  if (!dbg.isAttached()) dbg.attach('1.3');
  await dbg.sendCommand('Profiler.enable');
  await dbg.sendCommand('Profiler.setSamplingInterval', { interval: 200 });
  await dbg.sendCommand('Profiler.start');
}

async function stopProfile(win, label) {
  const { profile } = await win.webContents.debugger.sendCommand('Profiler.stop');
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const dt = profile.timeDeltas;
  profile.samples.forEach((id, i) => self.set(id, (self.get(id) || 0) + (dt[i] || 0)));
  const agg = new Map();
  for (const [id, us] of self) {
    const f = byId.get(id).callFrame;
    if (f.functionName === '(idle)' || f.functionName === '(program)') continue;
    const key = `${f.functionName || '(anon)'} ${f.url.split('/').pop().split('?')[0]}:${f.lineNumber + 1}`;
    agg.set(key, (agg.get(key) || 0) + us);
  }
  // Kapsayıcı süre: proje kaynak dosyalarındaki fonksiyonlar (çağrı ağacında yukarı)
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const incl = new Map();
  for (const [id, us] of self) {
    const seen = new Set();
    for (let cur = id; cur != null; cur = parent.get(cur)) {
      const f = byId.get(cur).callFrame;
      if (!/\/src\/|tools\//.test(f.url)) continue;
      const key = `${f.functionName || '(anon)'} ${f.url.split('/').pop().split('?')[0]}:${f.lineNumber + 1}`;
      if (seen.has(key)) continue;
      seen.add(key);
      incl.set(key, (incl.get(key) || 0) + us);
    }
  }
  const top = (m) => [...m].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => `   ${(v / 1000).toFixed(0).padStart(6)} ms  ${k}`).join('\n');
  console.log(`--- ${label}: en çok öz süre ---\n${top(agg)}`);
  console.log(`--- ${label}: proje kodu kapsayıcı süre ---\n${top(incl)}`);
}

app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: true, width: 1400, height: 1000, webPreferences: { backgroundThrottling: false } });
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 3) console.warn('[sayfa hata]', message);
  });
  try {
    for (let attempt = 1; ; attempt++) {
      try {
        await win.loadURL(url);
        break;
      } catch (error) {
        if (attempt >= 3) throw error;
        await sleep(1500);
      }
    }
    for (let i = 0; i < 100; i++) {
      if (await js(win, '!!document.querySelector(".ProseMirror")?.editor')) break;
      await sleep(100);
    }
    await sleep(1500);
    await js(win, 'window.__longTasks = []');
    await startProfile(win);
    await js(win, `document.querySelector('.ProseMirror').editor.commands.setContent(window.__featuresTemplate)`);
    await sleep(2500);
    await stopProfile(win, 'içerik yükleme');
    console.log('yükleme sonrası uzun görevler:', await longTaskStats(win));

    // 1) Düz paragrafta yazma
    await js(win, `(() => { const e = document.querySelector('.ProseMirror').editor; e.commands.focus('end'); })()`);
    await sleep(500);
    await longTaskStats(win);
    const plainMs = await typeChars(win, 'abcdefghijabcdefghijabcdefghij');
    await sleep(1500);
    console.log(`düz metin 30 karakter: ${plainMs} ms`, await longTaskStats(win));

    // 2) Tablo hücresine görsel ekleme (2. hücre — başlık hücresi)
    const insert = await js(
      win,
      `(() => {
        const e = document.querySelector('.ProseMirror').editor;
        let cellPos = -1, n = 0;
        e.state.doc.descendants((node, pos) => {
          if (cellPos >= 0) return false;
          if (node.type.name === 'tableCell') { n++; if (n === 2) { cellPos = pos; return false; } }
          return true;
        });
        e.commands.focus();
        e.commands.setTextSelection(cellPos + 2);
        const before = JSON.stringify(e.getJSON()).split('imageResize').length - 1;
        const ok = e.chain().focus().setImage({ src: '${PNG}', width: 60 }).insertContent(' ').run();
        const after = JSON.stringify(e.getJSON()).split('imageResize').length - 1;
        let inCell = false;
        e.state.doc.descendants((node, pos) => {
          if (node.type.name === 'imageResize') {
            const $p = e.state.doc.resolve(pos);
            for (let d = $p.depth; d > 0; d--) if ($p.node(d).type.name === 'tableCell') inCell = true;
          }
        });
        return { ok, before, after, imgsInDom: document.querySelectorAll('.ProseMirror img').length };
      })()`
    );
    console.log('tabloya görsel ekleme:', insert);
    await sleep(1500);
    console.log('ekleme sonrası uzun görevler:', await longTaskStats(win));

    // 3) Görsel seçiliyken bekleme (döngü var mı?)
    await js(
      win,
      `(() => { const e = document.querySelector('.ProseMirror').editor; let p = -1; e.state.doc.descendants((n, pos) => { if (p < 0 && n.type.name === 'imageResize') p = pos; }); e.commands.setNodeSelection(p); })()`
    );
    await startProfile(win);
    await sleep(2000);
    await stopProfile(win, 'görsel seçili boşta');
    console.log('görsel seçiliyken 2 sn boşta:', await longTaskStats(win));

    // 4) Tablo hücresinde yazma
    await js(
      win,
      `(() => { const e = document.querySelector('.ProseMirror').editor; let p = -1, n = 0; e.state.doc.descendants((node, pos) => { if (p >= 0) return false; if (node.type.name === 'tableCell') { n++; if (n === 2) { p = pos; return false; } } return true; }); e.commands.setTextSelection(p + 4); e.commands.focus(); })()`
    );
    await sleep(500);
    await longTaskStats(win);
    await startProfile(win);
    const cellMs = await typeChars(win, 'abcdefghijabcdefghijabcdefghij');
    await sleep(1500);
    await stopProfile(win, 'hücrede yazma');
    console.log(`hücrede 30 karakter: ${cellMs} ms`, await longTaskStats(win));

    // 5) Gerçek tıklama akışı: hücre içine tıkla → araç çubuğuna tıkla (editör odağı kaybeder) → görsel ekle
    for (const cellIndex of [1, 2]) {
      const rect = await js(win, `(() => {
        const cells = document.querySelectorAll('.ProseMirror td');
        const r = cells[${cellIndex - 1}].getBoundingClientRect();
        cells[${cellIndex - 1}].scrollIntoView({ block: 'center' });
        const r2 = cells[${cellIndex - 1}].getBoundingClientRect();
        return { x: Math.round(r2.left + r2.width - 12), y: Math.round(r2.top + r2.height / 2) };
      })()`);
      await sleep(300);
      win.webContents.sendInputEvent({ type: 'mouseDown', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
      win.webContents.sendInputEvent({ type: 'mouseUp', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
      await sleep(400);
      const sel = await js(win, `(() => { const e = document.querySelector('.ProseMirror').editor; const s = e.state.selection; const $f = s.$from; let inCell = false; for (let d = $f.depth; d > 0; d--) if ($f.node(d).type.name === 'tableCell') inCell = true; return { type: s.constructor.name, from: s.from, inCell, node: s.node?.type.name ?? null }; })()`);
      const tb = await js(win, `(() => { const r = document.querySelector('header').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 10) }; })()`);
      win.webContents.sendInputEvent({ type: 'mouseDown', x: tb.x, y: tb.y, button: 'left', clickCount: 1 });
      win.webContents.sendInputEvent({ type: 'mouseUp', x: tb.x, y: tb.y, button: 'left', clickCount: 1 });
      await sleep(300);
      const res = await js(win, `(() => {
        const e = document.querySelector('.ProseMirror').editor;
        const count = () => { let n = 0; e.state.doc.descendants((x) => { if (x.type.name === 'imageResize') n++; }); return n; };
        const before = count();
        const { selection } = e.state;
        if (selection && 'node' in selection) e.commands.setTextSelection(selection.to);
        let error = null;
        try { e.chain().focus().setImage({ src: '${PNG}', width: 40 }).insertContent(' ').run(); } catch (err) { error = String(err); }
        const s = e.state.selection.$from; let inCell = false; for (let d = s.depth; d > 0; d--) if (s.node(d).type.name === 'tableCell') inCell = true;
        return { before, after: count(), cursorInCellAfter: inCell, error };
      })()`);
      console.log(`tıklama akışı hücre ${cellIndex}:`, { sel, ...res });
    }

    console.log('hücredeki görsellerin ekrandaki boyutu:', await js(win, `[...document.querySelectorAll('.ProseMirror td img')].map((i) => { const r = i.getBoundingClientRect(); const cs = getComputedStyle(i); return [Math.round(r.width), Math.round(r.height), cs.display, cs.visibility, i.complete && i.naturalWidth > 0]; })`));

    // 6) Logoya tıkla → seçilsin → sağ alt tutamaçtan 40px sağa sürükle
    const logo = await js(win, `(() => { const i = document.querySelector('.ProseMirror td img'); i.scrollIntoView({ block: 'center' }); const r = i.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
    await sleep(300);
    win.webContents.sendInputEvent({ type: 'mouseDown', x: logo.x, y: logo.y, button: 'left', clickCount: 1 });
    win.webContents.sendInputEvent({ type: 'mouseUp', x: logo.x, y: logo.y, button: 'left', clickCount: 1 });
    await sleep(400);
    const handle = await js(win, `(() => { const e = document.querySelector('.ProseMirror').editor; const h = document.querySelector('.template-image.is-selected .template-image__handle--se'); const sel = e.state.selection; if (!h) return { selected: sel.node?.type.name ?? sel.constructor.name }; const r = h.getBoundingClientRect(); return { selected: sel.node?.type.name, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), bar: !!document.querySelector('[aria-label="Görsel genişliği (px)"]') }; })()`);
    console.log('logo seçimi:', handle);
    console.log('editör kökü:', await js(win, `(() => { const el = document.querySelector('[data-blocks-app-tab-shortcuts]'); const r = el.getBoundingClientRect(); return { parentIsBody: el.parentElement === document.body, top: r.top, left: r.left, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight }; })()`));
    if (handle.x) {
      win.webContents.sendInputEvent({ type: 'mouseDown', x: handle.x, y: handle.y, button: 'left', clickCount: 1 });
      for (let dx = 5; dx <= 40; dx += 5) {
        win.webContents.sendInputEvent({ type: 'mouseMove', x: handle.x + dx, y: handle.y, button: 'left', modifiers: ['leftButtonDown'] });
        await sleep(30);
      }
      win.webContents.sendInputEvent({ type: 'mouseUp', x: handle.x + 40, y: handle.y, button: 'left', clickCount: 1 });
      await sleep(400);
      console.log('tutamaçla boyutlandırma sonrası:', await js(win, `(() => { const e = document.querySelector('.ProseMirror').editor; const s = e.state.selection; const i = document.querySelector('.ProseMirror td img'); return { selected: s.node?.type.name ?? null, widthAttr: s.node?.attrs.width ?? null, domWidth: Math.round(i.getBoundingClientRect().width) }; })()`));
      await js(win, `(() => { const e = document.querySelector('.ProseMirror').editor; let p = -1; e.state.doc.descendants((n, pos) => { if (p < 0 && n.type.name === 'imageResize') p = pos; }); e.commands.setNodeSelection(p); e.commands.focus(); })()`);
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Right', modifiers: ['alt'] });
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Right', modifiers: ['alt'] });
      await sleep(400);
      console.log('Alt+→ sonrası:', await js(win, `(() => { const e = document.querySelector('.ProseMirror').editor; const s = e.state.selection; const cells = [...document.querySelectorAll('.ProseMirror table')[0].querySelectorAll('td')]; return { selected: s.node?.type.name ?? null, imgsPerCell: cells.map((c) => c.querySelectorAll('img').length) }; })()`));
    }

    if (process.env.PERF_KEEP_OPEN) await sleep(600000);
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
