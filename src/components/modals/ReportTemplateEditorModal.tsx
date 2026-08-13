import { useState, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TextAlign } from '@tiptap/extension-text-align';
import { Underline } from '@tiptap/extension-underline';
import { ReportTemplate } from '../../models';
import { reportTemplateService } from '../../services/reportTemplateService';
import { getApiErrorMessage } from '../../utils/apiError';
import { toast } from '../../hooks/useToast';
import PdfPreviewModal from './PdfPreviewModal';

interface ReportTemplateEditorModalProps {
  template: ReportTemplate | null;
  isNew: boolean;
  onClose: () => void;
  onSave?: (templateId: number) => void;
}

const PLACEHOLDERS = [
  { key: 'raporBasligi', label: 'Rapor Başlığı' },
  { key: 'musteriAdi', label: 'Müşteri Adı' },
  { key: 'santiyeAdi', label: 'Şantiye Adı' },
  { key: 'aktifSozlesme', label: 'Aktif Sözleşme Sayısı' },
  { key: 'toplamMusteri', label: 'Toplam Müşteri' },
  { key: 'toplamSozlesme', label: 'Toplam Sözleşme' },
  { key: 'raporTarihi', label: 'Rapor Tarihi' },
  { key: 'hareketTablosu', label: 'Hareket Tablosu' },
  { key: 'Check.BankName', label: 'Çek Banka Adı' },
  { key: 'Check.CheckNumber', label: 'Çek Numarası' },
  { key: 'Check.AmountFormatted', label: 'Çek Tutarı (formatlı)' },
  { key: 'Check.IssueDateFormatted', label: 'Keside Tarihi (formatlı)' },
  { key: 'Check.DueDateFormatted', label: 'Vade Tarihi (formatlı)' },
  { key: 'Check.StatusLabel', label: 'Çek Durumu' },
  { key: 'Check.CustomerName', label: 'Müşteri Adı' },
];

export default function ReportTemplateEditorModal({
  template,
  isNew,
  onClose,
  onSave,
}: ReportTemplateEditorModalProps) {
  const [templateName, setTemplateName] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [showPdfPreview, setShowPdfPreview] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
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
    editorProps: {
      attributes: {
        class: 'focus:outline-none',
      },
    },
  });

  useEffect(() => {
    if (template) {
      setTemplateName(template.TemplateName);
    }
  }, [template]);

  const insertPlaceholder = (key: string) => {
    if (!editor) return;
    const placeholder = `{{${key}}}`;
    editor.chain().focus().insertContent(placeholder).run();
  };

  const insertMovementTable = () => {
    if (!editor) return;
    const placeholder = `{{hareketTablosu}}`;
    editor.chain().focus().insertContent(placeholder).run();
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

      if (isNew) {
        const response = await reportTemplateService.createAsync({
          TemplateName: templateName,
          Content: content,
          IsDefault: false,
        });
        if (onSave) {
          onSave(response.TemplateId);
        }
        toast.success('Rapor şablonu başarıyla oluşturuldu!');
      } else if (template) {
        await reportTemplateService.updateAsync(template.TemplateId, {
          TemplateName: templateName,
          Content: content,
        });
        toast.success('Rapor şablonu başarıyla güncellendi!');
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
      const blob = await reportTemplateService.previewContentAsync(content);

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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
      <div className="bg-background-panel rounded-panel w-full max-w-6xl flex flex-col max-h-[95vh] overflow-hidden">
        <div className="px-6 pt-6 pb-4 shrink-0">
          <h2 className="text-2xl font-bold mb-4">
            {isNew ? 'Yeni Rapor Şablonu Oluştur' : 'Rapor Şablonu Düzenle'}
          </h2>

          <div>
            <label className="block text-sm font-medium mb-2">Şablon Adı *</label>
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              className="input w-full"
              placeholder="Örn: Standart Kiralama Hareket Raporu"
            />
          </div>
        </div>

        <div className="px-6 shrink-0">
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

            <select
              onChange={(e) => {
                if (e.target.value) {
                  insertPlaceholder(e.target.value);
                  e.target.value = '';
                }
              }}
              className="input text-sm px-2 py-1"
            >
              <option value="">Placeholder Ekle</option>
              {PLACEHOLDERS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
            <button
              onClick={insertMovementTable}
              className="btn-secondary text-sm px-3 py-1"
            >
              Hareket Tablosu
            </button>
          </div>
        </div>

        <div className="template-editor-workspace flex-1 p-2 md:p-4 flex justify-center overflow-auto min-h-0">
          <div className="template-editor-paper text-text-primary my-2">
            <EditorContent editor={editor} />
          </div>
        </div>

        <div className="px-6 py-4 flex gap-3 shrink-0 border-t border-background-border">
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
      <PdfPreviewModal
        open={showPdfPreview}
        pdfUrl={pdfPreviewUrl}
        title="Rapor Şablonu Önizleme"
        downloadFileName="rapor_sablon_onizleme.pdf"
        onClose={closePdfPreview}
      />
    </div>
  );
}
