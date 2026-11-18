/**
 * Editör ölçümü (editor-*.json) ile PDF'i (pdf-*.pdf) satır satır karşılaştırır.
 * Satır = aynı sayfada aynı taban çizgisine (±1px) oturan glifler. Satırlar metinleriyle
 * (boşluksuz) LCS ile eşlenir; eşlenemeyen satır = farklı satır kırılımı.
 * Kullanım: node compare.mjs <outDir>  →  çıkış kodu 0 = birebir, 1 = fark var
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

const PT_TO_PX = 96 / 72;
const MM_TO_PX = 96 / 25.4;
/** A4 sayfa yüksekliği (px) */
const PAGE_HEIGHT_PX = 297 * MM_TO_PX;
const outDir = process.argv[2];

/**
 * Chrome, sayfa başına itilen satırın kutusunu aşan mürekkebini (ör. satır aralığı 1'de "İ"
 * noktası) önceki sayfanın alt kenar boşluğuna da basar: aynı glif, aynı x'te, tam bir sayfa
 * içerik yüksekliği yukarıda. Editörle ilgisi olmayan bu kopyalar ayıklanır.
 */
function dropOverflowGhosts(glyphs, marginsMm) {
  const [top, , bottom] = marginsMm;
  const contentBottom = PAGE_HEIGHT_PX - bottom * MM_TO_PX;
  const fragmentainer = Math.ceil(PAGE_HEIGHT_PX - (top + bottom) * MM_TO_PX - 0.001);
  return glyphs.filter(
    (g) =>
      !(
        g.baseline > contentBottom &&
        glyphs.some(
          (h) =>
            h.page === g.page + 1 &&
            h.ch === g.ch &&
            Math.abs(h.x - g.x) < 0.5 &&
            Math.abs(g.baseline - h.baseline - fragmentainer) < 2
        )
      )
  );
}

function groupLines(glyphs) {
  const sorted = [...glyphs].sort((a, b) => a.page - b.page || a.baseline - b.baseline || a.x - b.x);
  const lines = [];
  for (const g of sorted) {
    const line = lines.find((l) => l.page === g.page && Math.abs(l.baseline - g.baseline) <= 1);
    if (line) line.glyphs.push(g);
    else lines.push({ page: g.page, baseline: g.baseline, glyphs: [g] });
  }
  return lines
    .map((l) => {
      l.glyphs.sort((a, b) => a.x - b.x);
      return {
        page: l.page,
        baseline: l.baseline,
        x: l.glyphs[0].x,
        text: l.glyphs.map((g) => g.ch).join(''),
      };
    })
    .sort((a, b) => a.page - b.page || a.baseline - b.baseline || a.x - b.x);
}

async function pdfGlyphs(file) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)), disableFontFace: true }).promise;
  const glyphs = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const [, , , pageHeightPt] = page.view;
    const content = await page.getTextContent();
    for (const item of content.items) {
      const text = (item.str || '').replace(/\s+/g, '');
      // Liste işaretleri editörde ::marker (DOM metni değil) → PDF'te de sayma
      if (!text || /^(\d+\.|[•◦▪●])$/.test(text)) continue;
      const [, , , , e, f] = item.transform;
      // Her öğe tek "glif" gibi davranır (x = öğenin başı); metin karşılaştırması boşluksuz
      glyphs.push({ page: p - 1, x: e * PT_TO_PX, baseline: (pageHeightPt - f) * PT_TO_PX, ch: text });
    }
  }
  return { glyphs, pageCount: doc.numPages };
}

function lcsMatch(a, b) {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i].text === b[j].text ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const pairs = [];
  const onlyA = [];
  const onlyB = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i].text === b[j].text) pairs.push([a[i++], b[j++]]);
    else if (dp[i + 1][j] >= dp[i][j + 1]) onlyA.push(a[i++]);
    else onlyB.push(b[j++]);
  }
  while (i < n) onlyA.push(a[i++]);
  while (j < m) onlyB.push(b[j++]);
  return { pairs, onlyA, onlyB };
}

let failed = false;
const files = readdirSync(outDir).filter((f) => /^editor-.*\.json$/.test(f)).sort();
for (const file of files) {
  const name = file.replace(/^editor-|\.json$/g, '');
  const [marginName, dsfName = '1'] = name.split('@');
  const editor = JSON.parse(readFileSync(join(outDir, file), 'utf8'));
  const pdf = await pdfGlyphs(join(outDir, `pdf-${marginName}.pdf`));
  const marginsMm = marginName.split('_')[1].split('-').map(Number);
  pdf.glyphs = dropOverflowGhosts(pdf.glyphs, marginsMm);
  // Ekran ölçeği ≠ 1 iken Chromium yazı tipi ascent/descent değerlerini fiziksel piksele
  // yuvarlar: karışık puntolu / satır aralığı < 1 satırların yüksekliği kesirli px oynar. Dikey
  // konum PDF'ten birkaç px sapabilir; sayfa ve satır kırılımı yine BİREBİR olmalı.
  const strictVertical = Math.abs(Number(dsfName) - 1) < 0.001;
  const editorLines = groupLines(editor.glyphs);
  const pdfLines = groupLines(pdf.glyphs);
  const { pairs, onlyA, onlyB } = lcsMatch(editorLines, pdfLines);

  const pageDiff = pairs.filter(([e, p]) => e.page !== p.page);
  const samePage = pairs.filter(([e, p]) => e.page === p.page);
  const dys = samePage.map(([e, p]) => Math.abs(e.baseline - p.baseline));
  const dxs = samePage.map(([e, p]) => Math.abs(e.x - p.x));
  const maxDy = Math.max(0, ...dys);
  const maxDx = Math.max(0, ...dxs);
  // Kabul ölçütü:
  // - Ekran ölçeği 1 (PDF ile aynı): sayfa, satır kırılımı birebir; konum sapması ≤ 1,25px
  //   (Chrome PDF'te metin taban çizgisini tam piksele yuvarlar: ±0,5px, ölçüm yuvarlaması ±0,5px).
  // - Diğer ölçekler: her satır aynı sayfada ve sayfa sayısı aynı olmalı. Çizgiler fiziksel
  //   piksele yuvarlandığından dar tablo hücresinde kırılım ve birkaç px dikey konum farkı bilgi amaçlı.
  // Sayfalar arası gri bölgeye (maskeli) düşen satır editörde GÖRÜNMEZ — sayfa numarası tutsa da hata
  const hiddenInGap = editorLines.filter((l) => l.baseline > PAGE_HEIGHT_PX);
  const pagesOk = pageDiff.length === 0 && editor.pageCount === pdf.pageCount && hiddenInGap.length === 0;
  const breaksOk = onlyA.length === 0 && onlyB.length === 0;
  const ok = strictVertical
    ? pagesOk && breaksOk && maxDy <= 1.25 && maxDx <= 1.25
    : pagesOk && breaksOk && maxDx <= 1.25;
  failed ||= !ok;

  const verdict = ok ? (strictVertical ? 'BİREBİR' : 'SATIR VE SAYFALAR BİREBİR') : 'FARK VAR';
  const [templateName, marginMm] = marginName.split('_');
  console.log(`\n=== ${templateName} şablonu, kenar ${marginMm} mm, ekran ölçeği ${dsfName}: ${verdict} ===`);
  console.log(`sayfa: editör ${editor.pageCount}, PDF ${pdf.pageCount}`);
  console.log(`satır: editör ${editorLines.length}, PDF ${pdfLines.length}, eşleşen ${pairs.length}`);
  console.log(`farklı kırılım: editörde ${onlyA.length}, PDF'te ${onlyB.length} eşsiz satır`);
  console.log(`farklı sayfadaki satır: ${pageDiff.length}; sayfa arasında görünmeyen satır: ${hiddenInGap.length}`);
  console.log(`aynı sayfada en büyük sapma: dikey ${maxDy.toFixed(2)}px${strictVertical ? '' : ' (bilgi)'}, yatay ${maxDx.toFixed(2)}px`);
  const show = (label, list) => {
    for (const l of list.slice(0, 6)) {
      console.log(`  ${label} s${l.page + 1} y=${l.baseline.toFixed(1)} x=${l.x.toFixed(1)} "${l.text.slice(0, 60)}"`);
    }
  };
  show('aralıkta   ', hiddenInGap);
  show('editör-yalnız', onlyA);
  show('pdf-yalnız   ', onlyB);
  const worst = samePage
    .map(([e, p]) => ({ e, p, d: Math.max(Math.abs(e.baseline - p.baseline), Math.abs(e.x - p.x)) }))
    .filter((w) => w.d > 1)
    .sort((a, b) => b.d - a.d)
    .slice(0, 6);
  for (const { e, p } of worst) {
    console.log(`  sapma s${e.page + 1} dy=${(p.baseline - e.baseline).toFixed(2)} dx=${(p.x - e.x).toFixed(2)} "${e.text.slice(0, 50)}"`);
  }
  for (const [e, p] of pageDiff.slice(0, 4)) {
    console.log(`  sayfa farkı: editör s${e.page + 1} ↔ PDF s${p.page + 1} "${e.text.slice(0, 50)}"`);
  }
}
process.exit(failed ? 1 : 0);
