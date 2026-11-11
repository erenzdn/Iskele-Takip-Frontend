import { createElement as h, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { TableLayout } from '../utils/tableLayout';

type DataTableType = typeof import('./DataTable').default;

/**
 * Sunucu render'ında zustand mağazanın başlangıç durumunu okur; bu yüzden her senaryoda
 * düzeni localStorage'a yazıp modülleri yeniden yükleyerek gerçek başlangıç akışını kullanırız.
 */
async function render(
  layouts: Record<string, TableLayout>,
  build: (DataTable: DataTableType) => ReturnType<typeof h>
) {
  vi.resetModules();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: () => JSON.stringify(layouts),
    setItem: () => undefined,
  };
  const { default: DataTable } = await import('./DataTable');
  return renderToStaticMarkup(build(DataTable));
}

function Row({ cells }: { cells: string[] }) {
  return h('tr', null, ...cells.map((c) => h('td', { key: c }, c)));
}

const table = (body: ReturnType<typeof h>[]) => (DataTable: DataTableType) =>
  h(
    DataTable,
    { tableId: 't' },
    h('thead', null, h('tr', null, h('th', null, 'A'), h('th', null, 'B'), h('th', null, 'C'))),
    h('tbody', null, ...body)
  );

const cellTexts = (html: string, tag: 'th' | 'td') =>
  Array.from(html.matchAll(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'g'))).map((m) => m[1]);

describe('DataTable', { timeout: 30_000 }, () => {
  it('düzen yokken sırayı korur ve başlıkları sürüklenebilir yapar', async () => {
    const html = await render({}, table([h('tr', { key: 1 }, h('td', null, '1'), h('td', null, '2'), h('td', null, '3'))]));
    expect(cellTexts(html, 'th')).toEqual(['A', 'B', 'C']);
    expect(cellTexts(html, 'td')).toEqual(['1', '2', '3']);
    expect(html).toContain('draggable="true"');
    expect(html).toContain('ct-table');
  });

  it('kayıtlı sırayı başlığa ve satırlara (fragment içindekiler dahil) uygular; tam genişlik satırına dokunmaz', async () => {
    const html = await render({ t: { order: ['C', 'A', 'B'], widths: {} } },
      table([
        h('tr', { key: 1 }, h('td', null, '1'), false, h('td', null, '2'), h('td', null, '3')),
        h(Fragment, { key: 'f' }, h('tr', null, h(Fragment, null, h('td', null, 'x'), h('td', null, 'y')), h('td', null, 'z'))),
        h('tr', { key: 'e' }, h('td', { colSpan: 3 }, 'boş')),
      ])
    );
    expect(cellTexts(html, 'th')).toEqual(['C', 'A', 'B']);
    expect(cellTexts(html, 'td')).toEqual(['3', '1', '2', 'z', 'x', 'y', 'boş']);
  });

  it('satır özel bileşense sıralamayı uygulamaz (hizalama bozulmasın)', async () => {
    const html = await render({ t: { order: ['C', 'A', 'B'], widths: {} } }, table([h(Row, { key: 1, cells: ['1', '2', '3'] })]));
    expect(cellTexts(html, 'th')).toEqual(['A', 'B', 'C']);
    expect(cellTexts(html, 'td')).toEqual(['1', '2', '3']);
  });

  it('kısmi colSpan içeren satır varsa sıralamayı uygulamaz', async () => {
    const html = await render({ t: { order: ['C', 'A', 'B'], widths: {} } },
      table([h('tr', { key: 1 }, h('td', { colSpan: 2 }, 'Toplam'), h('td', null, '9'))])
    );
    expect(cellTexts(html, 'th')).toEqual(['A', 'B', 'C']);
    expect(html).toContain('draggable="false"');
    expect(html).toContain('ct-th-static');
  });

  it('kayıtlı genişliklerle sabit düzen ve piksel genişlik uygular', async () => {
    const html = await render({ t: { order: [], widths: { A: 100, B: 50 } } }, table([]));
    expect(html).toContain('table-layout:fixed');
    expect(html).toContain('width:260px'); // 100 + 50 + 110 (ölçülmemiş C)
    expect(html).toMatch(/<th[^>]*style="width:100px"[^>]*>A<\/th>/);
    expect(html).toContain('ct-custom');
  });

  it('birden fazla başlık satırı veya colSpan başlıkta özelliği devre dışı bırakır', async () => {
    const html = await render({}, (DataTable) =>
      h(
        DataTable,
        { tableId: 't' },
        h('thead', null, h('tr', null, h('th', { colSpan: 2 }, 'Grup')), h('tr', null, h('th', null, 'A'), h('th', null, 'B')))
      )
    );
    expect(html).not.toContain('draggable');
    expect(html).not.toContain('ct-table');
  });
});
