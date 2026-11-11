import {
  Children,
  Fragment,
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
  type TableHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { useTableLayoutStore } from '../store/tableLayoutStore';
import {
  buildColumnIds,
  clampColumnWidth,
  isIdentityOrder,
  resolveColumnOrder,
} from '../utils/tableLayout';

/** Sütun sınırına bu kadar piksel yakınlıkta imleç "genişlik ayarı" moduna geçer. */
const EDGE_HIT_PX = 5;
/** Henüz ölçülmemiş (sonradan görünen) sütun için varsayılan genişlik. */
const FALLBACK_WIDTH_PX = 110;
/** Çift tıklamada içeriğe sığdırırken taranacak en fazla satır. */
const AUTOFIT_ROW_LIMIT = 400;

type AnyElement = ReactElement<Record<string, unknown> & { children?: ReactNode }>;

export type DataTableProps = TableHTMLAttributes<HTMLTableElement> & {
  /**
   * Sütun düzeninin saklandığı kalıcı kimlik. Aynı kimliği paylaşan tablolar
   * (ör. her satırın içindeki alt tablolar) aynı düzeni kullanır.
   */
  tableId: string;
};

// ---------------------------------------------------------------------------
// React ağacı yardımcıları
// ---------------------------------------------------------------------------

function isIntrinsic(el: AnyElement, tag: string): boolean {
  return el.type === tag;
}

/** Fragment'ları açarak elemanları düzleştirir; özel bileşen görürse `null` döner. */
function flattenIntrinsic(children: ReactNode, keyPrefix = ''): AnyElement[] | null {
  const out: AnyElement[] = [];
  for (const child of Children.toArray(children)) {
    if (!isValidElement(child)) {
      if (typeof child === 'string' && child.trim() === '') continue;
      if (typeof child === 'string' || typeof child === 'number') return null;
      continue;
    }
    const el = child as AnyElement;
    if (el.type === Fragment) {
      const inner = flattenIntrinsic(el.props.children, `${keyPrefix}${String(el.key)}/`);
      if (!inner) return null;
      out.push(...inner);
      continue;
    }
    if (typeof el.type !== 'string') return null;
    out.push(keyPrefix ? cloneElement(el, { key: `${keyPrefix}${String(el.key)}` }) : el);
  }
  return out;
}

function nodeText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join(' ');
  if (isValidElement(node)) return nodeText((node as AnyElement).props.children);
  return '';
}

function cellSpan(el: AnyElement): number {
  const span = Number(el.props.colSpan ?? 1);
  return Number.isFinite(span) && span > 0 ? span : 1;
}

/** Gövde satırları sütun sırası değiştirilerek güvenle yeniden dizilebilir mi? */
function rowsPermutable(children: ReactNode, columnCount: number): boolean {
  for (const child of Children.toArray(children)) {
    if (!isValidElement(child)) continue;
    const el = child as AnyElement;
    if (el.type === Fragment) {
      if (!rowsPermutable(el.props.children, columnCount)) return false;
      continue;
    }
    if (!isIntrinsic(el, 'tr')) return false;
    const cells = flattenIntrinsic(el.props.children);
    if (!cells) return false;
    if (cells.length <= 1) continue; // boş / tam genişlik satırı (colSpan)
    if (cells.length !== columnCount || cells.some((c) => cellSpan(c) !== 1)) return false;
  }
  return true;
}

function permuteRows(children: ReactNode, perm: number[]): ReactNode {
  return Children.map(children, (child) => {
    if (!isValidElement(child)) return child;
    const el = child as AnyElement;
    if (el.type === Fragment) return cloneElement(el, {}, permuteRows(el.props.children, perm));
    if (!isIntrinsic(el, 'tr')) return el;
    const cells = flattenIntrinsic(el.props.children);
    if (!cells || cells.length !== perm.length) return el;
    return cloneElement(el, {}, perm.map((i) => cells[i]));
  });
}

// ---------------------------------------------------------------------------
// DOM yardımcıları
// ---------------------------------------------------------------------------

function headerCellsOf(table: HTMLTableElement | null): HTMLTableCellElement[] {
  const head = table?.tHead;
  if (!head || head.rows.length === 0) return [];
  return Array.from(head.rows[head.rows.length - 1].cells);
}

function scrollParentOf(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
    node = node.parentElement;
  }
  return null;
}

/** Kılavuz çizginin dikey sınırları: başlık üstünden tablonun görünen altına kadar. */
function guideVerticalBounds(table: HTMLTableElement) {
  const rect = table.getBoundingClientRect();
  const headRect = table.tHead?.getBoundingClientRect();
  const scroller = scrollParentOf(table);
  const scrollRect = scroller?.getBoundingClientRect();
  const top = Math.max(headRect?.top ?? rect.top, scrollRect?.top ?? -Infinity, 0);
  const bottom = Math.min(rect.bottom, scrollRect?.bottom ?? Infinity, window.innerHeight);
  return { top, height: Math.max(0, bottom - top) };
}

// ---------------------------------------------------------------------------
// Bileşen
// ---------------------------------------------------------------------------

/**
 * `<table>` yerine kullanılır. Başlık satırını okuyarak her sütuna şunları ekler:
 * - Başlığı sürükleyip başka bir başlığın önüne/arkasına bırakarak sütunu taşıma
 * - Tablonun herhangi bir satırında iki sütun arasındaki çizgiden tutup genişlik ayarlama
 * - Çizgiye çift tıklayarak sütunu içeriğine sığdırma
 * - Başlığa sağ tıklayıp düzeni varsayılana döndürme
 * Tercihler `tableId` ile kalıcı saklanır.
 */
export default function DataTable({ tableId, children, style, className, ...rest }: DataTableProps) {
  const layout = useTableLayoutStore((s) => s.layouts[tableId]);
  const setColumnWidths = useTableLayoutStore((s) => s.setColumnWidths);
  const moveColumn = useTableLayoutStore((s) => s.moveColumn);
  const resetTable = useTableLayoutStore((s) => s.resetTable);

  const tableRef = useRef<HTMLTableElement>(null);
  const guideRef = useRef<HTMLDivElement | null>(null);
  const resizingRef = useRef(false);
  const suppressClickRef = useRef(false);
  const dragIdRef = useRef<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  // --- Başlık çözümleme -----------------------------------------------------
  const sections = Children.toArray(children);
  const theadIndex = sections.findIndex((s) => isValidElement(s) && (s as AnyElement).type === 'thead');
  const thead = theadIndex >= 0 ? (sections[theadIndex] as AnyElement) : null;
  const headRows = thead ? flattenIntrinsic(thead.props.children) : null;
  const headRow =
    headRows && headRows.length === 1 && isIntrinsic(headRows[0], 'tr') ? headRows[0] : null;
  const rawHeaderCells = headRow ? flattenIntrinsic(headRow.props.children) : null;
  const enabled =
    !!rawHeaderCells &&
    rawHeaderCells.length > 1 &&
    rawHeaderCells.every((c) => (isIntrinsic(c, 'th') || isIntrinsic(c, 'td')) && cellSpan(c) === 1);

  const headerCells = enabled ? rawHeaderCells! : [];
  const ids = buildColumnIds(
    headerCells.map((c) => nodeText(c.props.children) || String(c.props['aria-label'] ?? ''))
  );

  // Gövde satırları sütun sırasına göre güvenle yeniden dizilebiliyor mu? (aksi halde taşıma kapalı)
  const canReorder =
    enabled &&
    sections.every((s) => {
      if (!isValidElement(s)) return true;
      const el = s as AnyElement;
      if (el.type === 'tbody' || el.type === 'tfoot') return rowsPermutable(el.props.children, ids.length);
      return true;
    });

  let displayIds = ids;
  let perm = ids.map((_, i) => i);
  if (canReorder && layout?.order.length) {
    const resolved = resolveColumnOrder(ids, layout.order);
    if (!isIdentityOrder(ids, resolved)) {
      displayIds = resolved;
      perm = resolved.map((id) => ids.indexOf(id));
    }
  }
  const reordered = perm.some((p, i) => p !== i);

  const widths = layout?.widths ?? {};
  const customWidths = enabled && displayIds.some((id) => widths[id] != null);
  const widthOf = (id: string) => widths[id] ?? FALLBACK_WIDTH_PX;
  const totalWidth = displayIds.reduce((sum, id) => sum + widthOf(id), 0);

  // --- Kılavuz çizgi (body'ye eklenen tek bir div, yeniden render gerektirmez) ---
  useEffect(() => {
    if (!enabled) return;
    const guide = document.createElement('div');
    guide.setAttribute('aria-hidden', 'true');
    guide.className = 'ct-guide';
    document.body.appendChild(guide);
    guideRef.current = guide;
    return () => {
      cleanupRef.current?.();
      guide.remove();
      guideRef.current = null;
    };
  }, [enabled]);

  const showGuide = (x: number, mode: 'hover' | 'active' | 'drop') => {
    const guide = guideRef.current;
    const table = tableRef.current;
    if (!guide || !table) return;
    const { top, height } = guideVerticalBounds(table);
    guide.style.left = `${Math.round(x) - (mode === 'drop' ? 1 : 0)}px`;
    guide.style.top = `${top}px`;
    guide.style.height = `${height}px`;
    guide.dataset.mode = mode;
    guide.style.display = 'block';
  };
  const hideGuide = () => {
    if (guideRef.current) guideRef.current.style.display = 'none';
  };

  // --- Genişlik ayarı (tablonun her yerinden) -------------------------------
  /** Fare bir sütunun sağ kenarına yakınsa o sütunun (ekrandaki) sırası. */
  const edgeAt = (clientX: number, clientY: number): { index: number; x: number } | null => {
    const table = tableRef.current;
    if (!table) return null;
    const rect = table.getBoundingClientRect();
    if (clientY < rect.top || clientY > rect.bottom) return null;
    const cells = headerCellsOf(table);
    for (let i = 0; i < cells.length; i++) {
      const right = cells[i].getBoundingClientRect().right;
      if (Math.abs(clientX - right) <= EDGE_HIT_PX) return { index: i, x: right };
    }
    return null;
  };

  const isOwnEvent = (target: EventTarget | null) =>
    target instanceof Element && target.closest('table') === tableRef.current;

  const measureAll = (): Record<string, number> => {
    const measured: Record<string, number> = {};
    headerCellsOf(tableRef.current).forEach((cell, i) => {
      const id = displayIds[i];
      if (id) measured[id] = cell.getBoundingClientRect().width;
    });
    return measured;
  };

  const startResize = (index: number, startX: number) => {
    const table = tableRef.current;
    const th = headerCellsOf(table)[index];
    const id = displayIds[index];
    if (!table || !th || !id) return;

    // İlk ayarda ekrandaki genişlikleri dondur (sabit piksel düzenine geç).
    const current: Record<string, number> = {};
    if (!customWidths) {
      Object.assign(current, measureAll());
      setColumnWidths(tableId, current);
    } else {
      for (const colId of displayIds) current[colId] = widthOf(colId);
    }
    const startWidth = current[id] ?? th.getBoundingClientRect().width;
    const othersWidth = displayIds.reduce((sum, colId) => sum + (colId === id ? 0 : current[colId] ?? 0), 0);
    const leftEdge = th.getBoundingClientRect().left;
    let next = clampColumnWidth(startWidth);

    resizingRef.current = true;
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    showGuide(leftEdge + startWidth, 'active');

    // Sürüklerken React'i yeniden çizdirmemek için DOM doğrudan güncellenir.
    const onMove = (e: MouseEvent) => {
      next = clampColumnWidth(startWidth + (e.clientX - startX));
      th.style.width = `${next}px`;
      table.style.width = `${othersWidth + next}px`;
      table.style.tableLayout = 'fixed';
      table.style.minWidth = '0';
      showGuide(th.getBoundingClientRect().right, 'active');
    };
    const finish = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', finish);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
      cleanupRef.current = null;
      resizingRef.current = false;
      hideGuide();
      // mouseup'ın hemen ardından gelen tıklama (varsa) yutulur; gelmezse bayrak temizlenir.
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
      setColumnWidths(tableId, { [id]: next });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', finish);
    cleanupRef.current = finish;
  };

  const autoFit = (index: number) => {
    const table = tableRef.current;
    const th = headerCellsOf(table)[index];
    const id = displayIds[index];
    if (!table || !th || !id) return;
    const overflowOf = (cell: Element) => {
      let extra = 0;
      for (const node of [cell, ...Array.from(cell.querySelectorAll('*'))]) {
        const el = node as HTMLElement;
        extra = Math.max(extra, el.scrollWidth - el.clientWidth);
      }
      return extra;
    };
    let needed = th.getBoundingClientRect().width + overflowOf(th);
    const rows = Array.from(table.tBodies)
      .flatMap((body) => Array.from(body.rows))
      .slice(0, AUTOFIT_ROW_LIMIT);
    for (const row of rows) {
      if (row.cells.length !== displayIds.length) continue;
      const cell = row.cells[index];
      if (cell) needed = Math.max(needed, cell.getBoundingClientRect().width + overflowOf(cell));
    }
    setColumnWidths(tableId, { ...(customWidths ? {} : measureAll()), [id]: Math.ceil(needed) + 2 });
  };

  const tableHandlers = enabled
    ? {
        onMouseMove: (e: ReactMouseEvent<HTMLTableElement>) => {
          if (resizingRef.current || dragIdRef.current) return;
          const table = tableRef.current;
          if (!table) return;
          const edge = isOwnEvent(e.target) ? edgeAt(e.clientX, e.clientY) : null;
          if (edge) {
            table.dataset.ctEdge = '1';
            showGuide(edge.x, 'hover');
          } else if (table.dataset.ctEdge) {
            delete table.dataset.ctEdge;
            hideGuide();
          }
        },
        onMouseLeave: () => {
          if (resizingRef.current) return;
          if (tableRef.current) delete tableRef.current.dataset.ctEdge;
          hideGuide();
        },
        onMouseDownCapture: (e: ReactMouseEvent<HTMLTableElement>) => {
          if (e.button !== 0 || !isOwnEvent(e.target)) return;
          const edge = edgeAt(e.clientX, e.clientY);
          if (!edge) return;
          e.preventDefault();
          e.stopPropagation();
          suppressClickRef.current = true;
          startResize(edge.index, e.clientX);
        },
        onClickCapture: (e: ReactMouseEvent<HTMLTableElement>) => {
          if (!suppressClickRef.current) return;
          suppressClickRef.current = false;
          e.preventDefault();
          e.stopPropagation();
        },
        onDoubleClickCapture: (e: ReactMouseEvent<HTMLTableElement>) => {
          if (!isOwnEvent(e.target)) return;
          const edge = edgeAt(e.clientX, e.clientY);
          if (!edge) return;
          e.preventDefault();
          e.stopPropagation();
          autoFit(edge.index);
        },
      }
    : {};

  // --- Sütun taşıma (başlığı sürükle-bırak) ---------------------------------
  const placementFor = (th: HTMLElement, clientX: number): 'before' | 'after' => {
    const rect = th.getBoundingClientRect();
    return clientX < rect.left + rect.width / 2 ? 'before' : 'after';
  };

  const endDrag = (th?: HTMLElement | null) => {
    headerCellsOf(tableRef.current).forEach((cell) => (cell.style.opacity = ''));
    if (th) th.style.opacity = '';
    dragIdRef.current = null;
    hideGuide();
  };

  const compose =
    <E,>(own: (e: E) => void, original: unknown) =>
    (e: E) => {
      own(e);
      if (typeof original === 'function') (original as (e: E) => void)(e);
    };

  const decorateHeader = (cell: AnyElement, id: string): AnyElement => {
    const p = cell.props;
    const width = customWidths ? widthOf(id) : null;
    const cellStyle = (p.style ?? undefined) as CSSProperties | undefined;
    return cloneElement(cell, {
      key: `ct:${id}`,
      'data-ct-col': id,
      className: `${(p.className as string | undefined) ?? ''} ct-th${canReorder ? '' : ' ct-th-static'}`,
      style: width != null ? { ...cellStyle, width: `${width}px` } : cellStyle,
      draggable: canReorder,
      onDragStart: compose((e: DragEvent<HTMLElement>) => {
        if (resizingRef.current || !canReorder) {
          e.preventDefault();
          return;
        }
        dragIdRef.current = id;
        hideGuide();
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);
        const th = e.currentTarget;
        requestAnimationFrame(() => {
          if (dragIdRef.current === id) th.style.opacity = '0.45';
        });
      }, p.onDragStart),
      onDragOver: compose((e: DragEvent<HTMLElement>) => {
        if (!dragIdRef.current) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragIdRef.current === id) {
          hideGuide();
          return;
        }
        const rect = e.currentTarget.getBoundingClientRect();
        showGuide(placementFor(e.currentTarget, e.clientX) === 'before' ? rect.left : rect.right, 'drop');
      }, p.onDragOver),
      onDrop: compose((e: DragEvent<HTMLElement>) => {
        const source = dragIdRef.current;
        if (!source) return;
        e.preventDefault();
        if (source !== id) {
          moveColumn(tableId, displayIds, source, id, placementFor(e.currentTarget, e.clientX));
        }
        endDrag(e.currentTarget);
      }, p.onDrop),
      onDragEnd: compose((e: DragEvent<HTMLElement>) => endDrag(e.currentTarget), p.onDragEnd),
      onContextMenu: compose((e: ReactMouseEvent<HTMLElement>) => {
        if (!layout) return;
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }, p.onContextMenu),
    });
  };

  // --- Yeniden kurulan çocuklar --------------------------------------------
  let content: ReactNode = children;
  if (enabled && thead && headRow) {
    const newHeadRow = cloneElement(
      headRow,
      {},
      perm.map((i) => decorateHeader(headerCells[i], ids[i]))
    );
    content = sections.map((section, idx) => {
      if (idx === theadIndex) return cloneElement(thead, {}, newHeadRow);
      if (!reordered || !isValidElement(section)) return section;
      const el = section as AnyElement;
      if (el.type === 'tbody' || el.type === 'tfoot') {
        return cloneElement(el, {}, permuteRows(el.props.children, perm));
      }
      return section;
    });
  }

  const tableStyle: CSSProperties | undefined = customWidths
    ? { ...style, tableLayout: 'fixed', width: `${totalWidth}px`, minWidth: 0, maxWidth: 'none' }
    : style;

  // Menü dışına tıklanınca / Esc ile kapat
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  return (
    <>
      <table
        {...rest}
        ref={tableRef}
        className={`${className ?? ''}${enabled ? ' ct-table' : ''}${customWidths ? ' ct-custom' : ''}`}
        style={tableStyle}
        {...tableHandlers}
      >
        {content}
      </table>
      {menu
        ? createPortal(
            <div
              className="ct-menu"
              style={{ left: menu.x, top: menu.y }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => {
                  resetTable(tableId);
                  setMenu(null);
                }}
              >
                Sütun düzenini sıfırla
              </button>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
