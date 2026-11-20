/**
 * Uygulama genelinde tablolarda ok tuşlarıyla gezinme (Excel benzeri).
 *
 * Tek bir document dinleyicisi ile çalışır; tablo bileşenlerinin ayrıca bir şey yapması gerekmez.
 *
 * İki kip vardır:
 * - Düzenleme kipi: odak bir hücre içindeki form alanında (input/select/textarea).
 *   ↑/↓ aynı sütundaki bir sonraki/önceki satırın alanına (alanı olmayan satırlar atlanır),
 *   ←/→ aynı satırdaki önceki/sonraki alana geçer. Metin kutusunda imleç metnin ortasındaysa
 *   ←/→ imleci oynatır; metin tamamen seçili veya imleç kenardaysa hücre değiştirir.
 * - Hücre kipi: odak hücrenin kendisinde (salt okunur listeler). Oklar hücreden hücreye gider,
 *   Enter satıra tıklar (detayı açar), Menü tuşu / Shift+F10 sağ tık menüsünü açar.
 *
 * Bileşenin kendi ok işleyicisi varsa (preventDefault çağırıyorsa) ona karışılmaz.
 * Bir bölgede kapatmak için: data-arrow-nav="off".
 */

const CONTROL_SELECTOR =
  'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])';

/** Bu tiplerde imleç konumu okunamaz / anlamsız; oklar her zaman hücre değiştirir */
const CARETLESS_INPUT_TYPES = new Set([
  'number',
  'checkbox',
  'radio',
  'range',
  'color',
  'file',
  'button',
  'submit',
  'reset',
  'image',
]);

/** Tarih/saat: ←/→ alt alanlar (gün/ay/yıl) arasında gezinir, onlara dokunulmaz */
const SEGMENTED_INPUT_TYPES = new Set(['date', 'time', 'datetime-local', 'month', 'week']);

type Direction = 'up' | 'down' | 'left' | 'right';

const KEY_TO_DIRECTION: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

function isVisible(el: HTMLElement): boolean {
  return el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
}

function controlsIn(root: Element): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(CONTROL_SELECTOR)).filter(
    (el) => el.closest('td, th') !== null && isVisible(el)
  );
}

/** Hücrenin doğrudan sahibi olan satır ve tablo (iç içe tablolarda en yakın olan) */
function cellContext(cell: HTMLTableCellElement) {
  const row = cell.parentElement as HTMLTableRowElement | null;
  if (!row || row.tagName !== 'TR') return null;
  const section = row.parentElement;
  const table = section?.closest('table');
  if (!table || !section || section.tagName !== 'TBODY') return null;
  return { row, table };
}

/** Tablonun gövde satırları (iç içe tabloların satırları hariç) */
function bodyRows(table: HTMLTableElement): HTMLTableRowElement[] {
  const rows: HTMLTableRowElement[] = [];
  for (const body of Array.from(table.tBodies)) {
    for (const r of Array.from(body.rows)) {
      if (isVisible(r)) rows.push(r);
    }
  }
  return rows;
}

/** Hücrenin görsel sütun başlangıcı (colSpan hesaba katılarak) */
function visualColumn(cell: HTMLTableCellElement): number {
  let col = 0;
  let prev = cell.previousElementSibling;
  while (prev) {
    if (prev instanceof HTMLTableCellElement) col += prev.colSpan || 1;
    prev = prev.previousElementSibling;
  }
  return col;
}

function cellAtColumn(row: HTMLTableRowElement, col: number): HTMLTableCellElement | null {
  let start = 0;
  for (const cell of Array.from(row.cells)) {
    const span = cell.colSpan || 1;
    if (col >= start && col < start + span) return cell;
    start += span;
  }
  return null;
}

/** Hücreye ait (iç içe tablo hücrelerine ait olmayan) alanlar */
function ownControls(cell: HTMLTableCellElement): HTMLElement[] {
  return controlsIn(cell).filter((el) => el.closest('td, th') === cell);
}

function rowControls(row: HTMLTableRowElement): HTMLElement[] {
  return controlsIn(row).filter((el) => el.closest('tr') === row);
}

function focusControl(el: HTMLElement) {
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  if (el instanceof HTMLInputElement && !CARETLESS_INPUT_TYPES.has(el.type)) {
    try {
      el.select();
    } catch {
      /* bazı tiplerde select() desteklenmez */
    }
  } else if (el instanceof HTMLInputElement && el.type === 'number') {
    el.select();
  } else if (el instanceof HTMLTextAreaElement) {
    el.select();
  }
}

const MANAGED_ATTR = 'data-nav-cell';

/** Hücreyi odaklanabilir yapar (yalnızca uygulamanın kendi tabindex vermediği hücreler) */
function makeCellFocusable(cell: HTMLTableCellElement, tabIndex: 0 | -1 = -1) {
  if (cell.hasAttribute('tabindex') && !cell.hasAttribute(MANAGED_ATTR)) return;
  cell.setAttribute(MANAGED_ATTR, '1');
  cell.tabIndex = tabIndex;
}

function focusCell(cell: HTMLTableCellElement, from?: HTMLTableCellElement | null) {
  // Hücrede alan varsa doğrudan alana geç (düzenleme kipi)
  const controls = ownControls(cell);
  if (controls.length > 0) {
    focusControl(controls[0]);
    return;
  }
  // Gezici tabindex: Tab ile tabloya dönüldüğünde son hücreye gelinsin
  const table = cell.closest('table');
  if (table) {
    table.querySelectorAll<HTMLElement>(`[${MANAGED_ATTR}][tabindex="0"]`).forEach((c) => {
      if (c !== cell) c.tabIndex = -1;
    });
  }
  if (from && from !== cell && from.hasAttribute(MANAGED_ATTR)) from.tabIndex = -1;
  makeCellFocusable(cell, 0);
  cell.focus({ preventScroll: true });
  cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/** Metin alanında ok tuşu imleci mi oynatmalı (true) yoksa hücre mi değiştirmeli (false)? */
function caretConsumesKey(el: HTMLElement, dir: Direction): boolean {
  if (el instanceof HTMLSelectElement) return false;
  if (el instanceof HTMLInputElement) {
    if (CARETLESS_INPUT_TYPES.has(el.type)) return false;
    if (SEGMENTED_INPUT_TYPES.has(el.type)) return dir === 'left' || dir === 'right';
  }
  if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return false;

  let start: number | null = null;
  let end: number | null = null;
  try {
    start = el.selectionStart;
    end = el.selectionEnd;
  } catch {
    return false;
  }
  if (start == null || end == null) return false;
  const len = el.value.length;
  const allSelected = start === 0 && end === len;

  if (el instanceof HTMLTextAreaElement) {
    if (allSelected) return false;
    if (dir === 'up') return el.value.slice(0, start).includes('\n');
    if (dir === 'down') return el.value.slice(end).includes('\n');
  } else if (dir === 'up' || dir === 'down') {
    return false;
  }

  if (allSelected) return false;
  if (dir === 'left') return !(start === 0 && end === 0);
  return !(start === len && end === len);
}

function navigateFromControl(control: HTMLElement, dir: Direction): boolean {
  const cell = control.closest<HTMLTableCellElement>('td, th');
  if (!cell) return false;
  const ctx = cellContext(cell);
  if (!ctx) return false;
  const { row, table } = ctx;

  if (dir === 'left' || dir === 'right') {
    const list = rowControls(row);
    const idx = list.indexOf(control);
    if (idx < 0) return false;
    const next = list[idx + (dir === 'right' ? 1 : -1)];
    if (!next) return true; // satır sonu: yerinde kal, ama imleci de oynatma
    focusControl(next);
    return true;
  }

  const rows = bodyRows(table);
  let rIdx = rows.indexOf(row);
  if (rIdx < 0) return false;
  const col = visualColumn(cell);
  const indexInCell = Math.max(0, ownControls(cell).indexOf(control));
  const step = dir === 'down' ? 1 : -1;
  for (rIdx += step; rIdx >= 0 && rIdx < rows.length; rIdx += step) {
    const target = cellAtColumn(rows[rIdx], col);
    if (!target) continue;
    const controls = ownControls(target);
    if (controls.length === 0) continue; // bu sütunda alanı olmayan satırı atla
    focusControl(controls[Math.min(indexInCell, controls.length - 1)]);
    return true;
  }
  return true; // tablonun ucu: yerinde kal (number alanı değer değiştirmesin)
}

function navigateFromCell(cell: HTMLTableCellElement, dir: Direction): boolean {
  const ctx = cellContext(cell);
  if (!ctx) return false;
  const { row, table } = ctx;

  if (dir === 'left' || dir === 'right') {
    const cells = Array.from(row.cells).filter(isVisible);
    const idx = cells.indexOf(cell);
    const next = cells[idx + (dir === 'right' ? 1 : -1)];
    if (next) focusCell(next, cell);
    return true;
  }

  const rows = bodyRows(table);
  const rIdx = rows.indexOf(row);
  const col = visualColumn(cell);
  const step = dir === 'down' ? 1 : -1;
  for (let i = rIdx + step; i >= 0 && i < rows.length; i += step) {
    const target = cellAtColumn(rows[i], col);
    if (target && isVisible(target)) {
      focusCell(target, cell);
      return true;
    }
  }
  return true;
}

function isEditableHost(el: HTMLElement): boolean {
  return el.isContentEditable || el.closest('[contenteditable="true"]') !== null;
}

/**
 * Keydown olayını işler. Gezinme yaptıysa true döner (olay tüketildi).
 * Bileşenler kendi işleyicilerinde preventDefault çağırdıysa hiçbir şey yapmaz.
 */
export function handleTableKeyboardNav(e: KeyboardEvent): boolean {
  if (e.defaultPrevented || e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return false;
  const target = e.target;
  if (!(target instanceof HTMLElement)) return false;
  if (isEditableHost(target)) return false;
  if (target.closest('[data-arrow-nav="off"]')) return false;

  // Hücre kipi: Enter → satıra tıkla, Menü/Shift+F10 → sağ tık menüsü
  if (target instanceof HTMLTableCellElement && cellContext(target)) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      target.click();
      return true;
    }
    if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      e.preventDefault();
      const rect = target.getBoundingClientRect();
      target.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + Math.min(24, rect.width / 2),
          clientY: rect.top + rect.height / 2,
          button: 2,
        })
      );
      return true;
    }
  }

  const dir = KEY_TO_DIRECTION[e.key];
  if (!dir || e.shiftKey) return false;

  if (target instanceof HTMLTableCellElement) {
    if (!cellContext(target)) return false;
    const handled = navigateFromCell(target, dir);
    if (handled) e.preventDefault();
    return handled;
  }

  if (!target.matches(CONTROL_SELECTOR)) return false;
  // Açık açılır liste / otomatik tamamlama okları kendisi kullanır
  if (target.getAttribute('aria-expanded') === 'true') return false;
  // Arama kutuları (combobox) ↑/↓ ile kendi listelerini açar
  if (target.getAttribute('role') === 'combobox' && (dir === 'up' || dir === 'down')) return false;
  if (caretConsumesKey(target, dir)) return false;

  const handled = navigateFromControl(target, dir);
  if (handled) e.preventDefault();
  return handled;
}

/**
 * Fareyle salt okunur bir hücreye tıklanınca hücre odak alsın; böylece oklarla devam edilebilir.
 * Alan, düğme, bağlantı vb. üzerine tıklamalara dokunulmaz.
 */
export function handleTableMouseDown(e: MouseEvent) {
  if (e.defaultPrevented || e.button !== 0) return;
  const target = e.target;
  if (!(target instanceof Element)) return;
  if (target.closest('[data-arrow-nav="off"]')) return;
  const cell = target.closest<HTMLTableCellElement>('td');
  if (!cell || !cellContext(cell)) return;
  // Hücre içindeki etkileşimli öğeye tıklandıysa (alan, düğme, bağlantı…) dokunma.
  // Hücrenin dışındaki atalar (ör. tabindex'li modal kabı) bu kontrole girmez.
  const interactive = target.closest(
    'input, select, textarea, button, a[href], label, [tabindex], [contenteditable="true"]'
  );
  if (interactive && interactive !== cell && cell.contains(interactive)) return;
  makeCellFocusable(cell, -1);
}

/**
 * Klavyeyle tabloya girilebilsin diye gövdedeki ilk hücreyi Tab sırasına ekler
 * (tabloda düzenlenebilir alan yoksa; alanlı tablolarda alanlar zaten Tab sırasında).
 */
export function ensureTableEntryPoint(table: HTMLTableElement) {
  if (table.querySelector(`[${MANAGED_ATTR}][tabindex="0"]`)) return;
  const body = table.tBodies[0];
  if (!body || body.querySelector(CONTROL_SELECTOR)) return;
  const firstRow = Array.from(body.rows).find((r) => r.cells.length > 1);
  const firstCell = firstRow?.cells[0];
  if (firstCell) makeCellFocusable(firstCell, 0);
}
