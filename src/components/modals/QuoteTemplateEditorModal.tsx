import { useState, useEffect, useRef } from 'react';
import { ClipboardIcon } from '@phosphor-icons/react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TextAlign } from '@tiptap/extension-text-align';
import { Underline } from '@tiptap/extension-underline';
import ImageResize from 'tiptap-extension-resize-image';
import { QuoteTemplate, TemplateImage } from '../../models';
import { quoteTemplateService } from '../../services/quoteTemplateService';
import { templateImageService } from '../../services/templateImageService';
import { getApiErrorMessage } from '../../utils/apiError';
import { toast } from '../../hooks/useToast';
import { CustomImage } from './CustomImageExtension';
import PdfPreviewModal from './PdfPreviewModal';

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      CustomImage,
      ImageResize,
      Table.configure({
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
    content: template?.Content || {
      type: 'doc',
      content: [],
    },
    editable: true,
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
      if (node.type === 'image' && node.attrs && node.attrs.src) {
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
        try {
          const blob = await templateImageService.getByIdAsync(response.ImageId);
          const url = URL.createObjectURL(blob);
          editor.chain().focus().setImage({ src: url, 'data-image-id': response.ImageId.toString() }).run();
        } catch (error) {
          console.error('Failed to load uploaded image:', error);
          editor.chain().focus().setImage({ src: `image:${response.ImageId}` }).run();
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
    try {
      const blob = await templateImageService.getByIdAsync(imageId);
      const url = URL.createObjectURL(blob);
      editor.chain().focus().setImage({ src: url, 'data-image-id': imageId.toString() }).run();
    } catch (error) {
      console.error('Failed to load image:', error);
      editor.chain().focus().setImage({ src: `image:${imageId}` }).run();
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
        if (node.type === 'image' && node.attrs) {
          const imageId = node.attrs['data-image-id'];
          if (imageId) {
            node.attrs.src = `image:${imageId}`;
            delete node.attrs['data-image-id'];
          }
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
      const blob = await quoteTemplateService.previewContentAsync(content);

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

  if (!editor) {
    return null;
  }

  const isTableActive = editor && editor.can().deleteTable();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
      <div className="bg-background-panel rounded-panel w-full max-w-6xl p-6 max-h-[95vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-6">
          {isNew ? 'Yeni Teklif Şablonu Oluştur' : 'Teklif Şablonu Düzenle'}
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Şablon Adı *</label>
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              className="input w-full"
              placeholder="Örn: Standart Teklif Şablonu"
            />
          </div>

          <div className="card p-3 flex flex-wrap gap-2">
            <button
              onClick={() => editor.chain().focus().toggleBold().run()}
              disabled={!editor.can().chain().focus().toggleBold().run()}
              className={`btn-secondary text-sm px-3 py-1 ${editor.isActive('bold') ? 'bg-blue-600' : ''}`}
            >
              <strong>B</strong>
            </button>
            <button
              onClick={() => editor.chain().focus().toggleItalic().run()}
              disabled={!editor.can().chain().focus().toggleItalic().run()}
              className={`btn-secondary text-sm px-3 py-1 ${editor.isActive('italic') ? 'bg-blue-600' : ''}`}
            >
              <em>I</em>
            </button>
            <button
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              className={`btn-secondary text-sm px-3 py-1 ${editor.isActive('underline') ? 'bg-blue-600' : ''}`}
            >
              <u>U</u>
            </button>
            <div className="w-px bg-background-border mx-1" />
            <button
              onClick={() => editor.chain().focus().setParagraph().run()}
              className={`btn-secondary text-sm px-3 py-1 ${editor.isActive('paragraph') ? 'bg-blue-600' : ''}`}
            >
              P
            </button>
            <button
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
              className={`btn-secondary text-sm px-3 py-1 ${editor.isActive('heading', { level: 1 }) ? 'bg-blue-600' : ''}`}
            >
              H1
            </button>
            <button
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              className={`btn-secondary text-sm px-3 py-1 ${editor.isActive('heading', { level: 2 }) ? 'bg-blue-600' : ''}`}
            >
              H2
            </button>
            <div className="w-px bg-background-border mx-1" />
            <button
              onClick={() => editor.chain().focus().setTextAlign('left').run()}
              className={`btn-secondary text-sm px-3 py-1 ${editor.isActive({ textAlign: 'left' }) ? 'bg-blue-600' : ''}`}
            >
              ←
            </button>
            <button
              onClick={() => editor.chain().focus().setTextAlign('center').run()}
              className={`btn-secondary text-sm px-3 py-1 ${editor.isActive({ textAlign: 'center' }) ? 'bg-blue-600' : ''}`}
            >
              ⨯
            </button>
            <button
              onClick={() => editor.chain().focus().setTextAlign('right').run()}
              className={`btn-secondary text-sm px-3 py-1 ${editor.isActive({ textAlign: 'right' }) ? 'bg-blue-600' : ''}`}
            >
              →
            </button>
            <div className="w-px bg-background-border mx-1" />

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
              className="btn-secondary text-sm px-3 py-1"
            >
              {uploadingImage ? 'Yükleniyor...' : '📷 Görsel Yükle'}
            </button>

            {images.length > 0 && (
              <>
                <select
                  value={selectedImageId || ''}
                  onChange={(e) => {
                    const id = e.target.value ? Number(e.target.value) : null;
                    setSelectedImageId(id);
                    if (id) insertImage(id);
                  }}
                  className="input text-sm px-3 py-1"
                >
                  <option value="">Görsel Seç</option>
                  {images.map((img) => (
                    <option key={img.ImageId} value={img.ImageId}>
                      {img.FileName}
                    </option>
                  ))}
                </select>
              </>
            )}

            <div className="w-px bg-background-border mx-1" />

            <div className="flex gap-1">
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    insertPlaceholder(e.target.value);
                    e.target.value = '';
                  }
                }}
                className="input text-sm px-2 py-1"
              >
                <option value="">Müşteri Bilgileri</option>
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
                className="input text-sm px-2 py-1"
              >
                <option value="">Çek Bilgileri</option>
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
                className="input text-sm px-2 py-1"
              >
                <option value="">Şantiye Bilgileri</option>
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
                className="input text-sm px-2 py-1"
              >
                <option value="">Teklif Bilgileri</option>
                {PLACEHOLDERS.teklif.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
              <button
                onClick={insertMaterialTable}
                className="btn-secondary text-sm px-3 py-1"
              >
                <ClipboardIcon size={18} weight="regular" className="inline-block align-middle mr-1.5" aria-hidden />
                Malzeme Tablosu
              </button>
            </div>

            <div className="w-px bg-background-border mx-1" />

            <button
              onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
              className="btn-secondary text-sm px-3 py-1"
              title="Boş Tablo Ekle"
            >
              ➕ Boş Tablo Ekle
            </button>

              <div className="flex flex-wrap gap-1 bg-background-elevated p-1 rounded-input border border-background-border">
                <span className="text-xs text-text-secondary self-center px-1">Tablo:</span>
                <button
                  onClick={() => editor.chain().focus().addColumnBefore().run()}
                  disabled={!isTableActive}
                  className={`btn-secondary text-xs px-2 py-0.5 ${!isTableActive ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title="Sola Sütun Ekle"
                >
                  +Sütun (Sol)
                </button>
                <button
                  onClick={() => editor.chain().focus().addColumnAfter().run()}
                  disabled={!isTableActive}
                  className={`btn-secondary text-xs px-2 py-0.5 ${!isTableActive ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title="Sağa Sütun Ekle"
                >
                  +Sütun (Sağ)
                </button>
                <button
                  onClick={() => editor.chain().focus().addRowBefore().run()}
                  disabled={!isTableActive}
                  className={`btn-secondary text-xs px-2 py-0.5 ${!isTableActive ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title="Üste Satır Ekle"
                >
                  +Satır (Üst)
                </button>
                <button
                  onClick={() => editor.chain().focus().addRowAfter().run()}
                  disabled={!isTableActive}
                  className={`btn-secondary text-xs px-2 py-0.5 ${!isTableActive ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title="Alta Satır Ekle"
                >
                  +Satır (Alt)
                </button>
                <div className="w-px bg-background-border mx-0.5" />
                <button
                  onClick={() => editor.chain().focus().deleteColumn().run()}
                  disabled={!isTableActive}
                  className={`btn-secondary text-xs px-2 py-0.5 text-red-500 ${!isTableActive ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title="Sütunu Sil"
                >
                  -Sütun
                </button>
                <button
                  onClick={() => editor.chain().focus().deleteRow().run()}
                  disabled={!isTableActive}
                  className={`btn-secondary text-xs px-2 py-0.5 text-red-500 ${!isTableActive ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title="Satırı Sil"
                >
                  -Satır
                </button>
                <div className="w-px bg-background-border mx-0.5" />
                <button
                  onClick={() => editor.chain().focus().mergeCells().run()}
                  disabled={!isTableActive}
                  className={`btn-secondary text-xs px-2 py-0.5 ${!isTableActive ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title="Hücreleri Birleştir"
                >
                  Birleştir
                </button>
                <button
                  onClick={() => editor.chain().focus().splitCell().run()}
                  disabled={!isTableActive}
                  className={`btn-secondary text-xs px-2 py-0.5 ${!isTableActive ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title="Hücreyi Ayrıştır"
                >
                  Ayrıştır
                </button>
                <div className="w-px bg-background-border mx-0.5" />
                <button
                  onClick={() => editor.chain().focus().deleteTable().run()}
                  disabled={!isTableActive}
                  className={`btn-secondary text-xs px-2 py-0.5 text-red-500 ${!isTableActive ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title="Tabloyu Sil"
                >
                  🗑️ Sil
                </button>
              </div>
          </div>

          <div className="card p-4 min-h-[400px]">
            <EditorContent editor={editor} />
          </div>

          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary flex-1">
              İptal
            </button>
            <button
              onClick={handlePreview}
              disabled={isBusy}
              className="btn-secondary flex-1"
            >
              {isBusy ? 'Önizleniyor...' : 'Önizle'}
            </button>
            <button
              onClick={handleSave}
              disabled={isBusy}
              className="btn-primary flex-1"
            >
              {isBusy ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </div>
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
