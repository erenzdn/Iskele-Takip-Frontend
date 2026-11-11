import { create } from 'zustand';
import {
  applyColumnMove,
  clampColumnWidth,
  sanitizeTableLayout,
  type TableLayout,
} from '../utils/tableLayout';

const STORAGE_KEY = 'ui_table_layouts';

function readPersisted(): Record<string, TableLayout> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const result: Record<string, TableLayout> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      const layout = sanitizeTableLayout(value);
      if (layout) result[id] = layout;
    }
    return result;
  } catch {
    return {};
  }
}

function persist(layouts: Record<string, TableLayout>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts));
  } catch {
    // localStorage erişimi engellenirse sessizce devam et
  }
}

interface TableLayoutState {
  layouts: Record<string, TableLayout>;
  /** Birden çok sütunun piksel genişliğini birlikte yazar. */
  setColumnWidths: (tableId: string, widths: Record<string, number>) => void;
  moveColumn: (
    tableId: string,
    displayedIds: string[],
    source: string,
    target: string,
    placement: 'before' | 'after'
  ) => void;
  resetTable: (tableId: string) => void;
}

export const useTableLayoutStore = create<TableLayoutState>((set, get) => {
  const update = (tableId: string, next: TableLayout | null) => {
    const layouts = { ...get().layouts };
    if (next && (next.order.length > 0 || Object.keys(next.widths).length > 0)) layouts[tableId] = next;
    else delete layouts[tableId];
    set({ layouts });
    persist(layouts);
  };

  return {
    layouts: readPersisted(),
    setColumnWidths: (tableId, widths) => {
      const current = get().layouts[tableId] ?? { order: [], widths: {} };
      const nextWidths = { ...current.widths };
      let changed = false;
      for (const [id, px] of Object.entries(widths)) {
        const clamped = clampColumnWidth(px);
        if (nextWidths[id] !== clamped) {
          nextWidths[id] = clamped;
          changed = true;
        }
      }
      if (changed) update(tableId, { ...current, widths: nextWidths });
    },
    moveColumn: (tableId, displayedIds, source, target, placement) => {
      const current = get().layouts[tableId] ?? { order: [], widths: {} };
      const order = applyColumnMove(current.order, displayedIds, source, target, placement);
      if (order.join('\u0000') !== current.order.join('\u0000')) update(tableId, { ...current, order });
    },
    resetTable: (tableId) => {
      if (get().layouts[tableId]) update(tableId, null);
    },
  };
});
