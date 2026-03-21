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
          // If it has data-image-id, return image:ImageId format
          if (imageId) {
            return `image:${imageId}`;
          }
          return src;
        },
        renderHTML: (attributes) => {
          if (!attributes.src) {
            return {};
          }

          // If it's in image:ImageId format, convert to API URL with token
          if (attributes.src.startsWith('image:')) {
            const imageId = attributes.src.replace('image:', '');
            const token = localStorage.getItem('auth_token');
            // Use token in URL as query parameter (backend should support this)
            // Or use a data attribute and handle it with JavaScript
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
      alt: {
        default: null,
      },
    };
  },
}).configure({
  allowBase64: true,
  inline: false,
});
