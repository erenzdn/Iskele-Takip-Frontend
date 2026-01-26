import { useState, useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TextAlign } from '@tiptap/extension-text-align';
import { Underline } from '@tiptap/extension-underline';
import ImageResize from 'tiptap-extension-resize-image';
import { ContractTemplate, TemplateImage } from '../../models';
import { contractTemplateService } from '../../services/contractTemplateService';
import { templateImageService } from '../../services/templateImageService';
import { CustomImage } from './CustomImageExtension';

interface ContractTemplateEditorModalProps {
  template: ContractTemplate | null;
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
  sozlesme: [
    { key: 'sozlesmeNo', label: 'Sözleşme No' },
    { key: 'baslangicTarihi', label: 'Başlangıç Tarihi' },
    { key: 'bitisTarihi', label: 'Bitiş Tarihi' },
    { key: 'gercekBitisTarihi', label: 'Gerçek Bitiş Tarihi' },
    { key: 'toplamTutar', label: 'Toplam Tutar' },
    { key: 'hesaplananTutar', label: 'Hesaplanan Tutar' },
    { key: 'bugunTarihi', label: 'Bugünün Tarihi' },
  ],
};

export default function ContractTemplateEditorModal({
  template,
  isNew,
  onClose,
  onSave,
}: ContractTemplateEditorModalProps) {
  const [templateName, setTemplateName] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [images, setImages] = useState<TemplateImage[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedImageId, setSelectedImageId] = useState<number | null>(null);
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
  });

  useEffect(() => {
    if (template) {
      setTemplateName(template.TemplateName);
    }
    loadImages();
  }, [template]);

  const loadImages = async () => {
    try {
      const imageList = await templateImageService.getAllAsync();
      setImages(imageList);
    } catch (error) {
      console.error('Load images error:', error);
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
      
      // Görseli listeye ekle
      await loadImages();
      
      // Editöre ekle
      if (editor) {
        const imageUrl = `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'}/template-images/${response.ImageId}`;
        editor.chain().focus().setImage({ src: `image:${response.ImageId}` }).run();
      }

      // File input'u temizle
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error: any) {
      alert(error.message || 'Görsel yükleme hatası');
    } finally {
      setUploadingImage(false);
    }
  };

  const insertImage = (imageId: number) => {
    if (!editor) return;
    editor.chain().focus().setImage({ src: `image:${imageId}` }).run();
    setSelectedImageId(null);
  };

  const handleSave = async () => {
    if (!templateName.trim()) {
      alert('Şablon adı gereklidir');
      return;
    }

    if (!editor) return;

    try {
      setIsBusy(true);
      const content = editor.getJSON();

      if (isNew) {
        const response = await contractTemplateService.createAsync({
          TemplateName: templateName,
          Content: content,
          IsDefault: false,
        });
        if (onSave) {
          onSave(response.TemplateId);
        }
        alert('Şablon başarıyla oluşturuldu!');
      } else if (template) {
        await contractTemplateService.updateAsync(template.TemplateId, {
          TemplateName: templateName,
          Content: content,
        });
        alert('Şablon başarıyla güncellendi!');
      }

      onClose();
    } catch (error) {
      console.error('Save template error:', error);
      alert('Kaydetme hatası');
    } finally {
      setIsBusy(false);
    }
  };

  const handlePreview = async () => {
    if (!editor) return;

    try {
      setIsBusy(true);
      const content = editor.getJSON();
      const blob = await contractTemplateService.previewContentAsync(content);
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sozlesme_onizleme.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Preview error:', error);
      alert('Önizleme hatası');
    } finally {
      setIsBusy(false);
    }
  };

  if (!editor) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-background-panel rounded-panel w-full max-w-6xl p-6 max-h-[95vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-6">
          {isNew ? 'Yeni Şablon Oluştur' : 'Şablon Düzenle'}
        </h2>

        <div className="space-y-4">
          {/* Şablon Adı */}
          <div>
            <label className="block text-sm font-medium mb-2">Şablon Adı *</label>
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              className="input w-full"
              placeholder="Örn: Standart Kiralama Sözleşmesi"
            />
          </div>

          {/* Toolbar */}
          <div className="card p-3 flex flex-wrap gap-2">
            {/* Metin Formatlama */}
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
            
            {/* Görsel Yükleme */}
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

            {/* Görsel Seç */}
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
            
            {/* Placeholder Butonları */}
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
                <option value="">Sözleşme Bilgileri</option>
                {PLACEHOLDERS.sozlesme.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
              <button
                onClick={insertMaterialTable}
                className="btn-secondary text-sm px-3 py-1"
              >
                📋 Malzeme Tablosu
              </button>
            </div>
          </div>

          {/* Editör */}
          <div className="card p-4 min-h-[400px]">
            <EditorContent editor={editor} />
          </div>

          {/* Butonlar */}
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary flex-1">
              İptal
            </button>
            <button
              onClick={handlePreview}
              disabled={isBusy}
              className="btn-secondary flex-1"
            >
              {isBusy ? 'Önizleniyor...' : 'PDF Önizleme'}
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
    </div>
  );
}
