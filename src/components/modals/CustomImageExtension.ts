import ImageResize from 'tiptap-extension-resize-image';
import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { NodeSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { EditorView, NodeView } from '@tiptap/pm/view';
import { useAuthStore } from '../../store/authStore';
import { resolveImageExportAlignment } from './CustomTableExtensions';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

/** Yanlara yaslı görsel ile metin arası boşluk — PDF tarafı (documentGenerator) ile aynı. */
export const IMAGE_SIDE_GAP_PX = 8;

export const IMAGE_MIN_WIDTH_PX = 16;
/** Klavye (Alt+↑/↓) ve araç çubuğu ile boyut değiştirme adımı */
export const IMAGE_SIZE_STEP_PX = 10;

const IMAGE_NODE_NAMES = new Set(['image', 'imageResize']);

export function isImageNode(node: ProseMirrorNode | null | undefined): node is ProseMirrorNode {
  return !!node && IMAGE_NODE_NAMES.has(node.type.name);
}

function isCellNode(node: ProseMirrorNode): boolean {
  const name = node.type.name;
  return name === 'tableCell' || name === 'tableHeader';
}

function isInsideTableCellAt(doc: ProseMirrorNode, pos: number): boolean {
  const $pos = doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth--) {
    if (isCellNode($pos.node(depth))) return true;
  }
  return false;
}

function parsePx(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = parseFloat(String(value));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** PDF dışa aktarımındaki (extractImageWidth) ile aynı öncelik: width attr, sonra containerStyle. */
export function getImageWidthAttr(attrs: Record<string, unknown>): number | null {
  const fromAttr = parsePx(attrs.width);
  if (fromAttr) return fromAttr;
  const match = String(attrs.containerStyle || '').match(/width:\s*([0-9.]+)px/i);
  return match ? parsePx(match[1]) : null;
}

function resolveImageSrc(attrs: Record<string, unknown>): string {
  const src = String(attrs.src || '');
  if (!src.startsWith('image:')) return src;
  const imageId = src.replace('image:', '');
  const accessToken = useAuthStore.getState().accessToken;
  return accessToken
    ? `${BASE_URL}/template-images/${imageId}?token=${encodeURIComponent(accessToken)}`
    : `${BASE_URL}/template-images/${imageId}`;
}

/**
 * Görselin sığabileceği en geniş alan: içinde bulunduğu hücrenin (yoksa sayfanın) içerik genişliği.
 * PDF'te de görsel "max-width: 100%" ile bu genişliğe sınırlanır.
 */
export function getImageMaxWidth(imageDom: HTMLElement | null, view: EditorView): number {
  const host = (imageDom?.closest('td, th') as HTMLElement | null) ?? (view.dom as HTMLElement);
  const style = getComputedStyle(host);
  const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
  const width = host.clientWidth - padding;
  return Math.max(IMAGE_MIN_WIDTH_PX, Math.floor(width > 0 ? width : 600));
}

function imageWidthAttrs(attrs: Record<string, unknown>, width: number) {
  const rounded = Math.max(IMAGE_MIN_WIDTH_PX, Math.round(width));
  return {
    ...attrs,
    width: rounded,
    height: null,
    // tiptap-extension-resize-image biçimi; eski kayıtlarla ve dışa aktarımla uyumlu kalsın
    containerStyle: `width: ${rounded}px; height: auto; cursor: pointer; display: inline-block;`,
  };
}

/**
 * Editördeki yerleşimi, PDF'in kullandığı aynı kuraldan (resolveImageExportAlignment +
 * prepareTemplateContentForExport) türetiyoruz ki ikisi aynı olsun.
 * DOM: wrapper > container > img (+ seçiliyken mutlak konumlu tutamaç katmanı; akışa girmez).
 */
function applyEditorImageLayout(
  dom: HTMLElement,
  container: HTMLElement,
  img: HTMLImageElement,
  attrs: Record<string, unknown>,
  insideTableCell: boolean
) {
  const align = resolveImageExportAlignment(attrs);
  img.removeAttribute('align');
  img.style.display = 'block';
  img.style.maxWidth = '100%';
  // Container tam satır kaplasın; görsel onun içinde margin ile hizalanır (PDF'teki <img> gibi).
  // position: relative yalnızca tutamaç katmanı için; yerleşimi etkilemez.
  container.style.cssText = 'display: block; width: auto; position: relative;';

  // Kutu yalnızca görsel kadar yer kaplasın (satır yüksekliği / taban çizgisi boşluğu olmasın),
  // PDF'teki çıplak <img> ile aynı yüksekliği versin.
  const reset = 'font-size: 0; line-height: 0;';

  if (insideTableCell) {
    // PDF: hücre içinde görsel float etmez, blok olarak hizalanır. Hizayı kanonik CSS'teki
    // ".doc-root td img[data-align]" / "td[style*=text-align] img" kuralları belirler.
    img.setAttribute('data-align', align);
    img.style.marginLeft = '';
    img.style.marginRight = '';
    const textAlign = align === 'center' || align === 'right' ? align : 'left';
    dom.style.cssText = `display: block; float: none; padding: 0; text-align: ${textAlign}; ${reset}`;
    return;
  }

  img.removeAttribute('data-align');
  img.style.marginLeft = align === 'center' ? 'auto' : '0';
  img.style.marginRight = align === 'center' ? 'auto' : '0';

  if (align === 'left') {
    dom.style.cssText = `display: inline-block; float: left; padding: 0 ${IMAGE_SIDE_GAP_PX}px 0 0; ${reset}`;
  } else if (align === 'right') {
    dom.style.cssText = `display: inline-block; float: right; padding: 0 0 0 ${IMAGE_SIDE_GAP_PX}px; ${reset}`;
  } else if (align === 'center') {
    dom.style.cssText = `display: block; float: none; clear: both; padding: 0; text-align: center; ${reset}`;
  } else {
    dom.style.cssText = 'display: inline-block; float: none; padding: 0;';
  }
}

const HANDLE_CORNERS = ['nw', 'ne', 'sw', 'se'] as const;
type HandleCorner = (typeof HANDLE_CORNERS)[number];

/**
 * Şablon görseli için NodeView:
 * - Tıklayınca seçilir; dört köşeden en-boy oranı korunarak boyutlandırılır (hücre/sayfa
 *   genişliğiyle sınırlı, canlı piksel göstergesiyle).
 * - Seçiliyken sürüklenerek başka bir hücreye / paragrafa taşınabilir (ProseMirror sürükle-bırak).
 */
class TemplateImageView implements NodeView {
  dom: HTMLElement;
  private container: HTMLElement;
  private img: HTMLImageElement;
  private overlay: HTMLElement;
  private badge: HTMLElement;
  private node: ProseMirrorNode;
  private view: EditorView;
  private getPos: () => number | undefined;
  private resizing = false;
  private resizeObserver: ResizeObserver | null = null;

  constructor(node: ProseMirrorNode, view: EditorView, getPos: () => number | undefined) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;

    // Önceki kütüphane ile aynı yapı (div > div > img); yerleşim ve sayfalama ölçümü değişmesin
    this.dom = document.createElement('div');
    this.dom.className = 'template-image';
    this.container = document.createElement('div');
    this.container.className = 'template-image__box';
    this.img = document.createElement('img');
    this.img.draggable = false;
    this.container.appendChild(this.img);

    this.overlay = document.createElement('span');
    this.overlay.className = 'template-image__overlay';
    this.overlay.contentEditable = 'false';
    for (const corner of HANDLE_CORNERS) {
      const handle = document.createElement('span');
      handle.className = `template-image__handle template-image__handle--${corner}`;
      handle.draggable = false;
      handle.addEventListener('pointerdown', (event) => this.startResize(event, corner));
      // Tutamaçtan başlayan hareket görseli sürüklemesin / ProseMirror seçimini bozmasın
      handle.addEventListener('mousedown', (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      handle.addEventListener('dragstart', (event) => event.preventDefault());
      this.overlay.appendChild(handle);
    }
    this.badge = document.createElement('span');
    this.badge.className = 'template-image__badge';
    this.overlay.appendChild(this.badge);
    this.container.appendChild(this.overlay);
    this.dom.appendChild(this.container);

    this.img.addEventListener('load', () => this.syncOverlay());
    this.render();
  }

  private insideTableCell(): boolean {
    const pos = this.getPos();
    if (typeof pos !== 'number') return false;
    try {
      return isInsideTableCellAt(this.view.state.doc, pos);
    } catch {
      return false;
    }
  }

  private render() {
    const attrs = this.node.attrs as Record<string, unknown>;
    const src = resolveImageSrc(attrs);
    if (this.img.getAttribute('src') !== src) this.img.setAttribute('src', src);
    this.img.alt = String(attrs.alt || '');
    const imageId = attrs['data-image-id'];
    if (imageId) this.img.setAttribute('data-image-id', String(imageId));
    else this.img.removeAttribute('data-image-id');

    const width = getImageWidthAttr(attrs);
    if (width) this.img.setAttribute('width', String(width));
    else this.img.removeAttribute('width');
    const height = parsePx(attrs.height);
    if (height) this.img.setAttribute('height', String(height));
    else this.img.removeAttribute('height');
    this.img.style.width = '';

    applyEditorImageLayout(this.dom, this.container, this.img, attrs, this.insideTableCell());
    this.syncOverlay();
  }

  /** Tutamaç katmanını görselin gerçek kutusuna oturtur (container tam satır olabilir). */
  private syncOverlay() {
    const { offsetLeft, offsetTop, offsetWidth, offsetHeight } = this.img;
    Object.assign(this.overlay.style, {
      left: `${offsetLeft}px`,
      top: `${offsetTop}px`,
      width: `${offsetWidth}px`,
      height: `${offsetHeight}px`,
    });
    this.badge.textContent = `${Math.round(offsetWidth)} px`;
  }

  private startResize(event: PointerEvent, corner: HandleCorner) {
    if (!this.view.editable) return;
    event.preventDefault();
    event.stopPropagation();
    // Tutamaç görselle birlikte hareket eder ve sınırda durur; imleç ondan çıkabildiği için
    // hareket/bırakma pencereden dinlenir (aksi halde bırakma kaçar, yeni boyut kaydedilmez).
    const win = this.view.dom.ownerDocument.defaultView ?? window;

    const startX = event.clientX;
    const startWidth = this.img.offsetWidth;
    const maxWidth = getImageMaxWidth(this.dom, this.view);
    // Sağa doğru büyüyen köşeler: ne/se; ortalanmış görselde iki yana büyüdüğü için çift hız
    const direction = corner === 'ne' || corner === 'se' ? 1 : -1;
    const centered = resolveImageExportAlignment(this.node.attrs) === 'center';
    const factor = centered ? 2 : 1;
    this.resizing = true;
    this.dom.classList.add('is-resizing');
    let nextWidth = startWidth;

    const onMove = (moveEvent: PointerEvent) => {
      const delta = (moveEvent.clientX - startX) * direction * factor;
      nextWidth = Math.min(maxWidth, Math.max(IMAGE_MIN_WIDTH_PX, startWidth + delta));
      this.img.style.width = `${Math.round(nextWidth)}px`;
      this.img.removeAttribute('height');
      this.syncOverlay();
    };
    const onUp = () => {
      win.removeEventListener('pointermove', onMove);
      win.removeEventListener('pointerup', onUp);
      win.removeEventListener('pointercancel', onUp);
      this.resizing = false;
      this.dom.classList.remove('is-resizing');
      const pos = this.getPos();
      if (typeof pos !== 'number' || Math.round(nextWidth) === Math.round(startWidth)) {
        this.render();
        return;
      }
      const tr = this.view.state.tr.setNodeMarkup(pos, undefined, imageWidthAttrs(this.node.attrs, nextWidth));
      tr.setSelection(NodeSelection.create(tr.doc, pos));
      this.view.dispatch(tr);
      this.view.focus();
    };
    win.addEventListener('pointermove', onMove);
    win.addEventListener('pointerup', onUp);
    win.addEventListener('pointercancel', onUp);
  }

  update(node: ProseMirrorNode) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    if (!this.resizing) this.render();
    return true;
  }

  selectNode() {
    this.dom.classList.add('ProseMirror-selectednode', 'is-selected');
    this.syncOverlay();
    if (!this.resizeObserver && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.syncOverlay());
      this.resizeObserver.observe(this.img);
      this.resizeObserver.observe(this.container);
    }
  }

  deselectNode() {
    this.dom.classList.remove('ProseMirror-selectednode', 'is-selected');
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }

  stopEvent(event: Event) {
    const target = event.target as Node | null;
    return !!target && this.overlay.contains(target) && target !== this.overlay;
  }

  ignoreMutation() {
    return true;
  }

  destroy() {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }
}

// ---------------------------------------------------------------------------
// Seçili görsel üzerinde komutlar (araç çubuğu + klavye kısayolları)
// ---------------------------------------------------------------------------

export function getSelectedImage(state: EditorState): { node: ProseMirrorNode; pos: number } | null {
  const { selection } = state;
  if (selection instanceof NodeSelection && isImageNode(selection.node)) {
    return { node: selection.node, pos: selection.from };
  }
  return null;
}

export function getSelectedImageMaxWidth(editor: Editor): number | null {
  const selected = getSelectedImage(editor.state);
  if (!selected) return null;
  const dom = editor.view.nodeDOM(selected.pos) as HTMLElement | null;
  return getImageMaxWidth(dom, editor.view);
}

/** Seçili görselin ekrandaki gerçek genişliği (genişlik verilmemişse doğal boyutu). */
export function getSelectedImageDisplayWidth(editor: Editor): number | null {
  const selected = getSelectedImage(editor.state);
  if (!selected) return null;
  const attrWidth = getImageWidthAttr(selected.node.attrs);
  if (attrWidth) return Math.round(attrWidth);
  const dom = editor.view.nodeDOM(selected.pos) as HTMLElement | null;
  const img = dom?.querySelector('img');
  return img ? Math.round(img.offsetWidth) : null;
}

export function setSelectedImageWidth(editor: Editor, width: number): boolean {
  const selected = getSelectedImage(editor.state);
  if (!selected) return false;
  const max = getSelectedImageMaxWidth(editor) ?? width;
  const clamped = Math.min(max, Math.max(IMAGE_MIN_WIDTH_PX, width));
  const tr = editor.state.tr.setNodeMarkup(selected.pos, undefined, imageWidthAttrs(selected.node.attrs, clamped));
  tr.setSelection(NodeSelection.create(tr.doc, selected.pos));
  editor.view.dispatch(tr);
  return true;
}

export function resizeSelectedImageBy(editor: Editor, delta: number): boolean {
  const current = getSelectedImageDisplayWidth(editor);
  if (current == null) return false;
  return setSelectedImageWidth(editor, current + delta);
}

function findCellContext(state: EditorState, pos: number) {
  const $pos = state.doc.resolve(pos);
  let cellDepth = -1;
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (cellDepth < 0 && isCellNode(node)) cellDepth = depth;
    if (node.type.name === 'table') {
      if (cellDepth < 0) return null;
      const table = node;
      const tableStart = $pos.start(depth);
      const cells: number[] = [];
      table.descendants((child, offset) => {
        if (isCellNode(child)) {
          cells.push(tableStart + offset);
          return false;
        }
        return true;
      });
      return { cells, cellPos: $pos.before(cellDepth) };
    }
  }
  return null;
}

export function canMoveSelectedImageToCell(state: EditorState, direction: 1 | -1): boolean {
  const selected = getSelectedImage(state);
  if (!selected) return false;
  const ctx = findCellContext(state, selected.pos);
  if (!ctx) return false;
  const index = ctx.cells.indexOf(ctx.cellPos);
  return index >= 0 && ctx.cells[index + direction] !== undefined;
}

/** Seçili görseli tablonun önceki/sonraki hücresinin başına taşır (logo düzenleri için). */
export function moveSelectedImageToCell(editor: Editor, direction: 1 | -1): boolean {
  const { state } = editor;
  const selected = getSelectedImage(state);
  if (!selected) return false;
  const ctx = findCellContext(state, selected.pos);
  if (!ctx) return false;
  const index = ctx.cells.indexOf(ctx.cellPos);
  const targetCell = ctx.cells[index + direction];
  if (index < 0 || targetCell === undefined) return false;

  const tr: Transaction = state.tr.delete(selected.pos, selected.pos + selected.node.nodeSize);
  const cellPos = tr.mapping.map(targetCell);
  const cell = tr.doc.nodeAt(cellPos);
  if (!cell) return false;

  let insertPos: number;
  const first = cell.firstChild;
  if (first && first.isTextblock) {
    insertPos = cellPos + 2;
    tr.insert(insertPos, selected.node);
  } else {
    const paragraph = state.schema.nodes.paragraph.create(null, selected.node);
    tr.insert(cellPos + 1, paragraph);
    insertPos = cellPos + 2;
  }
  tr.setSelection(NodeSelection.create(tr.doc, insertPos));
  tr.scrollIntoView();
  editor.view.dispatch(tr);
  editor.view.focus();
  return true;
}

export function setSelectedImageAlign(editor: Editor, align: 'left' | 'center' | 'right' | 'none'): boolean {
  const selected = getSelectedImage(editor.state);
  if (!selected) return false;
  const tr = editor.state.tr.setNodeMarkup(selected.pos, undefined, { ...selected.node.attrs, align });
  tr.setSelection(NodeSelection.create(tr.doc, selected.pos));
  editor.view.dispatch(tr);
  return true;
}

// Custom Image extension that handles image:ImageId format
export const CustomImage = ImageResize.extend({
  draggable: true,
  selectable: true,
  addNodeView() {
    return ({ node, editor, getPos }) =>
      new TemplateImageView(node, editor.view, getPos as () => number | undefined);
  },
  addKeyboardShortcuts() {
    const editor = this.editor as unknown as Editor;
    return {
      ...(this.parent?.() ?? {}),
      'Alt-ArrowRight': () => moveSelectedImageToCell(editor, 1),
      'Alt-ArrowLeft': () => moveSelectedImageToCell(editor, -1),
      'Alt-ArrowUp': () => resizeSelectedImageBy(editor, IMAGE_SIZE_STEP_PX),
      'Alt-ArrowDown': () => resizeSelectedImageBy(editor, -IMAGE_SIZE_STEP_PX),
    };
  },
  addAttributes() {
    return {
      ...this.parent?.(),
      src: {
        default: null,
        parseHTML: (element) => {
          const src = element.getAttribute('src');
          const imageId = element.getAttribute('data-image-id');
          if (imageId) {
            return `image:${imageId}`;
          }
          return src;
        },
        renderHTML: (attributes) => {
          if (!attributes.src) {
            return {};
          }

          if (attributes.src.startsWith('image:')) {
            const imageId = attributes.src.replace('image:', '');
            return {
              src: resolveImageSrc(attributes),
              'data-image-id': imageId,
              alt: attributes.alt || '',
            };
          }

          return {
            src: attributes.src,
            alt: attributes.alt || '',
          };
        },
      },
      'data-image-id': {
        default: null,
        parseHTML: (element) => element.getAttribute('data-image-id'),
        renderHTML: (attributes) => {
          if (!attributes['data-image-id']) {
            return {};
          }
          return {
            'data-image-id': attributes['data-image-id'],
          };
        },
      },
      alt: {
        default: null,
      },
      align: {
        default: 'none',
        parseHTML: (element) => element.getAttribute('data-align') || element.style.float || 'none',
        renderHTML: (attributes) => {
          if (attributes.align === 'left') {
            return {
              'data-align': 'left',
              style: 'float: left; margin-right: 1.5rem; margin-bottom: 0.5rem;',
            };
          }
          if (attributes.align === 'right') {
            return {
              'data-align': 'right',
              style: 'float: right; margin-left: 1.5rem; margin-bottom: 0.5rem;',
            };
          }
          if (attributes.align === 'center') {
            return {
              'data-align': 'center',
              style: 'display: block; margin-left: auto; margin-right: auto; clear: both;',
            };
          }
          return {
            'data-align': 'none',
            style: 'display: inline-block; clear: both;',
          };
        },
      },
    };
  },
}).configure({
  allowBase64: true,
  inline: true,
});
