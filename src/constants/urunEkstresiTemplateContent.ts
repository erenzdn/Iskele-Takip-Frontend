/**
 * BERKA tarzı "Kullanım Extresi" TipTap şablon içeriği.
 * Örnek: BERKA 25-020-7.pdf
 *
 * AKTİFLER → {{malzemeTablosu}}, İADELER → {{iadeTablosu}} (backend widgetRegistry).
 * Not: Dönem tutarları ve fatura özeti henüz desteklenmiyor (Phase 2).
 */

export const KULLANIM_EXTRESI_TEMPLATE_NAME = 'Kullanım Extresi';

function text(value: string, marks?: Array<{ type: string }>) {
  return marks?.length
    ? { type: 'text' as const, text: value, marks }
    : { type: 'text' as const, text: value };
}

function paragraph(parts: Array<ReturnType<typeof text> | string>) {
  const content = parts
    .map((p) => (typeof p === 'string' ? text(p) : p))
    .filter((p) => p.text.length > 0);
  return {
    type: 'paragraph' as const,
    attrs: { textAlign: 'left' },
    ...(content.length > 0 ? { content } : {}),
  };
}

function heading(level: 1 | 2 | 3, value: string) {
  return {
    type: 'heading' as const,
    attrs: { level, textAlign: 'center' },
    content: [text(value, [{ type: 'bold' }])],
  };
}

/** TipTap JSON (pageMargins dahil) — contract-templates create/update Content */
export function buildKullanimExtresiTemplateContent() {
  return {
    type: 'doc',
    pageMargins: { top: 10, bottom: 10, left: 10, right: 10 },
    content: [
      heading(
        2,
        'BERKA KALIP VE İSKELE SİS.İNŞ.SAN.TİC.LTD.ŞTİ. / 165 028 1298 / KULLANIM EXTRESİ'
      ),
      paragraph([]),
      paragraph([
        text('Dönemi : ', [{ type: 'bold' }]),
        '{{baslangicTarihi}}',
        ' / ',
        '{{bitisTarihi}}',
      ]),
      paragraph([text('Sözleşme No : ', [{ type: 'bold' }]), '{{sozlesmeNo}}']),
      paragraph([text('İskonto Oranı : ', [{ type: 'bold' }]), '{{iskonto}}']),
      paragraph([text('Sevk Adresi : ', [{ type: 'bold' }]), '{{santiyeAdres}}']),
      paragraph([text('Sevk Yeri : ', [{ type: 'bold' }]), '{{santiyeAdi}}']),
      paragraph([
        text('Yetkili : ', [{ type: 'bold' }]),
        '{{musteriMerkezYetkili}}',
        '    ',
        text('Tel : ', [{ type: 'bold' }]),
        '{{musteriMerkezYetkiliTelefon}}',
      ]),
      paragraph([]),
      paragraph([text('AKTİFLER', [{ type: 'bold' }])]),
      paragraph(['{{malzemeTablosu}}']),
      paragraph([]),
      paragraph([text('İADELER', [{ type: 'bold' }])]),
      paragraph(['{{iadeTablosu}}']),
      paragraph([]),
      paragraph([
        text('Malzeme kullanım süresi minimum 30 gündür.', [{ type: 'italic' }]),
      ]),
      paragraph([text('Belge tarihi : ', [{ type: 'bold' }]), '{{bugunTarihi}}']),
    ],
  };
}

export function isKullanimExtresiTemplateName(name: string | null | undefined): boolean {
  const n = String(name || '')
    .trim()
    .toLocaleLowerCase('tr-TR');
  if (!n) return false;
  return (
    n === 'kullanım extresi' ||
    n === 'kullanim extresi' ||
    n.includes('kullanım extresi') ||
    n.includes('kullanim extresi') ||
    n.includes('ürün ekstresi') ||
    n.includes('urun ekstresi')
  );
}
