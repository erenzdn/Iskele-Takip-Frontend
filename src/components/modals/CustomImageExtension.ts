import Image from '@tiptap/extension-image';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

// Custom Image extension that handles image:ImageId format
export const CustomImage = Image.extend({
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
            const token = localStorage.getItem('auth_token');
            const imageUrl = token
              ? `${BASE_URL}/template-images/${imageId}?token=${encodeURIComponent(token)}`
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
    };
  },
}).configure({
  allowBase64: true,
  inline: false,
});
