import { describe, expect, it } from 'vitest';
import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { EditorState, TextSelection, type Plugin } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import {
  EditorWidgetPreview,
  editorWidgetPreviewPluginKey,
  getHiddenPlaceholderRanges,
  getPreviewSplits,
  previewSplitsEqual,
} from './EditorWidgetPreviewExtension';

const schema = getSchema([StarterKit]);

function createPlugin(): Plugin {
  const factory = EditorWidgetPreview.config.addProseMirrorPlugins as unknown as (this: unknown) => Plugin[];
  return factory.call({ options: { context: 'contract', getSample: undefined } })[0];
}

function stateWith(text: string): EditorState {
  const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text(text)])]);
  return EditorState.create({ doc, plugins: [createPlugin()] });
}

/** Paragraf içindeki metin konumu → belge konumu (paragraf 0'da başlar, içerik 1'de) */
const at = (index: number) => 1 + index;

describe('EditorWidgetPreview — alan kaynağı', () => {
  const text = "Kiracı {{musteriAdi}}'nin sorumluluğundadır.";
  const from = at(text.indexOf('{{'));
  const to = at(text.indexOf('}}') + 2);

  it('önizlenen alanın gizli kaynak aralığını verir', () => {
    const state = stateWith(text);
    expect(getHiddenPlaceholderRanges(state, 0, state.doc.content.size)).toEqual([{ from, to }]);
  });

  it('örnek veride olmayan alanı gizlemez (ham metin PDF ile aynı kalır)', () => {
    const state = stateWith('Bilinmeyen {{yokBoyleAlan}} alanı');
    expect(getHiddenPlaceholderRanges(state, 0, state.doc.content.size)).toEqual([]);
  });

  it('imleç gizli kaynağın içine düşerse alanın sonuna taşınır', () => {
    let state = stateWith(text);
    const result = state.applyTransaction(state.tr.setSelection(TextSelection.create(state.doc, from + 3)));
    state = result.state;
    expect(state.selection.from).toBe(to);
  });

  it('Backspace (alan sonunda) ve Delete (alan başında) alanı bütün olarak siler', () => {
    for (const [key, pos] of [
      ['Backspace', to],
      ['Delete', from],
    ] as const) {
      let state = stateWith(text);
      state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, pos)));
      const view = {
        get state() {
          return state;
        },
        dispatch(tr: Parameters<EditorState['apply']>[0]) {
          state = state.apply(tr);
        },
      } as unknown as EditorView;
      const plugin = editorWidgetPreviewPluginKey.get(state)!;
      const handled = plugin.props.handleKeyDown!.call(plugin, view, new KeyboardEventStub(key) as KeyboardEvent);
      expect(handled).toBe(true);
      expect(state.doc.textContent).toBe("Kiracı 'nin sorumluluğundadır.");
    }
  });

  it('alanın içinde olmayan Backspace normal davranır', () => {
    const state = stateWith(text);
    const moved = state.apply(state.tr.setSelection(TextSelection.create(state.doc, at(3))));
    const plugin = editorWidgetPreviewPluginKey.get(moved)!;
    const view = { state: moved, dispatch: () => {} } as unknown as EditorView;
    expect(plugin.props.handleKeyDown!.call(plugin, view, new KeyboardEventStub('Backspace') as KeyboardEvent)).toBe(
      false
    );
  });
});

describe('EditorWidgetPreview — sayfa aralığının alan değerinin içine konması', () => {
  it('sayfalamanın bildirdiği bölme meta ile saklanır ve belge değişince konumu kayar', () => {
    let state = stateWith('Tutar {{toplamTutar}} olarak ödenir.');
    const from = at('Tutar '.length);
    const splits = [{ from, offset: 10, height: 120 }];
    state = state.apply(state.tr.setMeta(editorWidgetPreviewPluginKey, { previewSplits: splits }));
    expect(getPreviewSplits(state)).toEqual(splits);

    state = state.apply(state.tr.insertText('Toplam ', at(0)));
    expect(getPreviewSplits(state)).toEqual([{ from: from + 'Toplam '.length, offset: 10, height: 120 }]);
  });

  it('previewSplitsEqual alt piksel yükseklik farkını eşit sayar', () => {
    expect(previewSplitsEqual([{ from: 5, offset: 3, height: 100 }], [{ from: 5, offset: 3, height: 100.2 }])).toBe(true);
    expect(previewSplitsEqual([{ from: 5, offset: 3, height: 100 }], [{ from: 5, offset: 4, height: 100 }])).toBe(false);
  });
});

class KeyboardEventStub {
  ctrlKey = false;
  metaKey = false;
  altKey = false;
  shiftKey = false;
  constructor(public key: string) {}
}
