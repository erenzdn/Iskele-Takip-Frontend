import { describe, expect, it } from 'vitest';
import { normalizeDocumentCss } from './useDocumentTheme';

describe('normalizeDocumentCss', () => {
  it('yorum ve boşluk farkını yok sayar (frontend dosyasının başında açıklama var)', () => {
    const backend = '\n.doc-root td {\n  padding: 8px;\n}\n';
    const frontend = '/* Kanonik belge stil sayfası */\n.doc-root td{padding:8px}';
    expect(normalizeDocumentCss(backend)).toBe(normalizeDocumentCss(frontend));
  });

  it('kural farkını yakalar', () => {
    expect(normalizeDocumentCss('.doc-root td { padding: 8px; }')).not.toBe(
      normalizeDocumentCss('.doc-root td { padding: 9px; }')
    );
  });
});
