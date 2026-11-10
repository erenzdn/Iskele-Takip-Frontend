import { describe, expect, it } from 'vitest';
import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TableRow } from '@tiptap/extension-table-row';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { addColumnAfter, deleteColumn } from '@tiptap/pm/tables';
import { CustomTable, CustomTableCell, CustomTableHeader } from './CustomTableExtensions';
import {
  completePercents,
  createLayoutTablePlugin,
  getRawColumnPercents,
  getStyleProp,
  percentsAfterDrag,
  resizeColumn,
  roundPercents,
  setStyleProp,
} from './LayoutTable';
import { HEADER_PRESETS, buildDataTable, buildLayoutTable } from './LayoutPresets';

const schema = getSchema([StarterKit, CustomTable, TableRow, CustomTableCell, CustomTableHeader]);

function stateWith(table: Record<string, unknown>) {
  const doc = schema.nodeFromJSON({ type: 'doc', content: [table, { type: 'paragraph' }] });
  return EditorState.create({ doc, plugins: [createLayoutTablePlugin()] });
}

/** İmleci ilk satırın `col` sıradaki hücresine koyar */
function inCell(state: EditorState, col: number) {
  let target = -1;
  let index = 0;
  state.doc.descendants((node, pos) => {
    if (target >= 0) return false;
    if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
      if (index === col) target = pos + 2;
      index += 1;
      return false;
    }
    return true;
  });
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, target)));
}

function percentsOf(state: EditorState) {
  return getRawColumnPercents(state.doc.firstChild!);
}

describe('stil yardımcıları', () => {
  it('bildirimi değiştirir, min-width ile karıştırmaz', () => {
    const style = setStyleProp('min-width: 20px; width: 30%;', 'width', '40%');
    expect(style).toBe('min-width: 20px; width: 40%;');
    expect(getStyleProp(style, 'width')).toBe('40%');
    expect(setStyleProp('width: 30%;', 'width', null)).toBeNull();
  });

  it('PDF CSS seçicisinin beklediği "text-align: right" biçimini üretir', () => {
    expect(setStyleProp(null, 'text-align', 'right')).toBe('text-align: right;');
  });
});

describe('yüzde hesapları', () => {
  it('toplamı tam 100 yapar', () => {
    const p = roundPercents([1, 1, 1]);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6);
  });

  it('sütun büyüyünce yalnızca komşusu küçülür', () => {
    expect(resizeColumn([25, 50, 25], 0, 35)).toEqual([35, 40, 25]);
    // son sütunda soldaki komşu karşılar
    expect(resizeColumn([25, 50, 25], 2, 30)).toEqual([25, 45, 30]);
  });

  it('en küçük genişliğin altına inmez', () => {
    expect(resizeColumn([30, 70], 0, 99)).toEqual([95, 5]);
  });

  it('sürüklenen px genişliği yüzdeye çevirir', () => {
    expect(percentsAfterDrag([30, 70], 0, 350, 700)).toEqual([50, 50]);
  });

  it('eksik sütuna eşit pay verip diğerlerini ölçekler', () => {
    const p = completePercents([30, 70, null]);
    expect(p[2]).toBeCloseTo(33.3, 1);
    expect(p[0] / p[1]).toBeCloseTo(30 / 70, 1);
  });
});

describe('düzen tablosu eklentisi', () => {
  it('sütun eklenince genişlikler yeniden dağıtılır (yeni sütun ezilmez)', () => {
    let state = inCell(stateWith(buildLayoutTable([30, 70], [])), 1);
    addColumnAfter(state, (tr) => {
      state = state.apply(tr);
    });
    const p = percentsOf(state);
    expect(p).toHaveLength(3);
    expect(p.every((v) => v != null && v >= 5)).toBe(true);
    expect(p.reduce<number>((a, b) => a + (b ?? 0), 0)).toBeCloseTo(100, 1);
  });

  it('sütun silinince kalanlar sayfa genişliğini doldurur', () => {
    let state = inCell(stateWith(buildLayoutTable([25, 50, 25], [])), 1);
    deleteColumn(state, (tr) => {
      state = state.apply(tr);
    });
    expect(percentsOf(state)).toEqual([50, 50]);
  });

  it('px colwidth içeren eski tablolara dokunmaz', () => {
    const table = buildDataTable(1, 2) as { content: { content: { attrs: Record<string, unknown> }[] }[] };
    for (const cell of table.content[0].content) {
      cell.attrs.style = 'width: 10%;';
      cell.attrs.colwidth = [120];
    }
    const state = stateWith(table);
    const next = state.apply(state.tr.insertText('x', state.doc.content.size - 1));
    expect(percentsOf(next)).toEqual([10, 10]);
  });
});

describe('hazır düzenler', () => {
  it('her başlık düzeni şemaya uygun ve %100 genişlikte', () => {
    for (const preset of HEADER_PRESETS) {
      const json = preset.build({ documentNumberKey: 'teklifNo', documentNumberLabel: 'Teklif No' });
      const node = schema.nodeFromJSON(json);
      node.check();
      expect(node.attrs.noBorder).toBe(true);
      const sum = getRawColumnPercents(node).reduce<number>((a, b) => a + (b ?? 0), 0);
      expect(sum).toBeCloseTo(100, 6);
    }
  });

  it('logo sağdaki düzende logo hücresi sağa yaslı', () => {
    const preset = HEADER_PRESETS.find((p) => p.id === 'title-logo')!;
    const node = schema.nodeFromJSON(
      preset.build({ documentNumberKey: 'teklifNo', documentNumberLabel: 'Teklif No' })
    );
    const logoCell = node.firstChild!.child(preset.logoCell!);
    expect(getStyleProp(logoCell.attrs.style, 'text-align')).toBe('right');
  });
});
