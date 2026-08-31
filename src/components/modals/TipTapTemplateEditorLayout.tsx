import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import type { Editor } from '@tiptap/react';
import { EditorContent } from '@tiptap/react';
import {
  ArrowLeftIcon,
  ArrowCounterClockwiseIcon,
  ArrowClockwiseIcon,
  CaretDownIcon,
  CaretRightIcon,
  EyeIcon,
  FloppyDiskIcon,
  ImageIcon,
  InfoIcon,
  MagnifyingGlassIcon,
  SidebarIcon,
  TableIcon,
  TextAlignLeftIcon,
  TextAlignCenterIcon,
  TextAlignRightIcon,
  TextBIcon,
  TextItalicIcon,
  TextUnderlineIcon,
  TextHOneIcon,
  TextHTwoIcon,
  PlusIcon,
  MinusIcon,
  ColumnsIcon,
  RowsIcon,
  TrashIcon,
  GridFourIcon,
  LayoutIcon,
} from '@phosphor-icons/react';
import type { TemplateImage } from '../../models';
import {
  LINE_HEIGHT_OPTIONS,
  getActiveLineHeight,
} from './LineHeightExtension';
import { FONT_SIZE_OPTIONS, getActiveFontSize } from './FontSizeExtension';
import { getPageMarginsPaperStyle, type PageMargins } from './PageMargins';
import {
  BORDERLESS_STYLE,
  toggleTableNoBorder,
  ensureLayoutTablesBorderless,
} from './CustomTableExtensions';

export type TipTapPlaceholderItem = {
  key: string;
  label: string;
};

export type TipTapPlaceholderGroup = {
  id: string;
  title: string;
  items: TipTapPlaceholderItem[];
};

type TipTapTemplateEditorLayoutProps = {
  editor: Editor;
  pageTitle: string;
  templateName: string;
  onTemplateNameChange: (value: string) => void;
  namePlaceholder: string;
  isBusy: boolean;
  onPreview: () => void;
  onSave: () => void;
  onClose: () => void;
  pageMargins: PageMargins;
  onPageMarginsChange: (margins: PageMargins) => void;
  placeholderGroups: TipTapPlaceholderGroup[];
  documentNumberKey: string;
  documentNumberLabel: string;
  showMaterialTable?: boolean;
  onInsertMaterialTable?: () => void;
  showReturnTable?: boolean;
  onInsertReturnTable?: () => void;
  images: TemplateImage[];
  uploadingImage: boolean;
  onImageUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onInsertImage: (imageId: number) => void;
  fileInputRef: RefObject<HTMLInputElement>;
  showGridlines: boolean;
  onToggleGridlines: () => void;
  isTableActive: boolean;
  isImageActive: boolean;
  previewModal: ReactNode;
};

function ToolbarButton({
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

function ToolbarDivider() {
  return <div className="mx-0.5 h-5 w-px shrink-0 bg-background-border" />;
}

export default function TipTapTemplateEditorLayout({
  editor,
  pageTitle,
  templateName,
  onTemplateNameChange,
  namePlaceholder,
  isBusy,
  onPreview,
  onSave,
  onClose,
  pageMargins,
  onPageMarginsChange,
  placeholderGroups,
  documentNumberKey,
  documentNumberLabel,
  showMaterialTable = true,
  onInsertMaterialTable,
  showReturnTable = false,
  onInsertReturnTable,
  images,
  uploadingImage,
  onImageUpload,
  onInsertImage,
  fileInputRef,
  showGridlines,
  onToggleGridlines,
  isTableActive,
  isImageActive,
  previewModal,
}: TipTapTemplateEditorLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [fieldSearch, setFieldSearch] = useState('');
  const [, setEditorTick] = useState(0);
  const [fontSizeInput, setFontSizeInput] = useState('');
  const fontSizeInputFocused = useRef(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(placeholderGroups.map((g, i) => [g.id, i < 2]))
  );

  useEffect(() => {
    const refreshToolbar = () => {
      setEditorTick((tick) => tick + 1);
      if (!fontSizeInputFocused.current) {
        setFontSizeInput(getActiveFontSize(editor).replace('px', ''));
      }
    };
    editor.on('selectionUpdate', refreshToolbar);
    editor.on('transaction', refreshToolbar);
    refreshToolbar();
    return () => {
      editor.off('selectionUpdate', refreshToolbar);
      editor.off('transaction', refreshToolbar);
    };
  }, [editor]);

  const insertPlaceholder = useCallback(
    (key: string) => {
      editor.chain().focus().insertContent(`{{${key}}}`).run();
    },
    [editor]
  );

  const getTableAttrs = useCallback(() => {
    const { $from } = editor.state.selection;
    for (let depth = $from.depth; depth > 0; depth--) {
      const node = $from.node(depth);
      if (node.type.name === 'table') {
        return node.attrs;
      }
    }
    return editor.getAttributes('table');
  }, [editor]);

  const imageNodeType = editor.isActive('imageResize') ? 'imageResize' : 'image';
  const imageAlign = editor.getAttributes(imageNodeType).align || 'none';
  const activeFontSize = getActiveFontSize(editor);
  const tableAttrs = isTableActive ? getTableAttrs() : {};

  const filteredGroups = useMemo(() => {
    const q = fieldSearch.trim().toLowerCase();
    if (!q) return placeholderGroups;
    return placeholderGroups
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            item.label.toLowerCase().includes(q) ||
            item.key.toLowerCase().includes(q)
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [fieldSearch, placeholderGroups]);

  const insertLayout = useCallback(
    (val: string) => {
      if (val === 'empty') {
        editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
        return;
      }
      if (val === 'logo-header') {
        editor
          .chain()
          .focus()
          .insertContent(`
            <table class="border-none" data-no-border="true" style="width: 100%; ${BORDERLESS_STYLE}">
              <tbody>
                <tr>
                  <td style="width: 30%; vertical-align: middle; text-align: center; ${BORDERLESS_STYLE}"><p style="text-align: center;"><br></p></td>
                  <td style="width: 70%; vertical-align: middle; text-align: center; ${BORDERLESS_STYLE}"><h2 style="text-align: center;">ŞİRKET UNVANI / BAŞLIK</h2><p style="text-align: center;">${documentNumberLabel}: {{${documentNumberKey}}}<br>Tarih: {{bugunTarihi}}</p></td>
                </tr>
              </tbody>
            </table>
            <p></p>
          `)
          .run();
      } else if (val === '2-col') {
        editor
          .chain()
          .focus()
          .insertContent(`
            <table class="border-none" data-no-border="true" style="width: 100%; ${BORDERLESS_STYLE}">
              <tbody>
                <tr>
                  <td style="width: 50%; vertical-align: top; ${BORDERLESS_STYLE}"><p><strong>Sol sütun</strong></p><p></p></td>
                  <td style="width: 50%; vertical-align: top; ${BORDERLESS_STYLE}"><p><strong>Sağ sütun</strong></p><p></p></td>
                </tr>
              </tbody>
            </table>
            <p></p>
          `)
          .run();
      } else if (val === '3-col') {
        editor
          .chain()
          .focus()
          .insertContent(`
            <table class="border-none" data-no-border="true" style="width: 100%; ${BORDERLESS_STYLE}">
              <tbody>
                <tr>
                  <td style="width: 33.33%; vertical-align: top; ${BORDERLESS_STYLE}"><p><strong>Sütun 1</strong></p></td>
                  <td style="width: 33.33%; vertical-align: top; ${BORDERLESS_STYLE}"><p><strong>Sütun 2</strong></p></td>
                  <td style="width: 33.33%; vertical-align: top; ${BORDERLESS_STYLE}"><p><strong>Sütun 3</strong></p></td>
                </tr>
              </tbody>
            </table>
            <p></p>
          `)
          .run();
      }
      ensureLayoutTablesBorderless(editor);
    },
    [documentNumberKey, documentNumberLabel, editor]
  );

  return (
    <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-background-main">
      {/* Header */}
      <header className="shrink-0 border-b border-background-border bg-background-panel/95 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-3 py-2.5 md:px-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-text-secondary transition-colors hover:bg-background-hover hover:text-text-primary"
            title="Kapat"
          >
            <ArrowLeftIcon size={16} />
            <span className="hidden sm:inline">Geri</span>
          </button>

          <div className="min-w-0 flex-1">
            <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-text-secondary">
              {pageTitle}
            </p>
            <input
              type="text"
              value={templateName}
              onChange={(e) => onTemplateNameChange(e.target.value)}
              className="w-full max-w-xl border-0 bg-transparent py-0.5 text-sm font-semibold text-text-primary outline-none placeholder:text-text-secondary/70 focus:ring-0"
              placeholder={namePlaceholder}
              aria-label="Şablon adı"
            />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setSidebarOpen((v) => !v)}
              className={[
                'inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors',
                sidebarOpen
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-background-border bg-background-panel text-text-secondary hover:bg-background-hover',
              ].join(' ')}
              title={sidebarOpen ? 'Alan panelini gizle' : 'Alan panelini göster'}
            >
              <SidebarIcon size={16} />
              <span className="hidden md:inline">Alanlar</span>
            </button>
            <button
              type="button"
              onClick={onPreview}
              disabled={isBusy}
              className="btn-secondary !py-2 !px-3 text-xs flex items-center gap-1.5"
            >
              <EyeIcon size={16} />
              {isBusy ? 'Hazırlanıyor…' : 'Önizle'}
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={isBusy}
              className="btn-primary !py-2 !px-4 text-xs flex items-center gap-1.5"
            >
              <FloppyDiskIcon size={16} />
              {isBusy ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </div>
        </div>
      </header>

      {/* Formatting toolbar */}
      <div className="shrink-0 border-b border-background-border bg-background-panel">
        <div className="flex flex-wrap items-center gap-1 px-3 py-1.5 md:px-4">
          <div className="flex items-center rounded-lg border border-background-border bg-background-surface/60 p-0.5">
            <ToolbarButton
              title="Geri al"
              disabled={!editor.can().undo()}
              onClick={() => editor.chain().focus().undo().run()}
            >
              <ArrowCounterClockwiseIcon size={15} />
            </ToolbarButton>
            <ToolbarButton
              title="İleri al"
              disabled={!editor.can().redo()}
              onClick={() => editor.chain().focus().redo().run()}
            >
              <ArrowClockwiseIcon size={15} />
            </ToolbarButton>
          </div>

          <div className="flex items-center rounded-lg border border-background-border bg-background-surface/60 p-0.5">
            <ToolbarButton
              title="Kalın"
              active={editor.isActive('bold')}
              disabled={!editor.can().chain().focus().toggleBold().run()}
              onClick={() => editor.chain().focus().toggleBold().run()}
            >
              <TextBIcon size={15} weight="bold" />
            </ToolbarButton>
            <ToolbarButton
              title="İtalik"
              active={editor.isActive('italic')}
              disabled={!editor.can().chain().focus().toggleItalic().run()}
              onClick={() => editor.chain().focus().toggleItalic().run()}
            >
              <TextItalicIcon size={15} />
            </ToolbarButton>
            <ToolbarButton
              title="Altı çizili"
              active={editor.isActive('underline')}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
            >
              <TextUnderlineIcon size={15} />
            </ToolbarButton>
          </div>

          <div className="flex items-center rounded-lg border border-background-border bg-background-surface/60 p-0.5">
            <ToolbarButton
              title="Normal metin"
              active={editor.isActive('paragraph')}
              onClick={() => editor.chain().focus().setParagraph().run()}
            >
              P
            </ToolbarButton>
            <ToolbarButton
              title="Başlık 1"
              active={editor.isActive('heading', { level: 1 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            >
              <TextHOneIcon size={15} />
            </ToolbarButton>
            <ToolbarButton
              title="Başlık 2"
              active={editor.isActive('heading', { level: 2 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            >
              <TextHTwoIcon size={15} />
            </ToolbarButton>
          </div>

          <div className="flex items-center rounded-lg border border-background-border bg-background-surface/60 p-0.5">
            <ToolbarButton
              title="Sola hizala"
              active={editor.isActive({ textAlign: 'left' })}
              onClick={() => editor.chain().focus().setTextAlign('left').run()}
            >
              <TextAlignLeftIcon size={15} />
            </ToolbarButton>
            <ToolbarButton
              title="Ortala"
              active={editor.isActive({ textAlign: 'center' })}
              onClick={() => editor.chain().focus().setTextAlign('center').run()}
            >
              <TextAlignCenterIcon size={15} />
            </ToolbarButton>
            <ToolbarButton
              title="Sağa hizala"
              active={editor.isActive({ textAlign: 'right' })}
              onClick={() => editor.chain().focus().setTextAlign('right').run()}
            >
              <TextAlignRightIcon size={15} />
            </ToolbarButton>
          </div>

          <div className="relative flex h-8 items-center rounded-lg border border-background-border bg-background-surface/60">
            <input
              list="tiptap-font-size-options"
              type="number"
              min="8"
              max="72"
              step="1"
              value={fontSizeInput || activeFontSize.replace('px', '')}
              onChange={(e) => {
                setFontSizeInput(e.target.value);
              }}
              onFocus={() => {
                fontSizeInputFocused.current = true;
                setFontSizeInput(activeFontSize.replace('px', ''));
              }}
              onBlur={() => {
                fontSizeInputFocused.current = false;
                const value = Number(fontSizeInput);
                if (value >= 8 && value <= 72) {
                  editor.chain().focus().setFontSize(`${value}px`).run();
                } else {
                  setFontSizeInput(activeFontSize.replace('px', ''));
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              }}
              className="h-full w-[92px] bg-transparent px-2 text-center text-xs text-text-primary outline-none"
              placeholder="Boyut"
              title="Yazı boyutu (8-72 px)"
              aria-label="Yazı boyutu"
            />
            <span className="pr-2 text-[10px] text-text-secondary">px</span>
            <datalist id="tiptap-font-size-options">
              {FONT_SIZE_OPTIONS.map((option) => (
                <option key={option.value} value={option.label} />
              ))}
            </datalist>
          </div>

          <select
            value={getActiveLineHeight(editor)}
            onChange={(e) => {
              const value = e.target.value;
              if (value) {
                editor.chain().focus().setLineHeight(value).run();
              } else {
                editor.chain().focus().unsetLineHeight().run();
              }
            }}
            className="h-8 rounded-lg border border-background-border bg-background-surface/60 px-2 text-xs text-text-primary outline-none focus:ring-2 focus:ring-primary/40"
            title="Satır aralığı"
          >
            <option value="">Satır aralığı</option>
            {LINE_HEIGHT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <label
            className="flex h-8 items-center gap-1 rounded-lg border border-background-border bg-background-surface/60 px-2 text-xs text-text-secondary"
            title="Üst ve alt sayfa boşluğu (mm)"
          >
            <span>Ü/A</span>
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={pageMargins.top}
              onChange={(e) =>
                onPageMarginsChange({ ...pageMargins, top: Number(e.target.value) })
              }
              className="w-10 bg-transparent text-center text-text-primary outline-none"
              aria-label="Üst sayfa boşluğu (mm)"
            />
            <span>/</span>
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={pageMargins.bottom}
              onChange={(e) =>
                onPageMarginsChange({ ...pageMargins, bottom: Number(e.target.value) })
              }
              className="w-10 bg-transparent text-center text-text-primary outline-none"
              aria-label="Alt sayfa boşluğu (mm)"
            />
            <span>mm</span>
          </label>

          <label
            className="flex h-8 items-center gap-1 rounded-lg border border-background-border bg-background-surface/60 px-2 text-xs text-text-secondary"
            title="Sol ve sağ sayfa boşluğu (mm)"
          >
            <span>Y/S</span>
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={pageMargins.left}
              onChange={(e) =>
                onPageMarginsChange({ ...pageMargins, left: Number(e.target.value) })
              }
              className="w-10 bg-transparent text-center text-text-primary outline-none"
              aria-label="Sol sayfa boşluğu (mm)"
            />
            <span>/</span>
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={pageMargins.right}
              onChange={(e) =>
                onPageMarginsChange({ ...pageMargins, right: Number(e.target.value) })
              }
              className="w-10 bg-transparent text-center text-text-primary outline-none"
              aria-label="Sağ sayfa boşluğu (mm)"
            />
            <span>mm</span>
          </label>

          <ToolbarDivider />

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            onChange={onImageUpload}
            className="hidden"
          />
          <ToolbarButton
            title="Görsel yükle"
            disabled={uploadingImage}
            onClick={() => fileInputRef.current?.click()}
          >
            <ImageIcon size={15} />
            <span className="hidden lg:inline">{uploadingImage ? 'Yükleniyor…' : 'Görsel'}</span>
          </ToolbarButton>
          {images.length > 0 && (
            <select
              defaultValue=""
              onChange={(e) => {
                const id = e.target.value ? Number(e.target.value) : null;
                if (id) onInsertImage(id);
                e.target.value = '';
              }}
              className="h-8 max-w-[140px] rounded-lg border border-background-border bg-background-surface/60 px-2 text-xs text-text-primary outline-none focus:ring-2 focus:ring-primary/40"
              title="Kayıtlı görsel seç"
            >
              <option value="">Kayıtlı görsel</option>
              {images.map((img) => (
                <option key={img.ImageId} value={img.ImageId}>
                  {img.FileName}
                </option>
              ))}
            </select>
          )}

          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) {
                insertLayout(e.target.value);
                e.target.value = '';
              }
            }}
            className="h-8 rounded-lg border border-background-border bg-background-surface/60 px-2 text-xs text-text-primary outline-none focus:ring-2 focus:ring-primary/40"
            title="Düzen / tablo ekle"
          >
            <option value="">Düzen / Tablo</option>
            <option value="empty">Boş tablo</option>
            <option value="logo-header">Logo + başlık</option>
            <option value="2-col">2 sütun</option>
            <option value="3-col">3 sütun</option>
          </select>

          <ToolbarButton
            title={
              showGridlines
                ? 'Düzen kılavuzlarını gizle (sadece editör)'
                : 'Düzen kılavuzlarını göster (sadece editör)'
            }
            active={showGridlines}
            onClick={onToggleGridlines}
          >
            <GridFourIcon size={15} />
            <span className="hidden lg:inline">Kılavuz</span>
          </ToolbarButton>
        </div>

        {/* Contextual: image */}
        {isImageActive && (
          <div className="flex flex-wrap items-center gap-1 border-t border-background-border bg-primary/5 px-3 py-1.5 md:px-4">
            <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
              Görsel
            </span>
            <ToolbarButton
              title="Sola yasla"
              active={imageAlign === 'left'}
              onClick={() => editor.commands.updateAttributes(imageNodeType, { align: 'left' })}
            >
              <TextAlignLeftIcon size={14} />
            </ToolbarButton>
            <ToolbarButton
              title="Ortala"
              active={imageAlign === 'center'}
              onClick={() => editor.commands.updateAttributes(imageNodeType, { align: 'center' })}
            >
              <TextAlignCenterIcon size={14} />
            </ToolbarButton>
            <ToolbarButton
              title="Sağa yasla"
              active={imageAlign === 'right'}
              onClick={() => editor.commands.updateAttributes(imageNodeType, { align: 'right' })}
            >
              <TextAlignRightIcon size={14} />
            </ToolbarButton>
            <ToolbarButton
              title="Hizayı sıfırla"
              active={imageAlign === 'none'}
              onClick={() => editor.commands.updateAttributes(imageNodeType, { align: 'none' })}
            >
              Sıfırla
            </ToolbarButton>
          </div>
        )}

        {/* Contextual: table */}
        {isTableActive && (
          <div className="flex flex-wrap items-center gap-0.5 border-t border-background-border bg-primary/5 px-3 py-1.5 md:px-4">
            <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
              Tablo
            </span>
            <ToolbarButton
              title="Sola yasla"
              onClick={() => editor.commands.updateAttributes('table', { align: 'left' })}
            >
              <TextAlignLeftIcon size={14} />
            </ToolbarButton>
            <ToolbarButton
              title="Ortala"
              onClick={() => editor.commands.updateAttributes('table', { align: 'center' })}
            >
              <TextAlignCenterIcon size={14} />
            </ToolbarButton>
            <ToolbarButton
              title="Sağa yasla"
              onClick={() => editor.commands.updateAttributes('table', { align: 'right' })}
            >
              <TextAlignRightIcon size={14} />
            </ToolbarButton>
            <ToolbarButton
              title={tableAttrs.noBorder ? 'Çizgileri göster' : 'Çizgileri gizle'}
              active={!!tableAttrs.noBorder}
              onClick={() => toggleTableNoBorder(editor)}
            >
              <LayoutIcon size={14} />
              <span className="hidden sm:inline">
                {tableAttrs.noBorder ? 'Çizgi göster' : 'Çizgi gizle'}
              </span>
            </ToolbarButton>
            <ToolbarDivider />
            <ToolbarButton
              title="Sola sütun ekle"
              onClick={() => editor.chain().focus().addColumnBefore().run()}
            >
              <ColumnsIcon size={14} />
              <PlusIcon size={10} />
            </ToolbarButton>
            <ToolbarButton
              title="Sağa sütun ekle"
              onClick={() => editor.chain().focus().addColumnAfter().run()}
            >
              <ColumnsIcon size={14} />
              <PlusIcon size={10} />
            </ToolbarButton>
            <ToolbarButton
              title="Üste satır ekle"
              onClick={() => editor.chain().focus().addRowBefore().run()}
            >
              <RowsIcon size={14} />
              <PlusIcon size={10} />
            </ToolbarButton>
            <ToolbarButton
              title="Alta satır ekle"
              onClick={() => editor.chain().focus().addRowAfter().run()}
            >
              <RowsIcon size={14} />
              <PlusIcon size={10} />
            </ToolbarButton>
            <ToolbarDivider />
            <ToolbarButton
              title="Sütunu sil"
              danger
              onClick={() => editor.chain().focus().deleteColumn().run()}
            >
              <ColumnsIcon size={14} />
              <MinusIcon size={10} />
            </ToolbarButton>
            <ToolbarButton
              title="Satırı sil"
              danger
              onClick={() => editor.chain().focus().deleteRow().run()}
            >
              <RowsIcon size={14} />
              <MinusIcon size={10} />
            </ToolbarButton>
            <ToolbarButton
              title="Hücreleri birleştir"
              onClick={() => editor.chain().focus().mergeCells().run()}
            >
              Birleştir
            </ToolbarButton>
            <ToolbarButton
              title="Hücreyi ayır"
              onClick={() => editor.chain().focus().splitCell().run()}
            >
              Ayır
            </ToolbarButton>
            <ToolbarButton
              title="Tabloyu sil"
              danger
              onClick={() => editor.chain().focus().deleteTable().run()}
            >
              <TrashIcon size={14} />
            </ToolbarButton>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Placeholder sidebar */}
        {sidebarOpen && (
          <aside className="template-editor-fields flex w-[280px] shrink-0 flex-col border-r border-background-border bg-background-panel">
            <div className="border-b border-background-border px-4 pb-3 pt-4">
              <h3 className="text-sm font-semibold text-text-primary">Dinamik alanlar</h3>
              <p className="mt-1 text-[11px] leading-relaxed text-text-secondary">
                İmleci belgede istediğiniz yere koyun, ardından bir alana tıklayın.
              </p>
              <div className="relative mt-3">
                <MagnifyingGlassIcon
                  size={14}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary"
                />
                <input
                  type="search"
                  value={fieldSearch}
                  onChange={(e) => setFieldSearch(e.target.value)}
                  placeholder="Alan ara…"
                  className="input w-full !py-1.5 !pl-8 !pr-3 text-xs"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
              {showMaterialTable && onInsertMaterialTable && (
                <button
                  type="button"
                  onClick={onInsertMaterialTable}
                  className="flex w-full items-center gap-2.5 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2.5 text-left transition-colors hover:bg-primary/10"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <TableIcon size={16} weight="duotone" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-text-primary">
                      Malzeme tablosu
                    </span>
                    <span className="block truncate font-mono text-[10px] text-text-secondary">
                      {'{{malzemeTablosu}}'}
                    </span>
                  </span>
                </button>
              )}

              {showReturnTable && onInsertReturnTable && (
                <button
                  type="button"
                  onClick={onInsertReturnTable}
                  className="flex w-full items-center gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2.5 text-left transition-colors hover:bg-amber-500/10"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
                    <TableIcon size={16} weight="duotone" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-text-primary">
                      İade tablosu
                    </span>
                    <span className="block truncate font-mono text-[10px] text-text-secondary">
                      {'{{iadeTablosu}}'}
                    </span>
                  </span>
                </button>
              )}

              {filteredGroups.length === 0 && (
                <p className="px-1 py-4 text-center text-xs text-text-secondary">
                  Eşleşen alan bulunamadı
                </p>
              )}

              {filteredGroups.map((group) => {
                const isOpen = fieldSearch ? true : openGroups[group.id];
                return (
                  <div
                    key={group.id}
                    className="overflow-hidden rounded-xl border border-background-border bg-background-surface"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setOpenGroups((prev) => ({ ...prev, [group.id]: !prev[group.id] }))
                      }
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-background-hover"
                    >
                      <span className="text-xs font-semibold text-text-primary">{group.title}</span>
                      <span className="flex items-center gap-1.5 text-text-secondary">
                        <span className="text-[10px] tabular-nums">{group.items.length}</span>
                        {isOpen ? <CaretDownIcon size={14} /> : <CaretRightIcon size={14} />}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="space-y-0.5 border-t border-background-border px-1.5 py-1.5">
                        {group.items.map((item) => (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => insertPlaceholder(item.key)}
                            className="group/field w-full rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-background-hover"
                            title={`{{${item.key}}} ekle`}
                          >
                            <span className="block text-xs text-text-primary group-hover/field:text-primary">
                              {item.label}
                            </span>
                            <span className="block truncate font-mono text-[10px] text-text-secondary opacity-70">
                              {`{{${item.key}}}`}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="shrink-0 border-t border-background-border bg-background-surface px-3 py-3">
              <div className="flex gap-2 text-[10px] leading-relaxed text-text-secondary">
                <InfoIcon size={14} className="mt-0.5 shrink-0 text-info" />
                <p>
                  Logo ve yan yana içerikler için <strong>Düzen / Tablo</strong> menüsünü kullanın.
                  Logo hücresine tıklayıp <strong>Kayıtlı görsel</strong> listesinden logoyu ekleyebilirsiniz.
                  Gri kılavuz çizgileri yalnızca editörde görünür; önizleme ve PDF&apos;te çıkmaz.
                  İsterseniz araç çubuğundaki <strong>Kılavuz</strong> ile açıp kapatabilirsiniz.
                </p>
              </div>
            </div>
          </aside>
        )}

        {/* Writing canvas */}
        <div
          className={`template-editor-workspace min-h-0 flex-1 overflow-auto ${
            showGridlines ? 'show-gridlines' : ''
          }`}
        >
          <div className="flex min-h-full justify-center px-3 py-6 md:px-8 md:py-8">
            <div
              className="template-editor-paper text-text-primary"
              style={getPageMarginsPaperStyle(pageMargins)}
            >
              <EditorContent editor={editor} />
            </div>
          </div>
        </div>
      </div>

      {previewModal}
    </div>
  );
}
