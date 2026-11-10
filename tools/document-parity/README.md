# Şablon editörü ↔ PDF eşitlik ölçümü

Şablon editöründe görülen yerleşimin "Önizle"/"İndir" PDF'iyle birebir aynı olup olmadığını
**satır satır** ölçer. Belge stili, fontu, sayfa geometrisi veya sayfalama koduna dokunduktan
sonra çalıştırın.

```bash
node tools/document-parity/run.mjs
# seçenekler:
#   --backend <IskeleTakipAPI klasörü>   (varsayılan: ../../source/repos/IskeleTakipAPI)
#   --out <klasör>                       (varsayılan: %TEMP%/document-parity)
#   --margins "15,15,15,15;0,0,0,0;25,20,25,20"   (üst,sağ,alt,sol mm)
#   --dsf "1,native"                     (ekran ölçekleri; native = Windows ayarı)
```

Çıkış kodu 0 = kabul ölçütü sağlandı.

## Nasıl çalışır
1. `editor.html` + `editor-harness.tsx`: Vite ile uygulamanın kendi CSS'i (Tailwind dahil),
   fontu ve editör eklentileriyle `stress-template.json` açılır.
2. `electron-main.cjs`: projedeki Electron (uygulamayla aynı Chromium) sayfalamanın oturmasını
   bekler; her glifin sayfa / x / taban çizgisi konumunu ve "Önizle"nin gönderdiği JSON'u yazar.
3. `render-pdf.mjs`: aynı JSON backend'in önizleme koduyla (`generateTemplatePreview`) basılır.
4. `compare.mjs`: PDF metni `pdfjs-dist` ile okunur, satırlar metinleriyle eşlenir.

## Kabul ölçütü
- **Ekran ölçeği 1** (PDF ile aynı): sayfa sayısı, her satırın sayfası ve satır kırılımları
  birebir; konum sapması ≤ 1,25px (Chrome PDF'te metin taban çizgisini tam piksele yuvarlar).
- **Diğer ölçekler** (ör. Windows %125): her satır aynı sayfada olmalı. Chromium çizgileri fiziksel
  piksele yuvarlar (1px → 0,8px), bu yüzden dar tablo hücresinde kırılım ve birkaç px dikey konum
  farkı bilgi olarak raporlanır. Sayfalama bunu `zoom: 1/devicePixelRatio` ölçümüyle telafi eder.

## Eşitliği sağlayan kurallar (bozmayın)
- Font: iki tarafta da `@fontsource/arimo` aynı sürüm (package.json'da tam sürüm).
  Backend `documentFonts.js` aynı woff2'leri PDF'e gömer.
- Kanonik CSS: backend `documentStyles.js` = frontend `src/styles/documentTheme.css`.
  `.doc-root` kalıtımla gelen metin özelliklerini sabitler (uygulama CSS'i sızmaz).
- Sayfa geometrisi: PDF'te sayfa ve üst/alt kenar `@page` ile, yatay kenar `.pdf-page-frame`
  genişliğiyle verilir. Puppeteer `format`/`margin` kullanmayın: Chrome bunları yuvarlıyor.
- Sayfalama: PDF sayfa içerik yüksekliğini tam piksele yukarı yuvarlar (`pdfFragmentainerHeight`).
