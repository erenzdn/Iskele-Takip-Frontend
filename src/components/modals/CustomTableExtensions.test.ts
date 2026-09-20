import { describe, expect, it } from 'vitest';
import {
  prepareTemplateContentForExport,
  resolveImageExportAlignment,
} from './CustomTableExtensions';

describe('resolveImageExportAlignment', () => {
  it('toolbar ile verilen hizayı kullanır', () => {
    expect(resolveImageExportAlignment({ align: 'center' })).toBe('center');
    expect(resolveImageExportAlignment({ align: 'left' })).toBe('left');
  });

  it('wrapper float:left değerini sol hizalama sayar', () => {
    expect(
      resolveImageExportAlignment({
        align: 'none',
        wrapperStyle: 'display: inline-block; float: left; padding-right: 8px;',
      })
    ).toBe('left');
  });

  it('hiçbir hizalama bilgisi yoksa "none" döner (paragrafın kendi hizasına uyar)', () => {
    expect(
      resolveImageExportAlignment({
        align: 'none',
        wrapperStyle: '',
        containerStyle: 'width: 150px; height: auto; cursor: pointer;',
      })
    ).toBe('none');
  });
});

describe('prepareTemplateContentForExport', () => {
  it('hizası belirtilmemiş logoyu sola zorlamaz, ata paragrafın hizasını değiştirmez', () => {
    const content = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { textAlign: 'center' },
          content: [
            {
              type: 'imageResize',
              attrs: {
                src: 'blob:local',
                width: 150,
                align: 'none',
                'data-image-id': '42',
              },
            },
          ],
        },
        {
          type: 'heading',
          attrs: { level: 1, textAlign: 'center' },
          content: [{ type: 'text', text: 'KİRALAMA SÖZLEŞMESİ' }],
        },
      ],
    };

    const exported = prepareTemplateContentForExport(content) as {
      content: Array<{ attrs?: Record<string, unknown>; content?: Array<{ attrs?: Record<string, unknown> }> }>;
    };

    const paragraph = exported.content[0];
    const image = paragraph.content?.[0]?.attrs;
    expect(image?.align).toBe('none');
    expect(String(image?.style)).toContain('display: inline-block');
    expect(image?.src).toBe('image:42');
    // Editörde görüldüğü gibi paragrafın kendi hizası korunur, export sırasında değiştirilmez
    expect(paragraph.attrs?.textAlign).toBe('center');
  });

  it('açıkça sola hizalanmış logoyu float: left ile dışa aktarır', () => {
    const content = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'imageResize',
              attrs: {
                src: 'blob:local',
                width: 150,
                align: 'left',
                'data-image-id': '42',
              },
            },
          ],
        },
      ],
    };

    const exported = prepareTemplateContentForExport(content) as {
      content: Array<{ content?: Array<{ attrs?: Record<string, unknown> }> }>;
    };

    const image = exported.content[0].content?.[0]?.attrs;
    expect(image?.align).toBe('left');
    expect(String(image?.style)).toContain('float: left');
    expect(image?.src).toBe('image:42');
  });
});
