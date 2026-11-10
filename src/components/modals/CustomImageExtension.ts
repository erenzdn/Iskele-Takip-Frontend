import ImageResize from 'tiptap-extension-resize-image';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';
import { useAuthStore } from '../../store/authStore';
import { resolveImageExportAlignment } from './CustomTableExtensions';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

/** Yanlara yaslı görsel ile metin arası boşluk — PDF tarafı (documentGenerator) ile aynı. */
export const IMAGE_SIDE_GAP_PX = 8;

function isInsideTableCell(view: EditorView, getPos: unknown): boolean {
  if (typeof getPos !== 'function') return false;
  const pos = getPos();
  if (typeof pos !== 'number') return false;
  const $pos = view.state.doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth--) {
    const name = $pos.node(depth).type.name;
    if (name === 'tableCell' || name === 'tableHeader') return true;
  }
  return false;
}

/**
 * tiptap-extension-resize-image, görseli wrapper > container > img olarak çizer ve hizayı
 * kendi wrapperStyle'ından alır (varsayılan: her zaman sola float). Araç çubuğundaki "align"
 * ise yalnızca PDF'e yansıyordu. Editördeki yerleşimi, PDF'in kullandığı aynı kuraldan
 * (resolveImageExportAlignment + prepareTemplateContentForExport) türetiyoruz ki ikisi aynı olsun.
 */
function applyEditorImageLayout(
  dom: HTMLElement,
  attrs: Record<string, unknown>,
  insideTableCell: boolean
) {
  const container = dom.firstElementChild as HTMLElement | null;
  const img = dom.querySelector('img');
  if (!container || !img) return;

  const align = resolveImageExportAlignment(attrs);
  img.removeAttribute('align');
  img.style.display = 'block';
  img.style.maxWidth = '100%';
  // Container tam satır kaplasın; görsel onun içinde margin ile hizalanır (PDF'teki <img> gibi)
  container.style.display = 'block';
  container.style.width = 'auto';

  // Kutu yalnızca görsel kadar yer kaplasın (satır yüksekliği / taban çizgisi boşluğu olmasın),
  // PDF'teki çıplak <img> ile aynı yüksekliği versin. Kütüphane tıklamada container stilini
  // yeniden yazdığından wrapper'a da text-align veriyoruz (seçiliyken de yerinde kalsın).
  const reset = 'font-size: 0; line-height: 0;';

  if (insideTableCell) {
    // PDF: hücre içinde görsel float etmez, blok olarak hizalanır. Hizayı kanonik CSS'teki
    // ".doc-root td img[data-align]" / "td[style*=text-align] img" kuralları belirler; aynı
    // kuralların editörde de işlemesi için data-align veriyoruz, satır içi margin vermiyoruz.
    img.setAttribute('data-align', align);
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

// Custom Image extension that handles image:ImageId format
export const CustomImage = ImageResize.extend({
  draggable: true,
  addNodeView() {
    const parentFactory = this.parent?.();
    if (!parentFactory) return null;
    return (props: { node: ProseMirrorNode; getPos: unknown; editor: { view: EditorView } }) => {
      const nodeView = (parentFactory as (p: typeof props) => { dom: HTMLElement })(props);
      if (props.editor.view.editable) {
        applyEditorImageLayout(
          nodeView.dom,
          props.node.attrs,
          isInsideTableCell(props.editor.view, props.getPos)
        );
      }
      return nodeView;
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
            // Zustand store'dan accessToken al (memory-only)
            const accessToken = useAuthStore.getState().accessToken;
            const imageUrl = accessToken
              ? `${BASE_URL}/template-images/${imageId}?token=${encodeURIComponent(accessToken)}`
              : `${BASE_URL}/template-images/${imageId}`;
            
            return {
              src: imageUrl,
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
