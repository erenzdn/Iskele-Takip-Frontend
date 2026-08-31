import type { Editor } from '@tiptap/core';
import { Table } from '@tiptap/extension-table';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';

export const BORDERLESS_STYLE =
  'border: none !important; border-width: 0 !important; border-style: none !important; border-spacing: 0 !important; border-collapse: separate !important; box-shadow: none !important; outline: none !important;';

function appendBorderlessStyle(existing: string | null | undefined): string {
  const base = (existing || '').trim();
  const withoutCollapsedBorders = base.replace(
    /border-collapse\s*:\s*collapse\s*!important\s*;?/gi,
    ''
  );
  const cleaned = withoutCollapsedBorders.replace(/;\s*;/g, ';').trim().replace(/^;|;$/g, '').trim();
  return cleaned ? `${cleaned}; ${BORDERLESS_STYLE}` : BORDERLESS_STYLE;
}

function removeBorderlessStyle(existing: string | null | undefined): string | null {
  if (!existing) return null;
  const cleaned = existing
    .replace(/border\s*:\s*none\s*!important\s*;?/gi, '')
    .replace(/border-width\s*:\s*0(?:px)?\s*!important\s*;?/gi, '')
    .replace(/border-style\s*:\s*none\s*!important\s*;?/gi, '')
    .replace(/border-spacing\s*:\s*0\s*!important\s*;?/gi, '')
    .replace(/border-collapse\s*:\s*separate\s*!important\s*;?/gi, '')
    .replace(/box-shadow\s*:\s*none\s*!important\s*;?/gi, '')
    .replace(/outline\s*:\s*none\s*!important\s*;?/gi, '')
    .replace(/border-collapse\s*:\s*collapse\s*!important\s*;?/gi, '')
    .replace(/;\s*;/g, ';')
    .trim()
    .replace(/^;|;$/g, '')
    .trim();
  return cleaned || null;
}

function isBorderlessTable(attrs: Record<string, unknown> | null | undefined): boolean {
  if (!attrs) return false;
  if (attrs.noBorder === true || attrs.noBorder === 'true') return true;
  if (attrs['data-no-border'] === true || attrs['data-no-border'] === 'true') return true;
  if (typeof attrs.class === 'string' && attrs.class.split(/\s+/).includes('border-none')) {
    return true;
  }
  return false;
}

function cellStyleLooksBorderless(style: unknown): boolean {
  if (typeof style !== 'string') return false;
  return /border\s*:\s*none/i.test(style) || /border-width\s*:\s*0/i.test(style);
}

function tableLooksBorderless(node: {
  attrs?: Record<string, unknown>;
  content?: unknown[];
}): boolean {
  if (isBorderlessTable(node.attrs)) return true;

  const rows = Array.isArray(node.content) ? node.content : [];
  let cellCount = 0;
  let borderlessCellCount = 0;

  const walk = (n: { type?: string; attrs?: Record<string, unknown>; content?: unknown[] }) => {
    if (n.type === 'tableCell' || n.type === 'tableHeader') {
      cellCount += 1;
      if (cellStyleLooksBorderless(n.attrs?.style)) {
        borderlessCellCount += 1;
      }
    }
    if (Array.isArray(n.content)) {
      for (const child of n.content) {
        walk(child as typeof n);
      }
    }
  };

  for (const row of rows) {
    walk(row as { type?: string; attrs?: Record<string, unknown>; content?: unknown[] });
  }

  return cellCount > 0 && borderlessCellCount === cellCount;
}

function stripVerticalTableMargins(existing: string | null | undefined): string | null {
  if (!existing) return null;
  const cleaned = existing
    .replace(/margin-top\s*:[^;]+;?/gi, '')
    .replace(/margin-bottom\s*:[^;]+;?/gi, '')
    .replace(/margin\s*:\s*[^;]+;?/gi, '')
    .replace(/;\s*;/g, ';')
    .trim()
    .replace(/^;|;$/g, '')
    .trim();
  return cleaned || null;
}
function stripOutlineFromStyle(existing: string | null | undefined): string | null {
  if (!existing) return null;
  const cleaned = existing
    .replace(/outline\s*:[^;]+;?/gi, '')
    .replace(/;\s*;/g, ';')
    .trim()
    .replace(/^;|;$/g, '')
    .trim();
  return cleaned || null;
}

type ImageExportAlignment = 'left' | 'right' | 'center' | 'none';

type TemplateWalkNode = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: unknown[];
};

/** Görsel hizası: yalnızca görsel attrs'ından çözülür; paragraf/hücre text-align kullanılmaz. */
export function resolveImageExportAlignment(
  attrs: Record<string, unknown>
): ImageExportAlignment {
  const explicit = attrs.align;
  if (explicit === 'left' || explicit === 'right' || explicit === 'center') {
    return explicit;
  }

  const wrapperStyle = String(attrs.wrapperStyle || '');
  const containerStyle = String(attrs.containerStyle || '');

  if (/float\s*:\s*left/i.test(wrapperStyle)) return 'left';
  if (/float\s*:\s*right/i.test(wrapperStyle)) return 'right';
  if (/margin\s*:\s*0\s+auto\s+0\s+0/i.test(containerStyle)) return 'left';
  if (/margin\s*:\s*0\s+0\s+0\s+auto/i.test(containerStyle)) return 'right';
  if (/margin\s*:\s*0\s+auto/i.test(containerStyle)) return 'center';

  // Editörde inline görsel varsayılanı sola yaslı görünür
  return 'left';
}

function buildImageBlockAlignStyle(
  attrs: Record<string, unknown>,
  align: ImageExportAlignment
): string {
  const parts: string[] = [];
  const width = extractImageWidth(attrs);
  if (width) parts.push(`width: ${width}`);

  const height = attrs.height;
  if (height != null && height !== '') {
    const asString = String(height);
    parts.push(`height: ${asString.endsWith('px') ? asString : `${asString}px`}`);
  }

  parts.push('display: block', 'max-width: 100%');
  if (align === 'left') {
    parts.push('margin-left: 0', 'margin-right: auto');
  } else if (align === 'right') {
    parts.push('margin-left: auto', 'margin-right: 0');
  } else if (align === 'center') {
    parts.push('margin-left: auto', 'margin-right: auto');
  }

  return parts.join('; ') + ';';
}

function syncTextAlignForImageExport(
  paragraph: TemplateWalkNode | undefined,
  cell: TemplateWalkNode | undefined,
  align: ImageExportAlignment
) {
  if (paragraph?.attrs) {
    paragraph.attrs.textAlign = align;
  }

  if (!cell?.attrs) return;

  const rawStyle = String(cell.attrs.style || '')
    .replace(/text-align\s*:\s*[^;]+;?/gi, '')
    .replace(/;\s*;/g, ';')
    .trim()
    .replace(/^;|;$/g, '')
    .trim();

  cell.attrs.style = rawStyle ? `${rawStyle}; text-align: ${align}` : `text-align: ${align}`;
}

function ensureTableCellExportStyle(node: TemplateWalkNode) {
  if (node.type !== 'tableCell' && node.type !== 'tableHeader') return;
  if (!node.attrs) node.attrs = {};

  let style = String(node.attrs.style || '')
    .replace(/border-collapse\s*:\s*separate\s*!important\s*;?/gi, '')
    .trim();

  const colwidth = node.attrs.colwidth;
  if (!/width\s*:/i.test(style) && Array.isArray(colwidth) && colwidth[0]) {
    style = style ? `${style}; width: ${colwidth[0]}px` : `width: ${colwidth[0]}px`;
  }

  node.attrs.style = style;
}

function ensureTableExportStyle(node: TemplateWalkNode) {
  if (node.type !== 'table' || !node.attrs) return;
  const style = String(node.attrs.style || '');
  if (!/width\s*:/i.test(style)) {
    node.attrs.style = style ? `${style}; width: 100%` : 'width: 100%';
  }
}

function extractImageWidth(attrs: Record<string, unknown>): string | null {
  const width = attrs.width;
  if (width != null && width !== '') {
    const asString = String(width);
    return asString.endsWith('px') ? asString : `${asString}px`;
  }

  const containerStyle = String(attrs.containerStyle || '');
  const match = containerStyle.match(/width:\s*([0-9.]+)px/i);
  return match ? `${match[1]}px` : null;
}

function buildImageExportStyle(
  attrs: Record<string, unknown>,
  align: ImageExportAlignment
): string {
  const parts: string[] = [];
  const width = extractImageWidth(attrs);
  if (width) parts.push(`width: ${width}`);

  const height = attrs.height;
  if (height != null && height !== '') {
    const asString = String(height);
    parts.push(`height: ${asString.endsWith('px') ? asString : `${asString}px`}`);
  }

  if (align === 'left') {
    parts.push('float: left', 'margin-right: 1.5rem', 'margin-bottom: 0.5rem', 'display: inline-block');
  } else if (align === 'right') {
    parts.push('float: right', 'margin-left: 1.5rem', 'margin-bottom: 0.5rem', 'display: inline-block');
  } else if (align === 'center') {
    parts.push('display: block', 'margin-left: auto', 'margin-right: auto', 'clear: both');
  } else {
    parts.push('display: inline-block');
  }

  return parts.join('; ') + ';';
}

function normalizeImageNodeForExport(
  node: { attrs?: Record<string, unknown> },
  insideTableCell: boolean,
  paragraph?: TemplateWalkNode,
  cell?: TemplateWalkNode
) {
  if (!node.attrs) node.attrs = {};

  const imageId = node.attrs['data-image-id'];
  if (imageId) {
    node.attrs.src = `image:${imageId}`;
    delete node.attrs['data-image-id'];
  }

  const align = resolveImageExportAlignment(node.attrs);

  if (insideTableCell) {
    node.attrs.align = align;
    node.attrs.style = buildImageBlockAlignStyle(node.attrs, align);
    syncTextAlignForImageExport(paragraph, cell, align);
    return;
  }

  node.attrs.align = align;
  node.attrs.style = buildImageExportStyle(node.attrs, align);
}

function applyBorderlessToCells(node: {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: unknown[];
}) {
  if (node.type === 'tableCell' || node.type === 'tableHeader') {
    if (!node.attrs) node.attrs = {};
    node.attrs.style = appendBorderlessStyle(
      stripOutlineFromStyle(node.attrs.style as string | undefined)
    );
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      applyBorderlessToCells(child as typeof node);
    }
  }
}

/** Kaydet / önizleme için: borderless tablolarda çizgileri HTML/PDF tarafında da kaldırır */
export function prepareTemplateContentForExport(content: unknown): unknown {
  const cloned = JSON.parse(JSON.stringify(content));

  const walkNode = (node: TemplateWalkNode, ancestors: TemplateWalkNode[]) => {
    if (!node || typeof node !== 'object') return;

    const cell = [...ancestors]
      .reverse()
      .find((ancestor) => ancestor.type === 'tableCell' || ancestor.type === 'tableHeader');
    const paragraph = [...ancestors].reverse().find((ancestor) => ancestor.type === 'paragraph');
    const insideTableCell = Boolean(cell);

    if (node.type === 'tableCell' || node.type === 'tableHeader') {
      ensureTableCellExportStyle(node);
    }

    if ((node.type === 'image' || node.type === 'imageResize') && node.attrs) {
      normalizeImageNodeForExport(node, insideTableCell, paragraph, cell);
    }

    if (node.type === 'table') {
      if (!node.attrs) node.attrs = {};
      ensureTableExportStyle(node);
      const strippedStyle = stripVerticalTableMargins(node.attrs.style as string | undefined);
      if (strippedStyle) {
        node.attrs.style = strippedStyle;
      } else {
        delete node.attrs.style;
      }
    }

    if (node.type === 'table' && tableLooksBorderless(node)) {
      if (!node.attrs) node.attrs = {};
      const className = typeof node.attrs.class === 'string' ? node.attrs.class : '';
      node.attrs.noBorder = true;
      node.attrs['data-no-border'] = 'true';
      node.attrs.class = className.split(/\s+/).includes('border-none')
        ? className
        : `${className} border-none`.trim();
      node.attrs.style = appendBorderlessStyle(stripOutlineFromStyle(node.attrs.style as string));
      applyBorderlessToCells(node);
    }

    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        walkNode(child as TemplateWalkNode, [...ancestors, node]);
      }
    }
  };

  walkNode(cloned as TemplateWalkNode, []);
  return cloned;
}

/** Tablodaki çizgileri aç/kapa; hücre style attr'ını da günceller (PDF için) */
export function toggleTableNoBorder(editor: Editor) {
  const { state } = editor;
  const { $from } = state.selection;
  let tablePos: number | null = null;
  let tableNode = null as ReturnType<typeof $from.node> | null;

  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name === 'table') {
      tablePos = $from.before(depth);
      tableNode = node;
      break;
    }
  }

  if (tablePos == null || !tableNode) return;

  const nextNoBorder = !tableNode.attrs.noBorder;
  let tr = state.tr.setNodeMarkup(tablePos, undefined, {
    ...tableNode.attrs,
    noBorder: nextNoBorder,
  });

  tableNode.descendants((node, pos) => {
    if (node.type.name !== 'tableCell' && node.type.name !== 'tableHeader') {
      return;
    }
    const absolutePos = tablePos! + 1 + pos;
    const nextStyle = nextNoBorder
      ? appendBorderlessStyle(node.attrs.style as string | undefined)
      : removeBorderlessStyle(node.attrs.style as string | undefined);
    tr = tr.setNodeMarkup(absolutePos, undefined, {
      ...node.attrs,
      style: nextStyle,
    });
  });

  editor.view.dispatch(tr);
  editor.commands.focus();
}

/** Düzen şablonları eklendikten sonra tabloyu borderless olarak işaretler */
export function ensureLayoutTablesBorderless(editor: Editor) {
  const { state } = editor;
  let tr = state.tr;
  let changed = false;

  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'table') {
      return;
    }

    let looksBorderless = isBorderlessTable(node.attrs);
    if (!looksBorderless) {
      let cellCount = 0;
      let borderlessCellCount = 0;
      node.descendants((cell) => {
        if (cell.type.name === 'tableCell' || cell.type.name === 'tableHeader') {
          cellCount += 1;
          if (cellStyleLooksBorderless(cell.attrs.style)) {
            borderlessCellCount += 1;
          }
        }
      });
      looksBorderless = cellCount > 0 && borderlessCellCount === cellCount;
    }

    if (!looksBorderless) {
      return;
    }

    const className = typeof node.attrs.class === 'string' ? node.attrs.class : '';
    const nextTableAttrs = {
      ...node.attrs,
      noBorder: true,
      'data-no-border': 'true',
      class: className.split(/\s+/).includes('border-none')
        ? className
        : `${className} border-none`.trim(),
      style: appendBorderlessStyle(stripOutlineFromStyle(node.attrs.style as string)),
    };

    if (
      node.attrs.noBorder !== true ||
      node.attrs['data-no-border'] !== 'true' ||
      node.attrs.style !== nextTableAttrs.style
    ) {
      tr = tr.setNodeMarkup(pos, undefined, nextTableAttrs);
      changed = true;
    }

    node.descendants((cell, cellPos) => {
      if (cell.type.name !== 'tableCell' && cell.type.name !== 'tableHeader') {
        return;
      }
      const absolutePos = pos + 1 + cellPos;
      const nextStyle = appendBorderlessStyle(stripOutlineFromStyle(cell.attrs.style as string | undefined));
      if (nextStyle !== cell.attrs.style) {
        tr = tr.setNodeMarkup(absolutePos, undefined, {
          ...cell.attrs,
          style: nextStyle,
        });
        changed = true;
      }
    });
  });

  if (changed) {
    editor.view.dispatch(tr);
  }
}

export const CustomTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: 'left',
        parseHTML: (element) => element.getAttribute('align') || 'left',
        renderHTML: (attributes) => {
          if (attributes.align === 'center') {
            return {
              align: 'center',
              style:
                'margin-left: auto !important; margin-right: auto !important; margin-top: 0 !important; margin-bottom: 0 !important;',
            };
          }
          if (attributes.align === 'right') {
            return {
              align: 'right',
              style:
                'margin-left: auto !important; margin-right: 0 !important; margin-top: 0 !important; margin-bottom: 0 !important;',
            };
          }
          return {
            align: 'left',
            style:
              'margin-right: auto !important; margin-left: 0 !important; margin-top: 0 !important; margin-bottom: 0 !important;',
          };
        },
      },
      noBorder: {
        default: false,
        parseHTML: (element) =>
          element.classList.contains('border-none') ||
          element.getAttribute('data-no-border') === 'true',
        renderHTML: (attributes) => {
          if (!attributes.noBorder) {
            return {};
          }
          return {
            class: 'border-none',
            'data-no-border': 'true',
            style: `${BORDERLESS_STYLE} border-collapse: collapse !important;`,
          };
        },
      },
    };
  },
});

const cellStyleAttribute = {
  default: null as string | null,
  parseHTML: (element: HTMLElement) => element.getAttribute('style'),
  renderHTML: (attributes: { style?: string | null }) => {
    if (!attributes.style) {
      return {};
    }
    return { style: attributes.style };
  },
};

export const CustomTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      style: cellStyleAttribute,
    };
  },
});

export const CustomTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      style: cellStyleAttribute,
    };
  },
});
