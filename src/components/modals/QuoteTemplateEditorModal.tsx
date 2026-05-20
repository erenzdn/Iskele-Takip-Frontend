import { useState, useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TextAlign } from '@tiptap/extension-text-align';
import { Underline } from '@tiptap/extension-underline';
import { QuoteTemplate, TemplateImage } from '../../models';
import { quoteTemplateService } from '../../services/quoteTemplateService';
import { templateImageService } from '../../services/templateImageService';
import { getApiErrorMessage } from '../../utils/apiError';
import { toast } from '../../hooks/useToast';
import { CustomImage } from './CustomImageExtension';
import PdfPreviewModal from './PdfPreviewModal';

const CustomTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: 'left',
        parseHTML: element => element.getAttribute('align') || 'left',
        renderHTML: attributes => {
          if (attributes.align === 'center') {
            return {
              align: 'center',
              style: 'margin-left: auto !important; margin-right: auto !important; margin-top: 1rem !important; margin-bottom: 1rem !important;',
            };
          }
          if (attributes.align === 'right') {
            return {
              align: 'right',
              style: 'margin-left: auto !important; margin-right: 0 !important; margin-top: 1rem !important; margin-bottom: 1rem !important;',
            };
          }
          return {
            align: 'left',
            style: 'margin-right: auto !important; margin-left: 0 !important; margin-top: 1rem !important; margin-bottom: 1rem !important;',
          };
        },
      },
      noBorder: {
        default: false,
        parseHTML: element => element.classList.contains('border-none') || element.getAttribute('data-no-border') === 'true',
        renderHTML: attributes => {
          if (attributes.noBorder) {
            return {
              class: 'border-none',
              'data-no-border': 'true',
            };
          }
          return {};
        },
      },
    };
  },
});

interface QuoteTemplateEditorModalProps {
  template: QuoteTemplate | null;
  isNew: boolean;
  onClose: () => void;
  onSave?: (templateId: number) => void;
}

const PLACEHOLDERS = {
  musteri: [
    { key: 'musteriAdi', label: 'Müşteri Adı' },
    { key: 'musteriAdres', label: 'Müşteri Adres' },
    { key: 'musteriTelefon', label: 'Müşteri Telefon' },
    { key: 'musteriEmail', label: 'Müşteri Email' },
    { key: 'musteriVergiNo', label: 'Müşteri Vergi No' },
  ],
  santiye: [
    { key: 'santiyeAdi', label: 'Şantiye Adı' },
    { key: 'santiyeAdres', label: 'Şantiye Adres' },
  ],
  teklif: [
    { key: 'teklifNo', label: 'Teklif No' },
    { key: 'teklifKodu', label: 'Teklif Kodu' },
    { key: 'baslangicTarihi', label: 'Başlangıç Tarihi' },
    { key: 'bitisTarihi', label: 'Bitiş Tarihi' },
    { key: 'toplamTutar', label: 'Toplam Tutar' },
    { key: 'iskonto', label: 'İskonto' },
    { key: 'kdvOrani', label: 'KDV Oranı' },
    { key: 'kdvTutari', label: 'KDV Tutarı' },
    { key: 'iskontoSonrasiTutar', label: 'İskonto Sonrası Tutar' },
    { key: 'kdvDahilTutar', label: 'KDV Dahil Tutar' },
    { key: 'bugunTarihi', label: 'Bugünün Tarihi' },
  ],
  cek: [
    { key: 'Check.BankName', label: 'Çek Banka Adı' },
    { key: 'Check.CheckNumber', label: 'Çek Numarası' },
    { key: 'Check.AmountFormatted', label: 'Çek Tutarı (formatlı)' },
    { key: 'Check.IssueDateFormatted', label: 'Keside Tarihi (formatlı)' },
    { key: 'Check.DueDateFormatted', label: 'Vade Tarihi (formatlı)' },
    { key: 'Check.StatusLabel', label: 'Çek Durumu' },
    { key: 'Check.CustomerName', label: 'Müşteri Adı' },
  ],
};

type ImageCommandOptions = {
  src: string;
  width?: number;
  'data-image-id'?: string;
};

export default function QuoteTemplateEditorModal({
  template,
  isNew,
  onClose,
  onSave,
}: QuoteTemplateEditorModalProps) {
  const [templateName, setTemplateName] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [images, setImages] = useState<TemplateImage[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedImageId, setSelectedImageId] = useState<number | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [isTableActive, setIsTableActive] = useState(false);
  const [isImageActive, setIsImageActive] = useState(false);
  const [showGridlines, setShowGridlines] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      CustomImage,
      CustomTable.configure({
        resizable: true,
      }),
      TableRow,
      TableCell,
      TableHeader,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Underline,
    ],
    content: {
      type: 'doc',
      content: [],
    },
    editable: true,
    editorProps: {
      attributes: {
        class: 'focus:outline-none min-h-[25.7cm]',
      },
    },
    onSelectionUpdate: ({ editor }) => {
      const { $from } = editor.state.selection;
      let active = false;
      try {
        for (let depth = $from.depth; depth > 0; depth--) {
          const typeName = $from.node(depth).type.name;
          if (typeName === 'table' || typeName === 'tableCell' || typeName === 'tableHeader') {
            active = true;
            break;
          }
        }
        setIsTableActive(active || editor.isActive('table') || editor.can().addColumnBefore());
        setIsImageActive(editor.isActive('image') || editor.isActive('imageResize'));
      } catch {
        setIsTableActive(false);
        setIsImageActive(false);
      }
    },
    onUpdate: ({ editor }) => {
      const { $from } = editor.state.selection;
      let active = false;
      try {
        for (let depth = $from.depth; depth > 0; depth--) {
          const typeName = $from.node(depth).type.name;
          if (typeName === 'table' || typeName === 'tableCell' || typeName === 'tableHeader') {
            active = true;
            break;
          }
        }
        setIsTableActive(active || editor.isActive('table') || editor.can().addColumnBefore());
        setIsImageActive(editor.isActive('image') || editor.isActive('imageResize'));
      } catch {
        setIsTableActive(false);
        setIsImageActive(false);
      }
    },
  });

  useEffect(() => {
    if (template) {
      setTemplateName(template.TemplateName);
      if (editor && template.Content) {
        preprocessAndSetContent(template.Content);
      }
    }
    loadImages();
  }, [template, editor]);

  const preprocessAndSetContent = async (content: any) => {
    if (!editor || !content) return;

    const clonedContent = JSON.parse(JSON.stringify(content));

    const processNodes = async (node: any) => {
      if ((node.type === 'image' || node.type === 'imageResize') && node.attrs && node.attrs.src) {
        const src = node.attrs.src;
        if (src.startsWith('image:')) {
          const imageId = src.replace('image:', '');
          try {
            const blob = await templateImageService.getByIdAsync(Number(imageId));
            const url = URL.createObjectURL(blob);
            node.attrs.src = url;
            node.attrs['data-image-id'] = imageId;
          } catch (error) {
            console.error(`Failed to load image ${imageId}:`, error);
          }
        }
      }
      if (node.content && Array.isArray(node.content)) {
        for (const child of node.content) {
          await processNodes(child);
        }
      }
    };

    await processNodes(clonedContent);
    editor.commands.setContent(clonedContent);
  };

  const loadImages = async () => {
    try {
      const imageList = await templateImageService.getAllAsync();
      setImages(imageList);
    } catch (error) {
      console.error('Load images error:', error);
      setImages([]);
    }
  };

  const insertPlaceholder = (key: string) => {
    if (!editor) return;
    const placeholder = `{{${key}}}`;
    editor.chain().focus().insertContent(placeholder).run();
  };

  const insertMaterialTable = () => {
    if (!editor) return;
    const placeholder = `{{malzemeTablosu}}`;
    editor.chain().focus().insertContent(placeholder).run();
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploadingImage(true);
      const response = await templateImageService.uploadAsync(file);

      await loadImages();

      if (editor) {
        // Node selection varsa üzerine yazmamak için imleci sonrasına al
        const { selection } = editor.state;
        if (selection && 'node' in selection) {
          editor.commands.setTextSelection(selection.to);
        }

        try {
          const blob = await templateImageService.getByIdAsync(response.ImageId);
          const url = URL.createObjectURL(blob);
          editor.chain().focus().setImage({ src: url, 'data-image-id': response.ImageId.toString(), width: 150 } as ImageCommandOptions).insertContent(' ').run();
        } catch (error) {
          console.error('Failed to load uploaded image:', error);
          editor.chain().focus().setImage({ src: `image:${response.ImageId}`, width: 150 } as ImageCommandOptions).insertContent(' ').run();
        }
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setUploadingImage(false);
    }
  };

  const insertImage = async (imageId: number) => {
    if (!editor) return;
    
    // Node selection varsa üzerine yazmamak için imleci sonrasına al
    const { selection } = editor.state;
    if (selection && 'node' in selection) {
      editor.commands.setTextSelection(selection.to);
    }

    try {
      const blob = await templateImageService.getByIdAsync(imageId);
      const url = URL.createObjectURL(blob);
      editor.chain().focus().setImage({ src: url, 'data-image-id': imageId.toString(), width: 150 } as ImageCommandOptions).insertContent(' ').run();
    } catch (error) {
      console.error('Failed to load image:', error);
      editor.chain().focus().setImage({ src: `image:${imageId}`, width: 150 } as ImageCommandOptions).insertContent(' ').run();
    }
    setSelectedImageId(null);
  };

  const handleSave = async () => {
    if (!templateName.trim()) {
      toast.warning('Şablon adı gereklidir');
      return;
    }

    if (!editor) return;

    try {
      setIsBusy(true);
      const content = editor.getJSON();
      
      const postprocessNodes = (node: any) => {
        if ((node.type === 'image' || node.type === 'imageResize') && node.attrs) {
          const imageId = node.attrs['data-image-id'];
          if (imageId) {
            node.attrs.src = `image:${imageId}`;
            delete node.attrs['data-image-id'];
          }
        }
        if (node.type === 'table' && node.attrs && (node.attrs.noBorder === true || node.attrs.noBorder === 'true')) {
          node.attrs.style = (node.attrs.style || '') + ' border: none !important; border-width: 0px !important; outline: none !important;';
          node.attrs.class = (node.attrs.class || '') + ' border-none';
          const makeCellsBorderless = (n: any) => {
            if (n.type === 'tableCell' || n.type === 'tableHeader') {
              if (!n.attrs) {
                n.attrs = {};
              }
              n.attrs.style = (n.attrs.style || '') + ' border: none !important; border-width: 0px !important; outline: none !important;';
            }
            if (n.content && Array.isArray(n.content)) {
              for (const c of n.content) {
                makeCellsBorderless(c);
              }
            }
          };
          makeCellsBorderless(node);
        }
        if (node.content && Array.isArray(node.content)) {
          for (const child of node.content) {
            postprocessNodes(child);
          }
        }
      };

      const clonedContent = JSON.parse(JSON.stringify(content));
      postprocessNodes(clonedContent);

      if (isNew) {
        const response = await quoteTemplateService.createAsync({
          TemplateName: templateName,
          Content: clonedContent,
          IsDefault: false,
        });
        if (onSave) {
          onSave(response.TemplateId);
        }
        toast.success('Teklif şablonu başarıyla oluşturuldu!');
      } else if (template) {
        await quoteTemplateService.updateAsync(template.TemplateId, {
          TemplateName: templateName,
          Content: clonedContent,
        });
        toast.success('Teklif şablonu başarıyla güncellendi!');
      }

      onClose();
    } catch (error) {
      console.error('Save template error:', error);
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handlePreview = async () => {
    if (!editor) return;

    try {
      setIsBusy(true);
      const content = editor.getJSON();

      const postprocessNodes = (node: any) => {
        if ((node.type === 'image' || node.type === 'imageResize') && node.attrs) {
          const imageId = node.attrs['data-image-id'];
          if (imageId) {
            node.attrs.src = `image:${imageId}`;
            delete node.attrs['data-image-id'];
          }
        }
        if (node.type === 'table' && node.attrs && (node.attrs.noBorder === true || node.attrs.noBorder === 'true')) {
          node.attrs.style = (node.attrs.style || '') + ' border: none !important; border-width: 0px !important; outline: none !important;';
          node.attrs.class = (node.attrs.class || '') + ' border-none';
          const makeCellsBorderless = (n: any) => {
            if (n.type === 'tableCell' || n.type === 'tableHeader') {
              if (!n.attrs) {
                n.attrs = {};
              }
              n.attrs.style = (n.attrs.style || '') + ' border: none !important; border-width: 0px !important; outline: none !important;';
            }
            if (n.content && Array.isArray(n.content)) {
              for (const c of n.content) {
                makeCellsBorderless(c);
              }
            }
          };
          makeCellsBorderless(node);
        }
        if (node.content && Array.isArray(node.content)) {
          for (const child of node.content) {
            postprocessNodes(child);
          }
        }
      };

      const clonedContent = JSON.parse(JSON.stringify(content));
      postprocessNodes(clonedContent);

      const blob = await quoteTemplateService.previewContentAsync(clonedContent);

      if (blob.size === 0) {
        toast.error('PDF önizlemesi oluşturulamadı (sunucu boş yanıt döndü).');
        return;
      }
      const isPdf = blob.type === 'application/pdf' || blob.type === '';
      if (!isPdf && blob.size < 10000) {
        const text = await blob.text();
        try {
          const j = JSON.parse(text);
          toast.error('Önizleme hatası: ' + (j.message || text.slice(0, 200)));
        } catch {
          toast.error('Sunucu PDF döndürmedi. Content-Type: ' + (blob.type || '(boş)'));
        }
        return;
      }

      const url = window.URL.createObjectURL(blob);
      setPdfPreviewUrl(url);
      setShowPdfPreview(true);
    } catch (error) {
      console.error('Preview error:', error);
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const closePdfPreview = () => {
    setShowPdfPreview(false);
    if (pdfPreviewUrl) {
      window.URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(null);
    }
  };

  const getTableAttrs = () => {
    if (!editor) return {};
    const { $from } = editor.state.selection;
    for (let depth = $from.depth; depth > 0; depth--) {
      const node = $from.node(depth);
      if (node.type.name === 'table') {
        return node.attrs;
      }
    }
    return editor.getAttributes('table');
  };

  if (!editor) {
    return null;
  }


  return (
    <div className="fixed inset-0 bg-background-main flex flex-col z-[100] overflow-hidden">
      {/* Sleek Top Header Bar */}
      <div className="bg-background-panel border-b border-background-border px-4 py-2 flex items-center justify-between gap-4 shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-blue-600 font-bold text-lg">📝</span>
          <h2 className="text-sm font-semibold text-text-primary">
            {isNew ? 'Yeni Teklif Şablonu' : 'Teklif Şablonu Düzenle'}
          </h2>
        </div>
        
        <div className="flex-1 max-w-md mx-4">
          <div className="relative flex items-center">
            <span className="absolute left-3 text-xs font-semibold text-text-secondary">Şablon Adı:</span>
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              className="input w-full pl-24 pr-3 py-1 text-xs"
              placeholder="Örn: Standart Teklif Şablonu"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePreview}
            disabled={isBusy}
            className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1"
          >
            <span>👁️</span> {isBusy ? 'Önizleniyor...' : 'Önizle'}
          </button>
          <button
            onClick={handleSave}
            disabled={isBusy}
            className="btn-primary text-xs px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1 font-semibold"
          >
            <span>💾</span> {isBusy ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
          <div className="h-5 w-px bg-background-border mx-1" />
          <button 
            onClick={onClose}
            className="btn-secondary text-xs px-3 py-1.5 text-red-500 hover:bg-red-50 border-red-200 flex items-center gap-1"
          >
            <span>❌</span> Kapat
          </button>
        </div>
      </div>
      <div className="bg-background-panel border-b border-background-border px-4 py-1.5 flex flex-wrap items-center gap-2 shrink-0 shadow-sm">
        {/* Metin Formatlama Grubu */}
        <div className="flex rounded-input border border-background-border overflow-hidden bg-background-panel">
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            disabled={!editor.can().chain().focus().toggleBold().run()}
            className={`p-1.5 text-xs px-2.5 hover:bg-background-hover transition-colors font-bold ${editor.isActive('bold') ? 'bg-blue-100 text-blue-700 font-extrabold' : 'text-text-primary'}`}
            title="Kalın"
          >
            B
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            disabled={!editor.can().chain().focus().toggleItalic().run()}
            className={`p-1.5 text-xs px-2.5 border-l border-background-border hover:bg-background-hover transition-colors italic ${editor.isActive('italic') ? 'bg-blue-100 text-blue-700' : 'text-text-primary'}`}
            title="İtalik"
          >
            I
          </button>
          <button
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={`p-1.5 text-xs px-2.5 border-l border-background-border hover:bg-background-hover transition-colors underline ${editor.isActive('underline') ? 'bg-blue-100 text-blue-700' : 'text-text-primary'}`}
            title="Altı Çizili"
          >
            U
          </button>
        </div>

        {/* Paragraf / Başlık Grubu */}
        <div className="flex rounded-input border border-background-border overflow-hidden bg-background-panel">
          <button
            onClick={() => editor.chain().focus().setParagraph().run()}
            className={`p-1.5 text-xs px-2.5 hover:bg-background-hover transition-colors ${editor.isActive('paragraph') ? 'bg-blue-100 text-blue-700' : 'text-text-primary'}`}
            title="Normal Metin"
          >
            Normal
          </button>
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={`p-1.5 text-xs px-2.5 border-l border-background-border hover:bg-background-hover transition-colors font-bold ${editor.isActive('heading', { level: 1 }) ? 'bg-blue-100 text-blue-700' : 'text-text-primary'}`}
            title="Başlık 1"
          >
            H1
          </button>
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={`p-1.5 text-xs px-2.5 border-l border-background-border hover:bg-background-hover transition-colors font-bold ${editor.isActive('heading', { level: 2 }) ? 'bg-blue-100 text-blue-700' : 'text-text-primary'}`}
            title="Başlık 2"
          >
            H2
          </button>
        </div>

        {/* Hizalama Grubu */}
        <div className="flex rounded-input border border-background-border overflow-hidden bg-background-panel">
          <button
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            className={`p-1.5 text-xs px-2.5 hover:bg-background-hover transition-colors ${editor.isActive({ textAlign: 'left' }) ? 'bg-blue-100 text-blue-700' : 'text-text-primary'}`}
            title="Sola Hizala"
          >
            ⬅️
          </button>
          <button
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            className={`p-1.5 text-xs px-2.5 border-l border-background-border hover:bg-background-hover transition-colors ${editor.isActive({ textAlign: 'center' }) ? 'bg-blue-100 text-blue-700' : 'text-text-primary'}`}
            title="Ortala"
          >
            ↔️
          </button>
          <button
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            className={`p-1.5 text-xs px-2.5 border-l border-background-border hover:bg-background-hover transition-colors ${editor.isActive({ textAlign: 'right' }) ? 'bg-blue-100 text-blue-700' : 'text-text-primary'}`}
            title="Sağa Hizala"
          >
            ➡️
          </button>
        </div>

        <div className="w-px bg-background-border h-5 self-center" />

        {/* Görsel Grubu */}
        <div className="flex items-center gap-1 bg-background-panel border border-background-border rounded-input px-1.5 py-0.5">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            onChange={handleImageUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingImage}
            className="text-xs px-2 py-1 font-semibold hover:bg-background-hover rounded-sm text-text-primary"
            title="Görsel Yükle"
          >
            {uploadingImage ? '⏳ Yükleniyor' : '📷 Görsel Yükle'}
          </button>
          {images.length > 0 && (
            <select
              value={selectedImageId || ''}
              onChange={(e) => {
                const id = e.target.value ? Number(e.target.value) : null;
                setSelectedImageId(id);
                if (id) insertImage(id);
              }}
              className="text-xs bg-background-elevated border border-background-border rounded-input px-1 py-0.5 text-text-primary max-w-[120px]"
            >
              <option value="">🖼️ Görsel Seç</option>
              {images.map((img) => (
                <option key={img.ImageId} value={img.ImageId}>
                  {img.FileName}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Görsel Aktif Ayarlar */}
        {isImageActive && (
          <div className="flex items-center gap-0.5 bg-blue-50 border border-blue-200 p-0.5 rounded-input">
            <span className="text-[10px] font-semibold text-blue-800 px-1">Görsel:</span>
            <button
              onClick={() => {
                const nodeType = editor.isActive('imageResize') ? 'imageResize' : 'image';
                editor.commands.updateAttributes(nodeType, { align: 'left' });
              }}
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded-sm hover:bg-blue-100 ${editor.getAttributes(editor.isActive('imageResize') ? 'imageResize' : 'image').align === 'left' ? 'bg-blue-600 text-white hover:bg-blue-600' : 'text-blue-800'}`}
              title="Sola Yasla"
            >
              Sola Yasla
            </button>
            <button
              onClick={() => {
                const nodeType = editor.isActive('imageResize') ? 'imageResize' : 'image';
                editor.commands.updateAttributes(nodeType, { align: 'center' });
              }}
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded-sm hover:bg-blue-100 ${editor.getAttributes(editor.isActive('imageResize') ? 'imageResize' : 'image').align === 'center' ? 'bg-blue-600 text-white hover:bg-blue-600' : 'text-blue-800'}`}
              title="Ortala"
            >
              Ortala
            </button>
            <button
              onClick={() => {
                const nodeType = editor.isActive('imageResize') ? 'imageResize' : 'image';
                editor.commands.updateAttributes(nodeType, { align: 'right' });
              }}
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded-sm hover:bg-blue-100 ${editor.getAttributes(editor.isActive('imageResize') ? 'imageResize' : 'image').align === 'right' ? 'bg-blue-600 text-white hover:bg-blue-600' : 'text-blue-800'}`}
              title="Sağa Yasla"
            >
              Sağa Yasla
            </button>
            <button
              onClick={() => {
                const nodeType = editor.isActive('imageResize') ? 'imageResize' : 'image';
                editor.commands.updateAttributes(nodeType, { align: 'none' });
              }}
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded-sm hover:bg-blue-100 ${(!editor.getAttributes(editor.isActive('imageResize') ? 'imageResize' : 'image').align || editor.getAttributes(editor.isActive('imageResize') ? 'imageResize' : 'image').align === 'none') ? 'bg-blue-600 text-white hover:bg-blue-600' : 'text-blue-800'}`}
              title="Sıfırla"
            >
              Sıfırla
            </button>
          </div>
        )}

        <div className="w-px bg-background-border h-5 self-center" />

        {/* Placeholders Grubu */}
        <div className="flex items-center gap-1">
          <select
            onChange={(e) => {
              if (e.target.value) {
                insertPlaceholder(e.target.value);
                e.target.value = '';
              }
            }}
            className="text-xs bg-background-panel border border-background-border rounded-input px-1 py-1 text-text-primary"
          >
            <option value="">👤 Müşteri Bilgisi</option>
            {PLACEHOLDERS.musteri.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
          <select
            onChange={(e) => {
              if (e.target.value) {
                insertPlaceholder(e.target.value);
                e.target.value = '';
              }
            }}
            className="text-xs bg-background-panel border border-background-border rounded-input px-1 py-1 text-text-primary"
          >
            <option value="">💳 Çek Bilgisi</option>
            {PLACEHOLDERS.cek.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
          <select
            onChange={(e) => {
              if (e.target.value) {
                insertPlaceholder(e.target.value);
                e.target.value = '';
              }
            }}
            className="text-xs bg-background-panel border border-background-border rounded-input px-1 py-1 text-text-primary"
          >
            <option value="">🏗️ Şantiye Bilgisi</option>
            {PLACEHOLDERS.santiye.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
          <select
            onChange={(e) => {
              if (e.target.value) {
                insertPlaceholder(e.target.value);
                e.target.value = '';
              }
            }}
            className="text-xs bg-background-panel border border-background-border rounded-input px-1 py-1 text-text-primary"
          >
            <option value="">📄 Teklif Bilgisi</option>
            {PLACEHOLDERS.teklif.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
          
          <button
            onClick={insertMaterialTable}
            className="text-xs bg-background-panel border border-background-border hover:bg-background-hover text-text-primary rounded-input px-2 py-1"
            title="Malzeme Tablosu Ekle"
          >
            📋 Malzeme Tablosu
          </button>
        </div>

        <div className="w-px bg-background-border h-5 self-center" />

        {/* Düzen ve Tablo Grubu */}
        <select
          onChange={(e) => {
            const val = e.target.value;
            if (!val) return;
            
            if (val === 'empty') {
              editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
            } else if (val === 'logo-header') {
              editor.chain().focus().insertContent(`
                <table class="border-none" data-no-border="true" style="width: 100%;">
                  <tbody>
                    <tr>
                      <td style="width: 30%; vertical-align: middle; text-align: center;"><p>📁 <strong>[Buraya Logo Ekleyin]</strong></p></td>
                      <td style="width: 70%; vertical-align: middle;"><p style="font-size: 1.5rem; font-weight: bold; margin-bottom: 0.25rem;">ŞİRKET UNVANI / BAŞLIK</p><p style="color: #666; font-size: 0.875rem;">Teklif No: {{teklifNo}}<br>Tarih: {{bugunTarihi}}</p></td>
                    </tr>
                  </tbody>
                </table>
                <p></p>
              `).run();
            } else if (val === '2-col') {
              editor.chain().focus().insertContent(`
                <table class="border-none" data-no-border="true" style="width: 100%;">
                  <tbody>
                    <tr>
                      <td style="width: 50%; vertical-align: top;"><p><strong>Sol Sütun (Metin veya Resim)</strong></p><p>İçeriği buraya yazabilirsiniz.</p></td>
                      <td style="width: 50%; vertical-align: top;"><p><strong>Sağ Sütun (Metin veya Resim)</strong></p><p>İçeriği buraya yazabilirsiniz.</p></td>
                    </tr>
                  </tbody>
                </table>
                <p></p>
              `).run();
            } else if (val === '3-col') {
              editor.chain().focus().insertContent(`
                <table class="border-none" data-no-border="true" style="width: 100%;">
                  <tbody>
                    <tr>
                      <td style="width: 33.33%; vertical-align: top;"><p><strong>Sütun 1</strong></p></td>
                      <td style="width: 33.33%; vertical-align: top;"><p><strong>Sütun 2</strong></p></td>
                      <td style="width: 33.33%; vertical-align: top;"><p><strong>Sütun 3</strong></p></td>
                    </tr>
                  </tbody>
                </table>
                <p></p>
              `).run();
            }
            
            e.target.value = '';
          }}
          className="text-xs bg-background-panel border border-background-border rounded-input px-1.5 py-1 text-text-primary font-semibold"
          title="Sayfa Düzeni ve Tablo Ekle"
        >
          <option value="">📐 Düzen / Tablo Ekle</option>
          <option value="empty">➕ Boş Tablo</option>
          <option value="logo-header">🏢 Logo + Başlık Düzeni</option>
          <option value="2-col">📊 2 Sütunlu Düzen</option>
          <option value="3-col">📊 3 Sütunlu Düzen</option>
        </select>

        <button
          type="button"
          onClick={() => setShowGridlines(!showGridlines)}
          className={`text-xs border rounded-input px-2.5 py-1 flex items-center gap-1 font-semibold transition-colors ${!showGridlines ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'}`}
          title="Kılavuz Çizgilerini Göster / Gizle"
        >
          <span>{showGridlines ? '👁️ Kılavuz Gizle' : '👁️ Kılavuz Göster'}</span>
        </button>

        {/* Tablo Aktif Ayarlar */}
        {isTableActive && (
          <div className="flex flex-wrap items-center gap-0.5 bg-blue-50 border border-blue-200 p-0.5 rounded-input">
            <span className="text-[10px] font-semibold text-blue-800 px-1">Tablo:</span>
            <button
              onClick={() => editor.commands.updateAttributes('table', { align: 'left' })}
              className="text-[10px] text-blue-800 hover:bg-blue-100 px-1.5 py-0.5 rounded-sm"
              title="Sola Yasla"
            >
              ⬅️ Sol
            </button>
            <button
              onClick={() => editor.commands.updateAttributes('table', { align: 'center' })}
              className="text-[10px] text-blue-800 hover:bg-blue-100 px-1.5 py-0.5 rounded-sm"
              title="Ortala"
            >
              ↔️ Orta
            </button>
            <button
              onClick={() => editor.commands.updateAttributes('table', { align: 'right' })}
              className="text-[10px] text-blue-800 hover:bg-blue-100 px-1.5 py-0.5 rounded-sm"
              title="Sağa Yasla"
            >
              ➡️ Sağ
            </button>
            <button
              onClick={() => {
                const attrs = getTableAttrs();
                const isNoBorder = !!attrs.noBorder;
                editor.commands.updateAttributes('table', { noBorder: !isNoBorder });
              }}
              className={`text-[10px] px-1.5 py-0.5 rounded-sm hover:bg-blue-100 ${getTableAttrs().noBorder ? 'bg-blue-600 text-white hover:bg-blue-600' : 'text-blue-800'}`}
              title="Sınırları Gizle / Göster"
            >
              {getTableAttrs().noBorder ? '👀 Çizgi Göster' : '🚫 Çizgi Gizle'}
            </button>
            <div className="w-px bg-blue-200 h-3 mx-0.5" />
            <button
              onClick={() => editor.chain().focus().addColumnBefore().run()}
              className="text-[10px] text-blue-800 hover:bg-blue-100 px-1.5 py-0.5 rounded-sm"
              title="Sütun Ekle (Sol)"
            >
              +Sütun (Sol)
            </button>
            <button
              onClick={() => editor.chain().focus().addColumnAfter().run()}
              className="text-[10px] text-blue-800 hover:bg-blue-100 px-1.5 py-0.5 rounded-sm"
              title="Sütun Ekle (Sağ)"
            >
              +Sütun (Sağ)
            </button>
            <button
              onClick={() => editor.chain().focus().addRowBefore().run()}
              className="text-[10px] text-blue-800 hover:bg-blue-100 px-1.5 py-0.5 rounded-sm"
              title="Satır Ekle (Üst)"
            >
              +Satır (Üst)
            </button>
            <button
              onClick={() => editor.chain().focus().addRowAfter().run()}
              className="text-[10px] text-blue-800 hover:bg-blue-100 px-1.5 py-0.5 rounded-sm"
              title="Satır Ekle (Alt)"
            >
              +Satır (Alt)
            </button>
            <div className="w-px bg-blue-200 h-3 mx-0.5" />
            <button
              onClick={() => editor.chain().focus().deleteColumn().run()}
              className="text-[10px] text-red-500 hover:bg-red-50 px-1.5 py-0.5 rounded-sm"
              title="Sütunu Sil"
            >
              -Sütun
            </button>
            <button
              onClick={() => editor.chain().focus().deleteRow().run()}
              className="text-[10px] text-red-500 hover:bg-red-50 px-1.5 py-0.5 rounded-sm"
              title="Satırı Sil"
            >
              -Satır
            </button>
            <button
              onClick={() => editor.chain().focus().mergeCells().run()}
              className="text-[10px] text-blue-800 hover:bg-blue-100 px-1.5 py-0.5 rounded-sm"
              title="Birleştir"
            >
              Birleştir
            </button>
            <button
              onClick={() => editor.chain().focus().splitCell().run()}
              className="text-[10px] text-blue-800 hover:bg-blue-100 px-1.5 py-0.5 rounded-sm"
              title="Ayrıştır"
            >
              Ayrıştır
            </button>
            <button
              onClick={() => editor.chain().focus().deleteTable().run()}
              className="text-[10px] text-red-600 hover:bg-red-50 px-1.5 py-0.5 rounded-sm font-semibold"
              title="Tabloyu Sil"
            >
              🗑️ Sil
            </button>
          </div>
        )}
      </div>

      {/* Bilgi / İpucu Kutusu (İnce Şerit halinde) */}
      <div className="text-[10px] text-text-secondary bg-background-surface border-b border-background-border px-4 py-1 flex items-center gap-1.5 shrink-0">
        <span>💡</span>
        <span>
          <strong>İpucu:</strong> Logo ve görselleri yan yana yerleştirmek veya sayfanın köşesine hizalamak için <strong>📐 Düzen / Tablo Ekle</strong> menüsünden sütunlu düzenler ekleyebilir ve tablo seçiliyken <strong>🚫 Çizgi Gizle</strong> butonuyla görünmez kılavuz çizgileri yapabilirsiniz.
        </span>
      </div>

      {/* MS Word style maximized workspace */}
      <div className={`bg-background-elevated flex-1 p-2 md:p-4 flex justify-center overflow-auto min-h-0 ${showGridlines ? 'show-gridlines' : 'hide-gridlines'}`}>
        <div 
          className="bg-background-panel w-full max-w-[21cm] min-h-[29.7cm] p-[1.5cm] shadow-xl border border-background-border text-text-primary shrink-0 self-start my-2"
          style={{ boxSizing: 'border-box' }}
        >
          <EditorContent editor={editor} />
        </div>
      </div>

      <PdfPreviewModal
        open={showPdfPreview}
        pdfUrl={pdfPreviewUrl}
        title="Teklif Şablonu Önizleme"
        downloadFileName="teklif_sablon_onizleme.pdf"
        onClose={closePdfPreview}
      />
    </div>
  );
}
