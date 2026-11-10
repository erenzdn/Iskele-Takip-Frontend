/**
 * Uygulamanın kendi Electron'u (aynı Chromium sürümü) ile editör ölçüm sayfasını açar.
 * Parametreler ortam değişkeniyle verilir (Electron, http:// ile başlayan argümanı açmaya çalışıp
 * çıkıyor): PARITY_URL, PARITY_OUT, PARITY_MARGINS ("üst,sağ,alt,sol;..." mm).
 * Doğrudan değil run.mjs üzerinden çalıştırın.
 */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const baseUrl = process.env.PARITY_URL;
const outDir = process.env.PARITY_OUT;
const marginList = process.env.PARITY_MARGINS || '15,15,15,15';
// Ekran ölçeği: "1" = PDF ile aynı (katı karşılaştırma); boş = Windows'un kendi ölçeği (ör. 1.25)
const forcedScale = process.env.PARITY_DSF;
if (forcedScale) app.commandLine.appendSwitch('force-device-scale-factor', forcedScale);

async function measure(margins) {
  const win = new BrowserWindow({
    show: false,
    width: 1100,
    height: 1400,
    webPreferences: { backgroundThrottling: false },
  });
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) console.warn('[editor]', message);
  });
  // Vite ilk açılışta bağımlılıkları optimize edip sayfayı yeniden yükleyebilir → yeniden dene
  for (let attempt = 1; ; attempt++) {
    try {
      await win.loadURL(`${baseUrl}?m=${margins}`);
      break;
    } catch (error) {
      if (attempt >= 3) throw error;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  for (let i = 0; i < 300; i++) {
    const state = await win.webContents.executeJavaScript(
      'window.__parityError ? {error: window.__parityError} : (window.__parity ? {ok: window.__parity} : null)'
    );
    if (state?.error) throw new Error(state.error);
    if (state?.ok) {
      win.destroy();
      return state.ok;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  win.destroy();
  throw new Error(`Editör ölçümü zaman aşımı (${margins})`);
}

// Ölçümler arası pencere kapanınca uygulama kapanmasın
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  try {
    fs.mkdirSync(outDir, { recursive: true });
    for (const margins of marginList.split(';')) {
      const result = await measure(margins);
      const dsf = forcedScale || String(require('electron').screen.getPrimaryDisplay().scaleFactor);
      const file = path.join(outDir, `editor-${margins.replace(/,/g, '-')}@${dsf}.json`);
      fs.writeFileSync(file, JSON.stringify({ ...result, dsf: Number(dsf) }));
      console.log(`editör: ${margins} mm, ekran ölçeği ${dsf} → ${result.glyphs.length} glif, ${result.pageCount} sayfa`);
    }
    console.log(`Chromium ${process.versions.chrome}`);
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
