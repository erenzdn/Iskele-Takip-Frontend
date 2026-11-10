import { Extension } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';

/** Tab girintisi: 4 bölünmez boşluk. PDF'te de aynı karakterler olduğu için genişlik birebir aynı. */
export const TAB_INDENT = '    ';

/**
 * Editörde Tab tuşu odağı araç çubuğuna / alan paneline kaçırmasın.
 * Öncelik düşük: tablo (hücreler arası gezinme) ve liste (iç içe alma) kısayolları önce çalışır;
 * onlar işlemezse Tab girinti ekler, Shift+Tab imleçten önceki girintiyi kaldırır.
 */
export const EditorTabKey = Extension.create({
  name: 'editorTabKey',
  priority: 10,

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        const { state } = this.editor;
        // Seçili görsel vb. düğümün üzerine boşluk yazılıp silinmesin
        if (state.selection instanceof NodeSelection) return true;
        if (!state.selection.$from.parent.isTextblock) return true;
        return this.editor.chain().insertContent(TAB_INDENT).run() || true;
      },
      'Shift-Tab': () => {
        const { state } = this.editor;
        const { $from, empty } = state.selection;
        if (!empty || !$from.parent.isTextblock) return true;
        const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼');
        const match = before.match(/ {1,4}$/);
        if (match) {
          const from = $from.pos - match[0].length;
          this.editor.view.dispatch(state.tr.delete(from, $from.pos));
        }
        return true;
      },
    };
  },
});
