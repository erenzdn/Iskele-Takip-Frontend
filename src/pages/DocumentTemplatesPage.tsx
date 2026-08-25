import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusIcon, UploadIcon, TrashIcon, PencilIcon } from '@phosphor-icons/react';
import { documentTemplateService, type DocumentTemplate } from '../services/documentTemplateService';
import { toast } from '../hooks/useToast';
import { getApiErrorMessage } from '../utils/apiError';
import { formatShortDateTime } from '../utils/formatters';
import EmptyState from '../components/EmptyState';
import { useHeaderActions } from '../layouts/HeaderActionsContext';

export default function DocumentTemplatesPage() {
  const navigate = useNavigate();
  const { setActions } = useHeaderActions();
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const data = await documentTemplateService.getAllAsync();
      setTemplates(data);
    } catch (error) {
      console.error('Şablonlar yüklenirken hata:', error);
      toast.error(getApiErrorMessage(error) || 'Şablonlar yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTemplates();
  }, [fetchTemplates]);

  const handleAddNew = useCallback(() => {
    navigate('/document-templates/new');
  }, [navigate]);

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const result = await documentTemplateService.importDocxAsync(file);
      toast.success(`"${result.name}" başarıyla yüklendi`);
      // Import edilen şablonu düzenleme modunda aç
      navigate(`/document-templates/${result.id}/edit`);
    } catch (error) {
      toast.error(getApiErrorMessage(error) || 'Dosya yüklenemedi');
    } finally {
      // Input'u sıfırla (aynı dosya tekrar seçilebilsin)
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [navigate]);

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleRowClick = useCallback((id: number) => {
    navigate(`/document-templates/${id}/edit`);
  }, [navigate]);

  const handleDelete = useCallback(async (e: React.MouseEvent, id: number, name: string) => {
    e.stopPropagation();
    
    if (!confirm(`"${name}" şablonunu silmek istediğinizden emin misiniz?`)) {
      return;
    }

    try {
      await documentTemplateService.deleteAsync(id);
      toast.success('Şablon silindi');
      void fetchTemplates();
    } catch (error) {
      toast.error(getApiErrorMessage(error) || 'Şablon silinemedi');
    }
  }, [fetchTemplates]);

  useEffect(() => {
    setActions(
      <>
        <button
          type="button"
          onClick={handleImportClick}
          className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
        >
          <UploadIcon size={16} />
          Dosyadan Yükle
        </button>
        <button
          type="button"
          onClick={handleAddNew}
          className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
        >
          <PlusIcon size={16} />
          Yeni Şablon
        </button>
      </>
    );
    return () => setActions(null);
  }, [setActions, handleAddNew, handleImportClick]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-text-secondary">Yükleniyor...</div>
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <>
        <input
          ref={fileInputRef}
          type="file"
          accept=".docx"
          onChange={handleImport}
          className="hidden"
        />
        <div className="flex flex-col items-center gap-4">
          <EmptyState
            title="Henüz belge şablonu oluşturulmamış"
            description="Yeni bir şablon oluşturun veya mevcut bir Word dosyasını yükleyin"
            icon={<PencilIcon size={48} className="text-text-secondary opacity-50" />}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleImportClick}
              className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
            >
              <UploadIcon size={16} />
              Dosyadan Yükle
            </button>
            <button
              type="button"
              onClick={handleAddNew}
              className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
            >
              <PlusIcon size={16} />
              Yeni Şablon
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".docx"
        onChange={handleImport}
        className="hidden"
      />
      <div className="border border-background-border rounded-panel overflow-hidden bg-background-panel">
        <div className="overflow-y-auto max-h-[calc(100vh-140px)] min-h-[320px]">
          <table className="w-full table-fixed text-xs border-collapse text-text-primary">
            <thead className="sticky top-0 z-10 border-b border-background-border">
              <tr>
                <th
                  className="text-left py-1 px-2 font-medium text-text-secondary border-r border-background-border bg-background-hover truncate"
                  style={{ width: '10%' }}
                >
                  ID
                </th>
                <th
                  className="text-left py-1 px-2 font-medium text-text-secondary border-r border-background-border bg-background-hover truncate"
                  style={{ width: '50%' }}
                >
                  Şablon Adı
                </th>
                <th
                  className="text-left py-1 px-2 font-medium text-text-secondary border-r border-background-border bg-background-hover truncate"
                  style={{ width: '30%' }}
                >
                  Son Güncelleme
                </th>
                <th
                  className="text-left py-1 px-2 font-medium text-text-secondary bg-background-hover truncate"
                  style={{ width: '10%' }}
                >
                  İşlem
                </th>
              </tr>
            </thead>
            <tbody>
              {templates.map((template, index) => (
                <tr
                  key={template.id}
                  onClick={() => handleRowClick(template.id)}
                  className={`border-b border-background-border hover:bg-background-hover cursor-pointer ${
                    index % 2 === 0 ? 'bg-background-panel' : 'bg-background-surface'
                  }`}
                >
                  <td className="py-0.5 px-2 align-middle border-r border-background-border/60 truncate">
                    {template.id}
                  </td>
                  <td className="py-0.5 px-2 align-middle border-r border-background-border/60 truncate">
                    {template.name}
                  </td>
                  <td className="py-0.5 px-2 align-middle border-r border-background-border/60 truncate">
                    {formatShortDateTime(template.updated_at)}
                  </td>
                  <td className="py-0.5 px-2 align-middle truncate">
                    <button
                      type="button"
                      onClick={(e) => handleDelete(e, template.id, template.name)}
                      className="p-1 rounded hover:bg-error/20 text-error"
                      title="Sil"
                    >
                      <TrashIcon size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="bg-background-hover border-t border-background-border px-2 py-1 text-xs text-text-secondary">
          Toplam {templates.length} şablon
        </div>
      </div>
    </>
  );
}
