/**
 * Sütun düzeni (layout) tabloları: logo + başlık gibi yan yana içerikler için kullanılan
 * tablolar. Tek doğruluk kaynağı hücre stilindeki `width: N%` değeridir; `colwidth` (px)
 * kullanılmaz. Böylece tablo her zaman sayfa genişliğini kaplar ve editör ile PDF aynı
 * yüzdelerle dizilir (backend hücre `width` stilini aynen geçirir).
 *
 * - Sütun kenarından sürükleme: canlı önizleme yüzde ile yapılır, bırakınca px→% çevrilir;
 *   sürüklenen sütunun komşusu farkı karşılar (Word'deki gibi), toplam %100 kalır.
 * - Sütun ekle/sil, hücre birleştir vb. sonrası yüzdeler otomatik yeniden dağıtılır.
 * - Çizgisiz tabloda Tab son hücrede yeni satır eklemez.
 */
import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type Transaction,
} from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import {
  CellSelection,
  TableMap,
  columnResizingPluginKey,
  moveTableColumn,
} from '@tiptap/pm/tables';

/** Bir sütunun alabileceği en küçük genişlik (%) */
export const MIN_COLUMN_PERCENT = 5;
/** prosemirror-tables varsayılan cellMinWidth (px) */
const CELL_MIN_WIDTH_PX = 25;
/** Toplam bu kadar saparsa yüzdeler yeniden dağıtılır */
const SUM_TOLERANCE = 0.6;

// ---------------------------------------------------------------------------
// Stil yardımcıları
// ---------------------------------------------------------------------------

/** `prop: value` bildirimini ekler/değiştirir; value null ise kaldırır. */
export function setStyleProp(
  style: string | null | undefined,
  prop: string,
  value: string | null
): string | null {
  const target = prop.trim().toLowerCase();
  const declarations = String(style || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => part.slice(0, part.indexOf(':')).trim().toLowerCase() !== target);
  if (value != null && value !== '') {
    declarations.push(`${target}: ${value}`);
  }
  return declarations.length ? `${declarations.join('; ')};` : null;
}

/** Stildeki `prop` değerini döndürür (yoksa null). */
export function getStyleProp(style: string | null | undefined, prop: string): string | null {
  const target = prop.trim().toLowerCase();
  for (const part of String(style || '').split(';')) {
    const idx = part.indexOf(':');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim().toLowerCase() === target) {
      return part
        .slice(idx + 1)
        .replace(/!important/i, '')
        .trim();
    }
  }
  return null;
}

function parsePercentWidth(style: unknown): number | null {
  const value = getStyleProp(typeof style === 'string' ? style : null, 'width');
  if (!value) return null;
  const match = value.match(/^([0-9]+(?:\.[0-9]+)?)%$/);
  if (!match) return null;
  const num = Number.parseFloat(match[1]);
  return Number.isFinite(num) && num > 0 ? num : null;
}

export function formatPercent(value: number): string {
  return `${Number(value.toFixed(1))}%`;
}

// ---------------------------------------------------------------------------
// Yüzde hesapları (saf fonksiyonlar)
// ---------------------------------------------------------------------------

/** 0,1 hassasiyete yuvarlar ve toplamı tam 100 yapar (fark en geniş sütuna yazılır). */
export function roundPercents(percents: number[]): number[] {
  if (percents.length === 0) return [];
  const sum = percents.reduce((a, b) => a + b, 0) || 1;
  const tenths = percents.map((p) => Math.max(1, Math.round((p / sum) * 1000)));
  const diff = 1000 - tenths.reduce((a, b) => a + b, 0);
  if (diff !== 0) {
    let widest = 0;
    tenths.forEach((t, i) => {
      if (t > tenths[widest]) widest = i;
    });
    tenths[widest] += diff;
  }
  return tenths.map((t) => t / 10);
}

export function equalPercents(count: number): number[] {
  return roundPercents(Array.from({ length: Math.max(1, count) }, () => 1));
}

/**
 * `col` sütununu `newPercent` yapar; farkı komşu sütun karşılar (sağdaki, son sütunsa
 * soldaki). Diğer sütunlar değişmez — sınır çizgisini sürüklemekle aynı davranış.
 */
export function resizeColumn(percents: number[], col: number, newPercent: number): number[] {
  const next = [...percents];
  if (next.length < 2 || col < 0 || col >= next.length) return next;
  const neighbor = col < next.length - 1 ? col + 1 : col - 1;
  const pair = next[col] + next[neighbor];
  const clamped = Math.min(
    Math.max(newPercent, MIN_COLUMN_PERCENT),
    pair - MIN_COLUMN_PERCENT
  );
  next[col] = clamped;
  next[neighbor] = pair - clamped;
  return roundPercents(next);
}

/** Sınır sürüklemesi (px): sürüklenen sütunun yeni px genişliğini yüzdeye çevirir. */
export function percentsAfterDrag(
  base: number[],
  col: number,
  draggedPx: number,
  tableWidthPx: number
): number[] {
  if (!(tableWidthPx > 0)) return roundPercents(base);
  return resizeColumn(base, col, (draggedPx / tableWidthPx) * 100);
}

/**
 * Sütun başına hücre stilinden okunan yüzdeler (bilinmeyen sütun null). Birleştirilmiş
 * hücrelerde öncelik tek sütunluk hücrelerdedir; yoksa colspan'a bölünür.
 */
export function getRawColumnPercents(table: ProseMirrorNode): (number | null)[] {
  const map = TableMap.get(table);
  const result: (number | null)[] = new Array(map.width).fill(null);
  for (let col = 0; col < map.width; col++) {
    let fallback: number | null = null;
    for (let row = 0; row < map.height; row++) {
      const cellPos = map.map[row * map.width + col];
      const cell = table.nodeAt(cellPos);
      if (!cell) continue;
      const pct = parsePercentWidth(cell.attrs.style);
      if (pct == null) continue;
      const colspan = Number(cell.attrs.colspan) || 1;
      if (colspan === 1) {
        result[col] = pct;
        fallback = null;
        break;
      }
      if (fallback == null) fallback = pct / colspan;
    }
    if (result[col] == null && fallback != null) result[col] = fallback;
  }
  return result;
}

/** Eksik sütunlara eşit pay verir, kalanları orantılı ölçekler. */
export function completePercents(raw: (number | null)[]): number[] {
  const count = raw.length;
  if (count === 0) return [];
  const missing = raw.filter((p) => p == null).length;
  const knownSum = raw.reduce<number>((sum, p) => sum + (p ?? 0), 0);
  if (missing === count || knownSum <= 0) return equalPercents(count);
  const share = 100 / count;
  const knownTarget = 100 - missing * share;
  return roundPercents(raw.map((p) => (p == null ? share : (p / knownSum) * knownTarget)));
}

/** Yüzde tabanlı tablo mu (en az bir hücrede `width: N%`)? */
export function hasPercentColumns(table: ProseMirrorNode): boolean {
  return getRawColumnPercents(table).some((p) => p != null);
}

function tableHasColwidth(table: ProseMirrorNode): boolean {
  let found = false;
  table.descendants((node) => {
    if (found) return false;
    if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
      const colwidth = node.attrs.colwidth as number[] | null;
      if (Array.isArray(colwidth) && colwidth.some((w) => w > 0)) found = true;
      return false;
    }
    return true;
  });
  return found;
}

/** px colwidth'lerden oran (hepsi biliniyorsa) */
function percentsFromColwidths(table: ProseMirrorNode): number[] | null {
  const map = TableMap.get(table);
  const widths: number[] = [];
  for (let col = 0; col < map.width; col++) {
    const cellPos = map.map[col];
    const cell = table.nodeAt(cellPos);
    const rect = map.findCell(cellPos);
    const colwidth = cell?.attrs.colwidth as number[] | null;
    const w = colwidth?.[col - rect.left];
    if (!w) return null;
    widths.push(w);
  }
  return roundPercents(widths);
}

/** Araç çubuğunda gösterilecek yüzdeler: % → px oranı → eşit. */
export function getDisplayPercents(table: ProseMirrorNode): number[] {
  const raw = getRawColumnPercents(table);
  if (raw.some((p) => p != null)) return completePercents(raw);
  return percentsFromColwidths(table) ?? equalPercents(TableMap.get(table).width);
}

export function isBorderlessTableNode(table: ProseMirrorNode): boolean {
  const attrs = table.attrs as Record<string, unknown>;
  return attrs.noBorder === true || attrs.noBorder === 'true';
}

/** Yüzde düzeni uygulanacak tablo: çizgisiz ya da zaten yüzdeli. */
export function isLayoutCandidate(table: ProseMirrorNode): boolean {
  return isBorderlessTableNode(table) || hasPercentColumns(table);
}

/**
 * Tablo hücrelerine yüzdeleri yazar ve px colwidth'i temizler. Yalnızca attr değiştirdiği
 * için konumlar kaymaz. `tablePos` tablonun `tr.doc` içindeki konumudur.
 */
export function applyColumnPercents(
  tr: Transaction,
  tablePos: number,
  table: ProseMirrorNode,
  percents: number[]
): Transaction {
  const map = TableMap.get(table);
  const seen = new Set<number>();
  for (const cellPos of map.map) {
    if (seen.has(cellPos)) continue;
    seen.add(cellPos);
    const cell = table.nodeAt(cellPos);
    if (!cell) continue;
    const rect = map.findCell(cellPos);
    let width = 0;
    for (let col = rect.left; col < rect.right; col++) width += percents[col] ?? 0;
    const style = setStyleProp(
      cell.attrs.style as string | null,
      'width',
      formatPercent(width)
    );
    if (style !== cell.attrs.style || cell.attrs.colwidth != null) {
      tr.setNodeMarkup(tablePos + 1 + cellPos, undefined, {
        ...cell.attrs,
        style,
        colwidth: null,
      });
    }
  }
  return tr;
}

// ---------------------------------------------------------------------------
// Seçim yardımcıları
// ---------------------------------------------------------------------------

export type TableContext = {
  pos: number;
  node: ProseMirrorNode;
  map: TableMap;
  /** Seçimdeki hücrenin tablo içi göreli konumu */
  cellPos: number | null;
  col: number;
  row: number;
  colCount: number;
};

export function findTableContext(state: EditorState): TableContext | null {
  const { selection } = state;
  const $pos = selection instanceof CellSelection ? selection.$headCell : selection.$from;

  let tableDepth = -1;
  let cellDepth = -1;
  for (let depth = $pos.depth; depth > 0; depth--) {
    const name = $pos.node(depth).type.name;
    if (cellDepth < 0 && (name === 'tableCell' || name === 'tableHeader')) cellDepth = depth;
    if (name === 'table') {
      tableDepth = depth;
      break;
    }
  }

  let pos: number;
  let node: ProseMirrorNode;
  if (tableDepth > 0) {
    pos = $pos.before(tableDepth);
    node = $pos.node(tableDepth);
  } else if (selection instanceof CellSelection) {
    // $headCell hücrenin önünü gösterir: üst düğüm satır, onun üstü tablo
    pos = $pos.before($pos.depth - 1);
    node = $pos.node($pos.depth - 1);
  } else {
    const selected = (selection as { node?: ProseMirrorNode }).node;
    if (selected?.type.name !== 'table') return null;
    pos = selection.from;
    node = selected;
  }
  if (node.type.name !== 'table') return null;

  const map = TableMap.get(node);
  let cellPos: number | null = null;
  if (selection instanceof CellSelection) {
    cellPos = selection.$headCell.pos - pos - 1;
  } else if (cellDepth > 0) {
    cellPos = $pos.before(cellDepth) - pos - 1;
  }
  let col = 0;
  let row = 0;
  if (cellPos != null && map.map.includes(cellPos)) {
    const rect = map.findCell(cellPos);
    col = rect.left;
    row = rect.top;
  }
  return { pos, node, map, cellPos, col, row, colCount: map.width };
}

/** Seçili hücreler (CellSelection) ya da imlecin bulunduğu hücre — mutlak konumlar */
function selectedCellPositions(state: EditorState, ctx: TableContext): number[] {
  const { selection } = state;
  if (selection instanceof CellSelection) {
    const positions: number[] = [];
    selection.forEachCell((_node, pos) => positions.push(pos));
    return positions;
  }
  return ctx.cellPos != null ? [ctx.pos + 1 + ctx.cellPos] : [];
}

// ---------------------------------------------------------------------------
// Komutlar
// ---------------------------------------------------------------------------

export function setColumnPercents(
  editor: Editor,
  percents: number[],
  options: { addToHistory?: boolean } = {}
): boolean {
  const ctx = findTableContext(editor.state);
  if (!ctx || percents.length !== ctx.colCount) return false;
  const tr = applyColumnPercents(editor.state.tr, ctx.pos, ctx.node, roundPercents(percents));
  if (!tr.docChanged) return false;
  if (options.addToHistory === false) tr.setMeta('addToHistory', false);
  editor.view.dispatch(tr);
  return true;
}

/** Seçili hücre(ler)in stiline yazar (ör. vertical-align, text-align). */
export function setSelectedCellStyle(editor: Editor, prop: string, value: string | null) {
  const ctx = findTableContext(editor.state);
  if (!ctx) return;
  const { tr } = editor.state;
  for (const pos of selectedCellPositions(editor.state, ctx)) {
    const cell = tr.doc.nodeAt(pos);
    if (!cell) continue;
    tr.setNodeMarkup(pos, undefined, {
      ...cell.attrs,
      style: setStyleProp(cell.attrs.style as string | null, prop, value),
    });
  }
  if (tr.docChanged) editor.view.dispatch(tr);
}

export function getSelectedCellStyle(editor: Editor, prop: string): string | null {
  const ctx = findTableContext(editor.state);
  if (!ctx || ctx.cellPos == null) return null;
  const cell = ctx.node.nodeAt(ctx.cellPos);
  return getStyleProp(cell?.attrs.style as string | null, prop);
}

/** Tablonun tüm hücrelerine aynı stili yazar (ör. iç boşluk). */
export function setAllCellsStyle(editor: Editor, prop: string, value: string | null) {
  const ctx = findTableContext(editor.state);
  if (!ctx) return;
  const { tr } = editor.state;
  ctx.node.descendants((cell, relPos) => {
    if (cell.type.name !== 'tableCell' && cell.type.name !== 'tableHeader') return true;
    tr.setNodeMarkup(ctx.pos + 1 + relPos, undefined, {
      ...cell.attrs,
      style: setStyleProp(cell.attrs.style as string | null, prop, value),
    });
    return false;
  });
  if (tr.docChanged) editor.view.dispatch(tr);
}

export function getFirstCellStyle(table: ProseMirrorNode, prop: string): string | null {
  const map = TableMap.get(table);
  const cell = table.nodeAt(map.map[0]);
  return getStyleProp(cell?.attrs.style as string | null, prop);
}

/** İmleci verilen sütunun (aynı satırdaki) hücresinin başına taşır. */
export function focusColumn(editor: Editor, col: number) {
  const ctx = findTableContext(editor.state);
  if (!ctx || col < 0 || col >= ctx.colCount) return;
  const cellPos = ctx.map.map[ctx.row * ctx.map.width + col];
  const abs = ctx.pos + 1 + cellPos;
  const selection = TextSelection.near(editor.state.doc.resolve(abs + 1));
  editor.view.dispatch(editor.state.tr.setSelection(selection).scrollIntoView());
  editor.view.focus();
}

/** Bulunulan sütunu sola (-1) / sağa (+1) taşır; genişliği de onunla birlikte gider. */
export function moveColumn(editor: Editor, direction: -1 | 1): boolean {
  const ctx = findTableContext(editor.state);
  if (!ctx) return false;
  const target = ctx.col + direction;
  if (target < 0 || target >= ctx.colCount) return false;
  return moveTableColumn({ from: ctx.col, to: target, select: false, pos: ctx.pos + 1 })(
    editor.state,
    editor.view.dispatch
  );
}

/** Tablonun hemen üstüne / altına boş paragraf ekler ve imleci oraya koyar. */
export function insertParagraphAroundTable(editor: Editor, where: 'before' | 'after') {
  const ctx = findTableContext(editor.state);
  if (!ctx) return;
  const paragraph = editor.schema.nodes.paragraph.create();
  const insertPos = where === 'before' ? ctx.pos : ctx.pos + ctx.node.nodeSize;
  const tr = editor.state.tr.insert(insertPos, paragraph);
  tr.setSelection(TextSelection.create(tr.doc, insertPos + 1)).scrollIntoView();
  editor.view.dispatch(tr);
  editor.view.focus();
}

/** Düzeni çözer: tabloyu kaldırıp hücre içeriklerini sırayla alt alta bırakır. */
export function unwrapTable(editor: Editor) {
  const ctx = findTableContext(editor.state);
  if (!ctx) return;
  const blocks: ProseMirrorNode[] = [];
  const seen = new Set<number>();
  for (const cellPos of ctx.map.map) {
    if (seen.has(cellPos)) continue;
    seen.add(cellPos);
    const cell = ctx.node.nodeAt(cellPos);
    cell?.forEach((child) => {
      const isEmptyParagraph = child.type.name === 'paragraph' && child.content.size === 0;
      if (!isEmptyParagraph) blocks.push(child);
    });
  }
  if (blocks.length === 0) blocks.push(editor.schema.nodes.paragraph.create());
  const tr = editor.state.tr.replaceWith(ctx.pos, ctx.pos + ctx.node.nodeSize, blocks);
  tr.setSelection(TextSelection.near(tr.doc.resolve(ctx.pos + 1))).scrollIntoView();
  editor.view.dispatch(tr);
  editor.view.focus();
}

// ---------------------------------------------------------------------------
// Hazır düzen ekleme
// ---------------------------------------------------------------------------

type JSONNode = Record<string, unknown>;

/**
 * Tablo JSON'unu, imleç bir tablonun içindeyse o tablonun altına (iç içe tablo oluşmasın),
 * değilse bulunulan bloğun yerine (boşsa) ya da altına ekler. Eklenen tablonun konumunu
 * döndürür ve imleci `focusCell` sıradaki hücreye koyar.
 */
export function insertTableBlock(
  editor: Editor,
  tableJSON: JSONNode,
  focusCell = 0
): number | null {
  const { state } = editor;
  const table = state.schema.nodeFromJSON(tableJSON);
  const { $from } = state.selection;

  let insertPos: number;
  let replaceTo: number | null = null;
  if ($from.depth === 0) {
    insertPos = $from.pos;
  } else {
    // En dış tablo ya da üst seviye blok
    let topDepth = 1;
    for (let depth = 1; depth <= $from.depth; depth++) {
      if ($from.node(depth).type.name === 'table') {
        topDepth = depth;
        break;
      }
    }
    const block = $from.node(topDepth);
    const blockPos = $from.before(topDepth);
    const isEmptyParagraph = block.type.name === 'paragraph' && block.content.size === 0;
    if (isEmptyParagraph && topDepth === 1) {
      insertPos = blockPos;
      replaceTo = blockPos + block.nodeSize;
    } else {
      insertPos = blockPos + block.nodeSize;
    }
  }

  const tr = state.tr;
  if (replaceTo != null) {
    tr.replaceWith(insertPos, replaceTo, table);
  } else {
    tr.insert(insertPos, table);
  }
  // Tablo belgenin sonundaysa yazmaya devam edebilmek için altına paragraf
  const afterTable = insertPos + table.nodeSize;
  if (afterTable >= tr.doc.content.size) {
    tr.insert(afterTable, state.schema.nodes.paragraph.create());
  }

  const inserted = tr.doc.nodeAt(insertPos);
  if (inserted) {
    const map = TableMap.get(inserted);
    const cellPos = map.map[Math.min(focusCell, map.map.length - 1)];
    tr.setSelection(TextSelection.near(tr.doc.resolve(insertPos + 1 + cellPos + 1)));
  }
  editor.view.dispatch(tr.scrollIntoView());
  editor.view.focus();
  return insertPos;
}

// ---------------------------------------------------------------------------
// ProseMirror eklentisi
// ---------------------------------------------------------------------------

export const layoutTablePluginKey = new PluginKey('layoutTable');

type DragContext = {
  tablePos: number;
  col: number;
  base: number[];
  tableWidth: number;
  tableEl: HTMLTableElement;
};

function resolveHandle(state: EditorState, handle: number) {
  if (handle < 0 || handle > state.doc.content.size) return null;
  const $cell = state.doc.resolve(handle);
  const cell = $cell.nodeAfter;
  const table = $cell.node(-1);
  if (!cell || !table || table.type.name !== 'table') return null;
  const map = TableMap.get(table);
  const start = $cell.start(-1);
  const col = map.colCount($cell.pos - start) + (Number(cell.attrs.colspan) || 1) - 1;
  return { table, tablePos: start - 1, col, map };
}

function startDrag(view: EditorView, handle: number): DragContext | null {
  const resolved = resolveHandle(view.state, handle);
  if (!resolved || !isLayoutCandidate(resolved.table)) return null;
  const wrapper = view.nodeDOM(resolved.tablePos) as HTMLElement | null;
  const tableEl =
    wrapper instanceof HTMLTableElement
      ? wrapper
      : (wrapper?.querySelector?.('table') as HTMLTableElement | null);
  if (!tableEl || !(tableEl.offsetWidth > 0)) return null;
  return {
    tablePos: resolved.tablePos,
    col: resolved.col,
    base: getDisplayPercents(resolved.table),
    tableWidth: tableEl.offsetWidth,
    tableEl,
  };
}

/** prosemirror-tables'ın px önizlemesini, bırakınca oluşacak yüzde düzeniyle değiştirir. */
function previewDrag(view: EditorView, drag: DragContext, clientX: number) {
  const resize = columnResizingPluginKey.getState(view.state);
  if (!resize?.dragging) return;
  const px = Math.max(
    CELL_MIN_WIDTH_PX,
    resize.dragging.startWidth + clientX - resize.dragging.startX
  );
  const percents = percentsAfterDrag(drag.base, drag.col, px, drag.tableWidth);
  const cols = drag.tableEl.querySelectorAll(':scope > colgroup > col');
  percents.forEach((pct, i) => {
    const col = cols[i] as HTMLElement | undefined;
    if (col) col.style.width = `${pct}%`;
  });
  drag.tableEl.style.width = '';
  drag.tableEl.style.minWidth = '';
}

function normalizePercentTables(state: EditorState): Transaction | null {
  const tr = state.tr;
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'table') return true;
    const raw = getRawColumnPercents(node);
    if (raw.some((p) => p != null) && !tableHasColwidth(node)) {
      const sum = raw.reduce<number>((s, p) => s + (p ?? 0), 0);
      const needsFix = raw.some((p) => p == null) || Math.abs(sum - 100) > SUM_TOLERANCE;
      if (needsFix) applyColumnPercents(tr, pos, node, completePercents(raw));
    }
    return true; // iç içe tablolar
  });
  return tr.docChanged ? tr : null;
}

export function createLayoutTablePlugin() {
  let drag: DragContext | null = null;

  return new Plugin({
    key: layoutTablePluginKey,

    view(editorView) {
      let frame = 0;
      const onMove = (event: MouseEvent) => {
        if (!drag) return;
        const clientX = event.clientX;
        cancelAnimationFrame(frame);
        // prosemirror-tables kendi px önizlemesini bu olayda yazar; biz sonra üzerine yazarız
        frame = requestAnimationFrame(() => {
          if (drag) previewDrag(editorView, drag, clientX);
        });
      };
      const win = editorView.dom.ownerDocument.defaultView ?? window;

      return {
        update(view, prevState) {
          const cur = columnResizingPluginKey.getState(view.state);
          const prev = columnResizingPluginKey.getState(prevState);
          if (cur?.dragging && !prev?.dragging) {
            drag = startDrag(view, cur.activeHandle);
            if (drag) win.addEventListener('mousemove', onMove);
          } else if (!cur?.dragging && prev?.dragging) {
            drag = null;
            cancelAnimationFrame(frame);
            win.removeEventListener('mousemove', onMove);
          }
        },
        destroy() {
          drag = null;
          cancelAnimationFrame(frame);
          win.removeEventListener('mousemove', onMove);
        },
      };
    },

    appendTransaction(transactions, oldState, newState) {
      if (!transactions.some((tr) => tr.docChanged)) return null;

      // 1) Sütun kenarı sürüklemesi bitti: px colwidth → yüzde
      const prevResize = columnResizingPluginKey.getState(oldState);
      if (drag && prevResize?.dragging) {
        let tablePos = drag.tablePos;
        for (const tr of transactions) tablePos = tr.mapping.map(tablePos);
        const table = newState.doc.nodeAt(tablePos);
        if (table?.type.name === 'table') {
          const map = TableMap.get(table);
          let draggedPx: number | null = null;
          for (let row = 0; row < map.height && draggedPx == null; row++) {
            const cellPos = map.map[row * map.width + drag.col];
            const cell = table.nodeAt(cellPos);
            const rect = map.findCell(cellPos);
            const w = (cell?.attrs.colwidth as number[] | null)?.[drag.col - rect.left];
            if (w) draggedPx = w;
          }
          if (draggedPx != null) {
            const percents = percentsAfterDrag(drag.base, drag.col, draggedPx, drag.tableWidth);
            drag = null;
            const tr = applyColumnPercents(newState.tr, tablePos, table, percents);
            return tr.docChanged ? tr : null;
          }
        }
      }

      // 2) Sütun ekle/sil/birleştir sonrası yüzdeleri tamamla
      return normalizePercentTables(newState);
    },

    props: {
      decorations(state) {
        const ctx = findTableContext(state);
        if (!ctx || !isBorderlessTableNode(ctx.node)) return null;
        return DecorationSet.create(state.doc, [
          Decoration.node(ctx.pos, ctx.pos + ctx.node.nodeSize, {
            class: 'layout-table-active',
          }),
        ]);
      },
    },
  });
}

/** Çizgisiz düzen tablosunda Tab son hücrede satır eklemesin */
export function isInBorderlessTable(state: EditorState): boolean {
  const ctx = findTableContext(state);
  return !!ctx && isBorderlessTableNode(ctx.node);
}
