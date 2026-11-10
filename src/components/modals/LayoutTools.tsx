import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import type { Editor } from '@tiptap/react';
import { CellSelection } from '@tiptap/pm/tables';
import {
  AlignBottomIcon,
  AlignCenterVerticalIcon,
  AlignTopIcon,
  ArrowLineDownIcon,
  ArrowLineLeftIcon,
  ArrowLineRightIcon,
  ArrowLineUpIcon,
  CaretDownIcon,
  ColumnsIcon,
  ColumnsPlusLeftIcon,
  ColumnsPlusRightIcon,
  LayoutIcon,
  MinusIcon,
  RowsIcon,
  RowsPlusBottomIcon,
  RowsPlusTopIcon,
  SquareSplitVerticalIcon,
  TextAlignCenterIcon,
  TextAlignLeftIcon,
  TextAlignRightIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import type { TemplateImage } from '../../models';
import { toggleTableNoBorder } from './CustomTableExtensions';
import {
  findTableContext,
  focusColumn,
  getDisplayPercents,
  getFirstCellStyle,
  getSelectedCellStyle,
  hasPercentColumns,
  insertParagraphAroundTable,
  insertTableBlock,
  isBorderlessTableNode,
  moveColumn,
  resizeColumn,
  setAllCellsStyle,
  setColumnPercents,
  setSelectedCellStyle,
  unwrapTable,
} from './LayoutTable';
import {
  COLUMN_PRESETS,
  HEADER_PRESETS,
  buildDataTable,
  widthPresetsFor,
  type LayoutPreset,
  type PresetCellKind,
} from './LayoutPresets';

// ---------------------------------------------------------------------------
// Ortak araç çubuğu parçaları
// ---------------------------------------------------------------------------

export function ToolbarButton({
  title,
  active,
  disabled,
  onClick,
  children,
  danger,
}: {
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={[
        'inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-md px-2 text-xs font-medium transition-colors',
        'disabled:opacity-40 disabled:pointer-events-none',
        danger
          ? 'text-error hover:bg-error/10'
          : active
            ? 'bg-primary/15 text-primary'
            : 'text-text-primary hover:bg-background-hover',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

export function ToolbarDivider() {
  return <div className="mx-0.5 h-5 w-px shrink-0 bg-background-border" />;
}

function ToolbarGroup({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center rounded-lg border border-background-border bg-background-surface/60 p-0.5">
      {children}
    </div>
  );
}

/** Dışarı tıklayınca / Esc ile kapanan açılır panel */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

// ---------------------------------------------------------------------------
// Küçük önizleme (thumbnail)
// ---------------------------------------------------------------------------

function CellSketch({ kind }: { kind: PresetCellKind }) {
  const line = (w: string, strong = false) => (
    <span
      className={`block h-[3px] rounded-full ${strong ? 'bg-text-primary/70' : 'bg-text-secondary/40'}`}
      style={{ width: w }}
    />
  );
  switch (kind) {
    case 'logo':
      return (
        <span className="flex h-full items-center">
          <span className="block h-5 w-5 rounded-[3px] border border-primary/50 bg-primary/20" />
        </span>
      );
    case 'title':
      return (
        <span className="flex h-full flex-col items-center justify-center gap-1">
          {line('80%', true)}
          {line('55%')}
          {line('45%')}
        </span>
      );
    case 'info':
      return (
        <span className="flex h-full flex-col items-end justify-center gap-1">
          {line('85%', true)}
          {line('70%')}
          {line('60%')}
        </span>
      );
    case 'company':
      return (
        <span className="flex h-full flex-col justify-center gap-1">
          <span className="block h-3 w-3 rounded-[2px] border border-primary/50 bg-primary/20" />
          {line('70%', true)}
          {line('55%')}
        </span>
      );
    case 'text':
      return (
        <span className="flex h-full flex-col justify-start gap-1 pt-0.5">
          {line('90%')}
          {line('75%')}
          {line('85%')}
          {line('60%')}
        </span>
      );
    default:
      return null;
  }
}

function PresetThumb({ preset }: { preset: LayoutPreset }) {
  const total = preset.widths.reduce((a, b) => a + b, 0);
  return (
    <span className="flex h-12 w-full gap-[3px] rounded-md border border-background-border bg-white/90 p-1.5 dark:bg-white/[0.06]">
      {preset.widths.map((w, i) => (
        <span
          key={i}
          className="min-w-0 rounded-[3px] border border-dashed border-text-secondary/30 px-1"
          style={{ flexBasis: `${(w / total) * 100}%`, flexGrow: 0, flexShrink: 0 }}
        >
          <CellSketch kind={preset.cells[i]} />
        </span>
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Düzen ekleme menüsü
// ---------------------------------------------------------------------------

const GRID_ROWS = 8;
const GRID_COLS = 8;

export function LayoutInsertMenu({
  editor,
  images,
  documentNumberKey,
  documentNumberLabel,
  onInsertImage,
}: {
  editor: Editor;
  images: TemplateImage[];
  documentNumberKey: string;
  documentNumberLabel: string;
  onInsertImage: (imageId: number) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [logoId, setLogoId] = useState<number | ''>('');
  const [hover, setHover] = useState<{ rows: number; cols: number } | null>(null);
  const close = () => {
    setOpen(false);
    setHover(null);
  };
  const ref = useDismiss(open, close);

  // Kayıtlı görsel varsa logo seçimi varsayılan olarak ilk görsel
  useEffect(() => {
    if (logoId === '' && images.length > 0) setLogoId(images[0].ImageId);
    if (logoId !== '' && !images.some((img) => img.ImageId === logoId)) {
      setLogoId(images[0]?.ImageId ?? '');
    }
  }, [images]);

  const insertPreset = async (preset: LayoutPreset) => {
    close();
    const json = preset.build({ documentNumberKey, documentNumberLabel });
    const tablePos = insertTableBlock(editor, json, preset.logoCell ?? 0);
    if (tablePos != null && preset.logoCell != null && logoId !== '') {
      await onInsertImage(logoId);
    }
  };

  const insertDataTable = (rows: number, cols: number) => {
    close();
    insertTableBlock(editor, buildDataTable(rows, cols), 0);
  };

  const presetButton = (preset: LayoutPreset) => (
    <button
      key={preset.id}
      type="button"
      onClick={() => void insertPreset(preset)}
      title={preset.description}
      className="group flex flex-col gap-1.5 rounded-lg border border-transparent p-1.5 text-left transition-colors hover:border-primary/30 hover:bg-primary/5"
    >
      <PresetThumb preset={preset} />
      <span className="truncate text-[11px] font-medium text-text-primary group-hover:text-primary">
        {preset.label}
      </span>
    </button>
  );

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors',
          open
            ? 'border-primary/40 bg-primary/10 text-primary'
            : 'border-background-border bg-background-surface/60 text-text-primary hover:bg-background-hover',
        ].join(' ')}
        title="Sayfa düzeni, sütun ya da tablo ekle"
        aria-expanded={open}
      >
        <LayoutIcon size={15} />
        Düzen
        <CaretDownIcon size={12} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-[60] mt-1.5 w-[440px] max-w-[calc(100vw-24px)] rounded-xl border border-background-border bg-background-panel p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
              Sayfa başı (logo + başlık)
            </p>
            {images.length > 0 && (
              <label className="flex items-center gap-1.5 text-[11px] text-text-secondary">
                Logo
                <select
                  value={logoId}
                  onChange={(e) => setLogoId(e.target.value ? Number(e.target.value) : '')}
                  className="h-7 max-w-[150px] rounded-md border border-background-border bg-background-surface px-1.5 text-[11px] text-text-primary outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="">Logo ekleme</option>
                  {images.map((img) => (
                    <option key={img.ImageId} value={img.ImageId}>
                      {img.FileName}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1">{HEADER_PRESETS.map(presetButton)}</div>

          <p className="mb-2 mt-3 border-t border-background-border pt-3 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
            Sütunlar (çizgisiz)
          </p>
          <div className="grid grid-cols-5 gap-1">{COLUMN_PRESETS.map(presetButton)}</div>

          <div className="mt-3 border-t border-background-border pt-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                Çizgili tablo
              </p>
              <span className="text-[11px] tabular-nums text-text-secondary">
                {hover ? `${hover.rows} satır × ${hover.cols} sütun` : 'Boyut seçin'}
              </span>
            </div>
            <div
              className="inline-grid gap-[3px]"
              style={{ gridTemplateColumns: `repeat(${GRID_COLS}, 18px)` }}
              onMouseLeave={() => setHover(null)}
            >
              {Array.from({ length: GRID_ROWS * GRID_COLS }, (_, i) => {
                const r = Math.floor(i / GRID_COLS) + 1;
                const c = (i % GRID_COLS) + 1;
                const on = hover && r <= hover.rows && c <= hover.cols;
                return (
                  <button
                    key={i}
                    type="button"
                    aria-label={`${r} satır × ${c} sütun tablo`}
                    onMouseEnter={() => setHover({ rows: r, cols: c })}
                    onFocus={() => setHover({ rows: r, cols: c })}
                    onClick={() => insertDataTable(r, c)}
                    className={[
                      'h-[18px] w-[18px] rounded-[3px] border transition-colors',
                      on
                        ? 'border-primary bg-primary/25'
                        : 'border-background-border bg-background-surface',
                    ].join(' ')}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sütun genişliği cetveli
// ---------------------------------------------------------------------------

function ColumnWidthRuler({
  percents,
  activeCol,
  onPreview,
  onCommit,
  onSelectColumn,
}: {
  percents: number[];
  activeCol: number;
  onPreview: (next: number[]) => void;
  onCommit: (base: number[], next: number[]) => void;
  onSelectColumn: (col: number) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ boundary: number; base: number[]; last: number[] } | null>(null);
  const [live, setLive] = useState<number[] | null>(null);
  const shown = live ?? percents;

  const onPointerDown = (boundary: number) => (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { boundary, base: percents, last: percents };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const bar = barRef.current;
    if (!drag || !bar) return;
    const rect = bar.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const leftStart = drag.base.slice(0, drag.boundary).reduce((a, b) => a + b, 0);
    let target = x - leftStart;
    // Shift basılı değilse tam yüzdeye yapış
    if (!e.shiftKey) target = Math.round(target);
    const next = resizeColumn(drag.base, drag.boundary, target);
    if (next.every((p, i) => p === drag.last[i])) return;
    drag.last = next;
    setLive(next);
    onPreview(next);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setLive(null);
    if (drag.last !== drag.base) onCommit(drag.base, drag.last);
  };

  let cumulative = 0;
  return (
    <div
      ref={barRef}
      className="relative flex h-8 w-[260px] shrink-0 select-none overflow-visible rounded-lg border border-background-border bg-background-surface/60"
      title="Sütun genişlikleri — ayraçları sürükleyin (Shift: ince ayar), sütuna tıklayıp seçin"
    >
      {shown.map((pct, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onSelectColumn(i)}
          className={[
            'flex min-w-0 items-center justify-center overflow-hidden text-[10px] font-semibold tabular-nums transition-colors',
            i > 0 ? 'border-l border-background-border' : '',
            i === activeCol
              ? 'bg-primary/15 text-primary'
              : 'text-text-secondary hover:bg-background-hover',
            i === 0 ? 'rounded-l-lg' : '',
            i === shown.length - 1 ? 'rounded-r-lg' : '',
          ].join(' ')}
          style={{ width: `${pct}%` }}
          title={`Sütun ${i + 1}: %${pct}`}
        >
          {pct >= 9 ? `%${Math.round(pct)}` : ''}
        </button>
      ))}
      {shown.slice(0, -1).map((pct, i) => {
        cumulative += pct;
        return (
          <div
            key={`h${i}`}
            role="separator"
            aria-orientation="vertical"
            aria-label={`Sütun ${i + 1} ve ${i + 2} arası ayraç`}
            onPointerDown={onPointerDown(i)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="group absolute -top-1 bottom-[-4px] z-10 flex w-3 -translate-x-1/2 cursor-col-resize justify-center"
            style={{ left: `${cumulative}%` }}
          >
            <span className="h-full w-[3px] rounded-full bg-primary/50 transition-colors group-hover:bg-primary" />
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bağlamsal tablo / sütun düzeni çubuğu
// ---------------------------------------------------------------------------

const PADDING_OPTIONS = [
  { value: '0px', label: 'Yok' },
  { value: '4px', label: 'Dar' },
  { value: '', label: 'Normal' },
  { value: '12px', label: 'Geniş' },
  { value: '16px', label: 'Çok geniş' },
];

function WidthPresetMenu({
  count,
  current,
  onPick,
}: {
  count: number;
  current: number[];
  onPick: (percents: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const ref = useDismiss(open, close);
  const presets = widthPresetsFor(count);
  const isCurrent = (p: number[]) => p.every((v, i) => Math.abs(v - (current[i] ?? 0)) < 0.6);

  return (
    <div className="relative" ref={ref}>
      <ToolbarButton title="Hazır sütun oranları" active={open} onClick={() => setOpen((v) => !v)}>
        Oranlar
        <CaretDownIcon size={11} />
      </ToolbarButton>
      {open && (
        <div className="absolute left-0 top-full z-[60] mt-1.5 w-[230px] rounded-xl border border-background-border bg-background-panel p-2 shadow-xl">
          {presets.map((p) => (
            <button
              key={p.join('-')}
              type="button"
              onClick={() => {
                onPick(p);
                close();
              }}
              className={[
                'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 transition-colors',
                isCurrent(p) ? 'bg-primary/10' : 'hover:bg-background-hover',
              ].join(' ')}
            >
              <span className="flex h-5 flex-1 gap-[2px]">
                {p.map((w, i) => (
                  <span
                    key={i}
                    className="rounded-[3px] border border-primary/40 bg-primary/15"
                    style={{ width: `${w}%` }}
                  />
                ))}
              </span>
              <span className="w-[86px] shrink-0 text-right text-[10px] tabular-nums text-text-secondary">
                {p.map((w) => Math.round(w)).join(' / ')}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TableContextBar({ editor }: { editor: Editor }) {
  const ctx = findTableContext(editor.state);
  const [percentInput, setPercentInput] = useState('');
  const percentFocused = useRef(false);

  const percents = ctx ? getDisplayPercents(ctx.node) : [];
  const activePercent = percents[ctx?.col ?? 0];

  useEffect(() => {
    if (!percentFocused.current && activePercent != null) {
      setPercentInput(String(Math.round(activePercent * 10) / 10));
    }
  }, [activePercent]);

  if (!ctx) return null;

  const borderless = isBorderlessTableNode(ctx.node);
  const percentBased = hasPercentColumns(ctx.node);
  const multiColumn = ctx.colCount > 1;
  const valign = getSelectedCellStyle(editor, 'vertical-align') || 'top';
  const padding = getFirstCellStyle(ctx.node, 'padding') ?? '';
  const currentCell = ctx.cellPos != null ? ctx.node.nodeAt(ctx.cellPos) : null;
  const canSplit =
    !!currentCell && (Number(currentCell.attrs.colspan) > 1 || Number(currentCell.attrs.rowspan) > 1);
  const hasCellSelection = editor.state.selection instanceof CellSelection;

  const previewPercents = (next: number[]) => {
    // Sürüklerken geçmişe yazma; bırakınca tek adım olarak kaydedilir (commitPercents)
    setColumnPercents(editor, next, { addToHistory: false });
  };

  const commitPercents = (base: number[], next: number[]) => {
    setColumnPercents(editor, base, { addToHistory: false });
    setColumnPercents(editor, next);
  };

  const applyPercentInput = () => {
    const value = Number(percentInput.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) {
      setPercentInput(String(activePercent ?? ''));
      return;
    }
    setColumnPercents(editor, resizeColumn(percents, ctx.col, value));
  };

  return (
    <div className="flex flex-wrap items-center gap-1 border-t border-background-border bg-primary/5 px-3 py-1.5 md:px-4">
      <span
        className="mr-1 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-primary"
        title={
          borderless
            ? 'Çizgisiz sütun düzeni — PDF\'te çizgi çıkmaz; editördeki kesikli çizgiler yalnızca kılavuzdur'
            : 'Çizgili tablo'
        }
      >
        {borderless ? <ColumnsIcon size={13} /> : <RowsIcon size={13} />}
        {borderless ? 'Sütun düzeni' : 'Tablo'}
      </span>

      {multiColumn && (
        <>
          <ColumnWidthRuler
            percents={percents}
            activeCol={ctx.col}
            onPreview={previewPercents}
            onCommit={commitPercents}
            onSelectColumn={(col) => focusColumn(editor, col)}
          />
          <label
            className="flex h-8 items-center gap-1 rounded-lg border border-background-border bg-background-surface/60 px-2 text-[11px] text-text-secondary"
            title="Seçili sütunun genişliği (%) — komşu sütun farkı karşılar"
          >
            <span className="whitespace-nowrap">Sütun {ctx.col + 1}</span>
            <span>%</span>
            <input
              type="number"
              min="5"
              max="95"
              step="1"
              value={percentInput}
              onFocus={() => {
                percentFocused.current = true;
              }}
              onChange={(e) => setPercentInput(e.target.value)}
              onBlur={() => {
                percentFocused.current = false;
                applyPercentInput();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              }}
              className="w-11 bg-transparent text-center text-xs text-text-primary outline-none"
              aria-label="Seçili sütun genişliği (%)"
            />
          </label>
          <ToolbarGroup>
            <WidthPresetMenu
              count={ctx.colCount}
              current={percents}
              onPick={(p) => setColumnPercents(editor, p)}
            />
          </ToolbarGroup>
        </>
      )}

      <ToolbarDivider />

      <ToolbarGroup>
        <ToolbarButton
          title="Sola sütun ekle"
          onClick={() => editor.chain().focus().addColumnBefore().run()}
        >
          <ColumnsPlusLeftIcon size={15} />
        </ToolbarButton>
        <ToolbarButton
          title="Sağa sütun ekle"
          onClick={() => editor.chain().focus().addColumnAfter().run()}
        >
          <ColumnsPlusRightIcon size={15} />
        </ToolbarButton>
        <ToolbarButton
          title="Sütunu sola taşı (genişliğiyle birlikte)"
          disabled={ctx.col === 0}
          onClick={() => moveColumn(editor, -1)}
        >
          <ArrowLineLeftIcon size={15} />
        </ToolbarButton>
        <ToolbarButton
          title="Sütunu sağa taşı (genişliğiyle birlikte)"
          disabled={ctx.col >= ctx.colCount - 1}
          onClick={() => moveColumn(editor, 1)}
        >
          <ArrowLineRightIcon size={15} />
        </ToolbarButton>
        <ToolbarButton
          title="Sütunu sil"
          danger
          disabled={!multiColumn}
          onClick={() => editor.chain().focus().deleteColumn().run()}
        >
          <ColumnsIcon size={14} />
          <MinusIcon size={10} />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarGroup>
        <ToolbarButton
          title="Üste satır ekle"
          onClick={() => editor.chain().focus().addRowBefore().run()}
        >
          <RowsPlusTopIcon size={15} />
        </ToolbarButton>
        <ToolbarButton
          title="Alta satır ekle"
          onClick={() => editor.chain().focus().addRowAfter().run()}
        >
          <RowsPlusBottomIcon size={15} />
        </ToolbarButton>
        <ToolbarButton
          title="Satırı sil"
          danger
          disabled={ctx.map.height < 2}
          onClick={() => editor.chain().focus().deleteRow().run()}
        >
          <RowsIcon size={14} />
          <MinusIcon size={10} />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarGroup>
        <ToolbarButton
          title="Hücre içeriğini üste hizala"
          active={valign === 'top'}
          onClick={() => setSelectedCellStyle(editor, 'vertical-align', 'top')}
        >
          <AlignTopIcon size={15} />
        </ToolbarButton>
        <ToolbarButton
          title="Hücre içeriğini dikeyde ortala"
          active={valign === 'middle'}
          onClick={() => setSelectedCellStyle(editor, 'vertical-align', 'middle')}
        >
          <AlignCenterVerticalIcon size={15} />
        </ToolbarButton>
        <ToolbarButton
          title="Hücre içeriğini alta hizala"
          active={valign === 'bottom'}
          onClick={() => setSelectedCellStyle(editor, 'vertical-align', 'bottom')}
        >
          <AlignBottomIcon size={15} />
        </ToolbarButton>
      </ToolbarGroup>

      <select
        value={PADDING_OPTIONS.some((o) => o.value === padding) ? padding : ''}
        onChange={(e) => setAllCellsStyle(editor, 'padding', e.target.value || null)}
        className="h-8 rounded-lg border border-background-border bg-background-surface/60 px-2 text-xs text-text-primary outline-none focus:ring-2 focus:ring-primary/40"
        title="Hücre iç boşluğu (tüm tablo)"
      >
        {PADDING_OPTIONS.map((o) => (
          <option key={o.label} value={o.value}>
            Boşluk: {o.label}
          </option>
        ))}
      </select>

      <ToolbarDivider />

      <ToolbarGroup>
        <ToolbarButton
          title={borderless ? 'Çizgileri göster (tabloya dönüştür)' : 'Çizgileri gizle (sütun düzenine dönüştür)'}
          active={borderless}
          onClick={() => toggleTableNoBorder(editor)}
        >
          <LayoutIcon size={14} />
          <span className="hidden xl:inline">{borderless ? 'Çizgi göster' : 'Çizgi gizle'}</span>
        </ToolbarButton>
        {(hasCellSelection || canSplit) && (
          <>
            <ToolbarButton
              title="Seçili hücreleri birleştir"
              disabled={!hasCellSelection}
              onClick={() => editor.chain().focus().mergeCells().run()}
            >
              Birleştir
            </ToolbarButton>
            <ToolbarButton
              title="Birleşik hücreyi ayır"
              disabled={!canSplit}
              onClick={() => editor.chain().focus().splitCell().run()}
            >
              Ayır
            </ToolbarButton>
          </>
        )}
        {!percentBased && (
          <>
            <ToolbarButton
              title="Tabloyu sola yasla"
              onClick={() => editor.commands.updateAttributes('table', { align: 'left' })}
            >
              <TextAlignLeftIcon size={14} />
            </ToolbarButton>
            <ToolbarButton
              title="Tabloyu ortala"
              onClick={() => editor.commands.updateAttributes('table', { align: 'center' })}
            >
              <TextAlignCenterIcon size={14} />
            </ToolbarButton>
            <ToolbarButton
              title="Tabloyu sağa yasla"
              onClick={() => editor.commands.updateAttributes('table', { align: 'right' })}
            >
              <TextAlignRightIcon size={14} />
            </ToolbarButton>
          </>
        )}
      </ToolbarGroup>

      <ToolbarGroup>
        <ToolbarButton
          title="Tablonun üstüne boş satır (paragraf) ekle"
          onClick={() => insertParagraphAroundTable(editor, 'before')}
        >
          <ArrowLineUpIcon size={15} />
        </ToolbarButton>
        <ToolbarButton
          title="Tablonun altına boş satır (paragraf) ekle"
          onClick={() => insertParagraphAroundTable(editor, 'after')}
        >
          <ArrowLineDownIcon size={15} />
        </ToolbarButton>
        {borderless && (
          <ToolbarButton
            title="Düzeni çöz — tabloyu kaldırır, içerikleri alt alta bırakır"
            onClick={() => unwrapTable(editor)}
          >
            <SquareSplitVerticalIcon size={15} />
            <span className="hidden xl:inline">Düzeni çöz</span>
          </ToolbarButton>
        )}
        <ToolbarButton
          title={borderless ? 'Düzeni sil (içerikle birlikte)' : 'Tabloyu sil'}
          danger
          onClick={() => editor.chain().focus().deleteTable().run()}
        >
          <TrashIcon size={14} />
        </ToolbarButton>
      </ToolbarGroup>
    </div>
  );
}
