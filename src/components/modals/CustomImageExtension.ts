import ImageResize from 'tiptap-extension-resize-image';
import { useAuthStore } from '../../store/authStore';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

// Custom Image extension that handles image:ImageId format
export const CustomImage = ImageResize.extend({
  draggable: true,
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
