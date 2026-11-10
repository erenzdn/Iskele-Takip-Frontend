/**
 * Şablon editöründe seçilebilen belge fontları.
 *
 * Editör (Electron/Windows) ile PDF (Puppeteer/Linux) aynı yerleşimi üretsin diye sistem
 * fontu kullanılmaz; her font @fontsource paketiyle iki tarafa da gömülür (bkz.
 * src/styles/documentFonts.ts ve backend documentFonts.js). Arial/Times New Roman/Calibri/
 * Courier New yerine onlarla ölçüleri birebir aynı açık kaynak eşdeğerleri kullanılır.
 *
 * `value` belgeye `font-family` olarak yazılır; tırnak içermez (PDF HTML'inde stil
 * özniteliğinde sorun çıkmasın diye) — boşluklu aile adları tırnaksız da geçerli CSS'tir.
 */
export type DocumentFont = {
  /** Kullanıcıya gösterilen ad */
  label: string;
  /** Gömülen font ailesinin gerçek adı */
  family: string;
  /** font-family değeri */
  value: string;
  /** Açıklama (araç ipucu) */
  hint: string;
};

function font(label: string, family: string, fallback: string, hint: string): DocumentFont {
  return { label, family, value: `${family}, ${fallback}`, hint };
}

/** Varsayılan belge fontu (documentTheme.css) — seçim kaldırılınca bu kullanılır */
export const DEFAULT_DOCUMENT_FONT_LABEL = 'Arial (varsayılan)';

export const DOCUMENT_FONTS: DocumentFont[] = [
  font('Times New Roman', 'Tinos', 'serif', 'Tinos — Times New Roman ile ölçüleri birebir aynı; resmi yazışma, sözleşme'),
  font('Calibri', 'Carlito', 'sans-serif', 'Carlito — Calibri ile ölçüleri birebir aynı; Office varsayılanı görünümü'),
  font('Courier New', 'Cousine', 'monospace', 'Cousine — Courier New ile ölçüleri birebir aynı; sabit genişlik'),
  font('Roboto', 'Roboto', 'sans-serif', 'Modern, okunaklı; teklif ve raporlar'),
  font('Open Sans', 'Open Sans', 'sans-serif', 'Sade ve çok okunaklı'),
  font('Lato', 'Lato', 'sans-serif', 'Kurumsal, yumuşak hatlı'),
  font('Montserrat', 'Montserrat', 'sans-serif', 'Geniş, güçlü — başlıklar için'),
  font('Merriweather', 'Merriweather', 'serif', 'Tırnaklı, ekranda ve baskıda okunaklı'),
  font('Noto Serif', 'Noto Serif', 'serif', 'Klasik tırnaklı metin fontu'),
];

/** Kayıtlı font-family değerinden listedeki fontu bulur */
export function findDocumentFont(value: string | null | undefined): DocumentFont | null {
  if (!value) return null;
  const first = value.split(',')[0].replace(/["']/g, '').trim().toLowerCase();
  return DOCUMENT_FONTS.find((f) => f.family.toLowerCase() === first) ?? null;
}
