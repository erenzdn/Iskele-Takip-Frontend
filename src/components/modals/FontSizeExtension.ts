import { Extension, type Editor } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (fontSize: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
  }
}

export const FONT_SIZE_OPTIONS = [
  { value: '8px', label: '8' },
  { value: '9px', label: '9' },
  { value: '10px', label: '10' },
  { value: '11px', label: '11' },
  { value: '12px', label: '12' },
  { value: '14px', label: '14' },
  { value: '16px', label: '16' },
  { value: '18px', label: '18' },
  { value: '20px', label: '20' },
  { value: '24px', label: '24' },
  { value: '28px', label: '28' },
  { value: '32px', label: '32' },
  { value: '36px', label: '36' },
  { value: '48px', label: '48' },
  { value: '72px', label: '72' },
];

export const FontSize = Extension.create({
  name: 'fontSize',

  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element: HTMLElement) => element.style.fontSize || null,
            renderHTML: (attributes: { fontSize?: string | null }) => {
              if (!attributes.fontSize) return {};
              return { style: `font-size: ${attributes.fontSize}` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setFontSize:
        (fontSize: string) =>
        ({ chain }) =>
          chain().setMark('textStyle', { fontSize }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain().setMark('textStyle', { fontSize: null }).run(),
    };
  },
});

export function getActiveFontSize(editor: Editor) {
  const directValue = editor.getAttributes('textStyle').fontSize;
  if (typeof directValue === 'string') {
    return normalizeFontSize(directValue);
  }

  const { from, to } = editor.state.selection;
  let selectedValue = '';
  editor.state.doc.nodesBetween(from, Math.max(from, to), (node) => {
    if (selectedValue || !node.isText) return;
    const mark = node.marks.find((item) => item.type.name === 'textStyle');
    const value = mark?.attrs.fontSize;
    if (typeof value === 'string') {
      selectedValue = normalizeFontSize(value);
    }
  });
  return selectedValue || '16px';
}

function normalizeFontSize(value: string) {
  const match = value.trim().match(/^([0-9]+(?:\.[0-9]+)?)(px|pt)$/i);
  if (!match) return '';
  const number = Number(match[1]);
  const pixels = match[2].toLowerCase() === 'pt' ? (number * 96) / 72 : number;
  return `${Math.round(pixels)}px`;
}