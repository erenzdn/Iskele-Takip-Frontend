/**
 * Şablon editörü "Düzen" menüsündeki hazır sayfa üstü (logo + başlık) ve sütun düzenleri.
 * Tablolar ProseMirror JSON olarak üretilir; genişlikler hücre stilinde yüzde olarak tutulur
 * (bkz. LayoutTable.ts), böylece editör ve PDF aynı dizilir.
 */
import { BORDERLESS_STYLE } from './CustomTableExtensions';
import { formatPercent, roundPercents, setStyleProp } from './LayoutTable';

type JSONNode = Record<string, unknown>;

/** Önizleme küçük resmi için hücre türü */
export type PresetCellKind = 'logo' | 'title' | 'info' | 'text' | 'company' | 'empty';

export type LayoutPresetContext = {
  documentNumberKey: string;
  documentNumberLabel: string;
};

export type LayoutPreset = {
  id: string;
  label: string;
  description: string;
  widths: number[];
  cells: PresetCellKind[];
  /** Logo eklenecek hücrenin sırası (yoksa logo eklenmez) */
  logoCell?: number;
  build: (ctx: LayoutPresetContext) => JSONNode;
};

type Align = 'left' | 'center' | 'right';

function text(value: string, bold = false): JSONNode {
  return bold ? { type: 'text', text: value, marks: [{ type: 'bold' }] } : { type: 'text', text: value };
}

function paragraph(align: Align | null, parts: JSONNode[] = []): JSONNode {
  return {
    type: 'paragraph',
    attrs: { textAlign: align },
    ...(parts.length ? { content: parts } : {}),
  };
}

function heading(level: number, align: Align, value: string): JSONNode {
  return { type: 'heading', attrs: { level, textAlign: align }, content: [text(value)] };
}

function lines(align: Align, values: string[]): JSONNode {
  const parts: JSONNode[] = [];
  values.forEach((value, i) => {
    if (i > 0) parts.push({ type: 'hardBreak' });
    parts.push(text(value));
  });
  return paragraph(align, parts);
}

function documentInfo(ctx: LayoutPresetContext, align: Align): JSONNode {
  return lines(align, [
    `${ctx.documentNumberLabel}: {{${ctx.documentNumberKey}}}`,
    'Tarih: {{bugunTarihi}}',
  ]);
}

type CellSpec = {
  content: JSONNode[];
  valign?: 'top' | 'middle' | 'bottom';
  /** Hücre yatay hizası — hücredeki görseli (logo) de hizalar */
  align?: Align;
};

function cell(spec: CellSpec, width: number, borderless: boolean, header = false): JSONNode {
  let style: string | null = borderless ? BORDERLESS_STYLE : null;
  style = setStyleProp(style, 'width', formatPercent(width));
  style = setStyleProp(style, 'vertical-align', spec.valign ?? 'top');
  if (spec.align) style = setStyleProp(style, 'text-align', spec.align);
  return {
    type: header ? 'tableHeader' : 'tableCell',
    attrs: { colspan: 1, rowspan: 1, colwidth: null, style },
    content: spec.content.length ? spec.content : [paragraph(null)],
  };
}

export function buildLayoutTable(widths: number[], specs: CellSpec[]): JSONNode {
  const percents = roundPercents(widths);
  return {
    type: 'table',
    attrs: { noBorder: true },
    content: [
      {
        type: 'tableRow',
        content: percents.map((w, i) => cell(specs[i] ?? { content: [] }, w, true)),
      },
    ],
  };
}

/** Çizgili veri tablosu (ilk satır başlık), sütunlar eşit yüzde */
export function buildDataTable(rows: number, cols: number): JSONNode {
  const percents = roundPercents(Array.from({ length: cols }, () => 1));
  return {
    type: 'table',
    attrs: { noBorder: false },
    content: Array.from({ length: rows }, (_, r) => ({
      type: 'tableRow',
      content: percents.map((w) => cell({ content: [] }, w, false, r === 0)),
    })),
  };
}

export const HEADER_PRESETS: LayoutPreset[] = [
  {
    id: 'logo-title',
    label: 'Logo + başlık',
    description: 'Solda logo, sağda ortalı başlık ve belge bilgisi',
    widths: [30, 70],
    cells: ['logo', 'title'],
    logoCell: 0,
    build: (ctx) =>
      buildLayoutTable(
        [30, 70],
        [
          { content: [], valign: 'middle', align: 'left' },
          {
            content: [heading(2, 'center', 'FİRMA UNVANI / BAŞLIK'), documentInfo(ctx, 'center')],
            valign: 'middle',
          },
        ]
      ),
  },
  {
    id: 'title-logo',
    label: 'Başlık + logo',
    description: 'Solda başlık ve belge bilgisi, sağda logo',
    widths: [70, 30],
    cells: ['title', 'logo'],
    logoCell: 1,
    build: (ctx) =>
      buildLayoutTable(
        [70, 30],
        [
          {
            content: [heading(2, 'left', 'FİRMA UNVANI / BAŞLIK'), documentInfo(ctx, 'left')],
            valign: 'middle',
          },
          { content: [], valign: 'middle', align: 'right' },
        ]
      ),
  },
  {
    id: 'logo-title-info',
    label: 'Logo · başlık · bilgi',
    description: 'Logo, ortada başlık, sağda belge no ve tarih',
    widths: [25, 45, 30],
    cells: ['logo', 'title', 'info'],
    logoCell: 0,
    build: (ctx) =>
      buildLayoutTable(
        [25, 45, 30],
        [
          { content: [], valign: 'middle', align: 'left' },
          { content: [heading(2, 'center', 'BELGE BAŞLIĞI')], valign: 'middle' },
          { content: [documentInfo(ctx, 'right')], valign: 'middle', align: 'right' },
        ]
      ),
  },
  {
    id: 'logo-company-info',
    label: 'Logo + firma | bilgi',
    description: 'Logonun altında firma bilgileri, sağda belge başlığı',
    widths: [60, 40],
    cells: ['company', 'info'],
    logoCell: 0,
    build: (ctx) =>
      buildLayoutTable(
        [60, 40],
        [
          {
            content: [
              paragraph('left'),
              paragraph('left', [text('FİRMA UNVANI', true)]),
              lines('left', ['Adres', 'Telefon · E-posta']),
            ],
            valign: 'top',
            align: 'left',
          },
          {
            content: [heading(2, 'right', 'BELGE BAŞLIĞI'), documentInfo(ctx, 'right')],
            valign: 'top',
            align: 'right',
          },
        ]
      ),
  },
];

function columnsPreset(id: string, label: string, widths: number[]): LayoutPreset {
  return {
    id,
    label,
    description: `${widths.length} sütunlu düzen`,
    widths,
    cells: widths.map(() => 'text' as const),
    build: () => buildLayoutTable(widths, widths.map(() => ({ content: [], valign: 'top' }))),
  };
}

export const COLUMN_PRESETS: LayoutPreset[] = [
  columnsPreset('cols-2', '2 eşit', [50, 50]),
  columnsPreset('cols-3', '3 eşit', [1, 1, 1]),
  columnsPreset('cols-4', '4 eşit', [1, 1, 1, 1]),
  columnsPreset('cols-1-2', '1/3 + 2/3', [1, 2]),
  columnsPreset('cols-2-1', '2/3 + 1/3', [2, 1]),
];

/** Bulunulan sütun sayısına göre hazır genişlik oranları */
export function widthPresetsFor(count: number): number[][] {
  switch (count) {
    case 2:
      return [
        [50, 50],
        [30, 70],
        [70, 30],
        [40, 60],
        [60, 40],
        [25, 75],
        [75, 25],
      ];
    case 3:
      return [
        [1, 1, 1],
        [25, 50, 25],
        [20, 60, 20],
        [30, 40, 30],
        [50, 25, 25],
        [25, 25, 50],
      ].map(roundPercents);
    case 4:
      return [
        [25, 25, 25, 25],
        [20, 30, 30, 20],
        [40, 20, 20, 20],
        [20, 20, 20, 40],
      ];
    default:
      return [roundPercents(Array.from({ length: Math.max(1, count) }, () => 1))];
  }
}
