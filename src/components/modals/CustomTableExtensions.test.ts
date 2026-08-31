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

  it('paragraf text-align center olsa bile varsayılan olarak sola hizalar', () => {
    expect(
      resolveImageExportAlignment({
        align: 'none',
        wrapperStyle: '',
        containerStyle: 'width: 150px; height: auto; cursor: pointer;',
      })
    ).toBe('left');
  });
});

describe('prepareTemplateContentForExport', () => {
  it('ortalanmış paragraftaki logoyu PDF için sola hizalar', () => {
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
      content: Array<{ content?: Array<{ attrs?: Record<string, unknown> }> }>;
    };

    const image = exported.content[0].content?.[0]?.attrs;
    expect(image?.align).toBe('left');
    expect(String(image?.style)).toContain('float: left');
    expect(image?.src).toBe('image:42');
  });
});
