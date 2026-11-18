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
#   --dsf "1,1.25,1.5"                   (ekran ölçekleri; native = Windows ayarı)
#   --templates "stress,features,fields,fonts"
```

Şablonlar (`make-features-template.cjs` üretir; `stress-template.json` elle yazılmıştır):
- `stress`: tablolar, malzeme/iade tabloları, listeler, sayfa sınırına denk gelen satırlar.
- `features`: araç çubuğunun her işlemi (punto, satır aralığı, hizalama, görsel, sütun düzeni…).
- `fields`: alan + bitişik Türkçe ek / noktalama (`{{musteriAdi}}'nin`, `({{teklifNo}})`); her
  cümle 1'er karakter dolguyla tekrarlanır ki alan ve ek mutlaka satır/sayfa sonuna denk gelsin.
- `fonts`: yazı tipi seçicideki her font × normal/kalın/italik, Tab girintisi.

Çıkış kodu 0 = kabul ölçütü sağlandı.

## Nasıl çalışır
0. Ön koşul: frontend `documentTheme.css` = backend `DOCUMENT_CSS` (değilse hemen hata).
1. `editor.html` + `editor-harness.tsx`: Vite ile uygulamanın kendi CSS'i (Tailwind dahil),
   fontları ve editör eklentileriyle şablon açılır. Pencere gizli olduğundan
   `requestAnimationFrame` zamanlayıcıyla beslenir (gizli pencerede Chromium kare üretmez).
   Ölçümden önce sayfalama zorla yeniden çalıştırılır; aralıklar değişirse ölçüm geçersizdir.
2. `electron-main.cjs`: projedeki Electron (uygulamayla aynı Chromium) sayfalamanın oturmasını
   bekler; her glifin sayfa / x / taban çizgisi konumunu ve "Önizle"nin gönderdiği JSON'u yazar.
3. `render-pdf.mjs`: aynı JSON backend'in önizleme koduyla (`generateTemplatePreview`) basılır.
4. `compare.mjs`: PDF metni `pdfjs-dist` ile okunur, satırlar metinleriyle eşlenir.

## Kabul ölçütü
- **Ekran ölçeği 1** (PDF ile aynı): sayfa sayısı, her satırın sayfası ve satır kırılımları
  birebir; konum sapması ≤ 1,25px (Chrome PDF'te metin taban çizgisini tam piksele yuvarlar).
- **Diğer ölçekler** (ör. Windows %125, %150): sayfa sayısı, her satırın sayfası ve satır
  kırılımları yine **birebir**. Chromium yazı tipi ascent/descent değerlerini fiziksel piksele
  yuvarladığından karışık puntolu / satır aralığı < 1 satırlarda birkaç px dikey konum farkı
  bilgi olarak raporlanır; sayfa kararları `zoom: 1/devicePixelRatio` ölçümüyle PDF'le aynı verilir.
- Her ölçekte: sayfalar arasındaki gri bölgeye (görünmez) düşen editör satırı hatadır.
- Chrome'un sayfa başına itilen satırın taşan mürekkebini önceki sayfanın alt boşluğuna da
  basması ("hayalet" glif: aynı harf, aynı x, bir sayfa içerik yüksekliği yukarıda) ayıklanır.

## Eşitliği sağlayan kurallar (bozmayın)
- Font: iki tarafta da `@fontsource/arimo` aynı sürüm (package.json'da tam sürüm).
  Backend `documentFonts.js` aynı woff2'leri PDF'e gömer.
- Kanonik CSS: backend `documentStyles.js` = frontend `src/styles/documentTheme.css`.
  `.doc-root` kalıtımla gelen metin özelliklerini sabitler (uygulama CSS'i sızmaz).
- Sayfa geometrisi: PDF'te sayfa ve üst/alt kenar `@page` ile, yatay kenar `.pdf-page-frame`
  genişliğiyle verilir. Puppeteer `format`/`margin` kullanmayın: Chrome bunları yuvarlıyor.
- Sayfalama: PDF sayfa içerik yüksekliğini tam piksele yukarı yuvarlar (`pdfFragmentainerHeight`).
- Kenarlıklar yerleşime girmez: `.doc-root` içinde tablo/hücre `border-width` sıfırdır (satır içi
  stiller dahil); çizgiyi öğenin kenarlık stil/rengini devralan `::before` çizer. Chromium
  kenarlık kalınlığını cihaz pikseline yuvarlar (%125'te 1px → 0,8px) ve hücre genişliğini
  değiştirirdi. `hr` ve `blockquote` çizgileri de yerleşime girmez (height+background, gölge).
- Alan önizlemesi: kaynak `{{alan}}` metni `display: none` (font-size: 0 değil). Sıfır puntolu
  metin satır kırma hesabına katılır ve `{{musteriAdi}}'nin` gibi bitişik eklerde PDF'te olmayan
  bir kırılma noktası yaratır. Sayfa sınırı değerin ortasına düşerse aralık değerin içine konur
  (`previewOffset`).
