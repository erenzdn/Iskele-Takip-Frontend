import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftIcon, CopyIcon, PencilSimpleIcon, PlusIcon, TrashIcon } from '@phosphor-icons/react';
import { ContractTemplate } from '../models';
import { contractTemplateService } from '../services/contractTemplateService';
import { getApiErrorMessage } from '../utils/apiError';
import { toast } from '../hooks/useToast';
import ContractTemplateEditorModal from '../components/modals/ContractTemplateEditorModal';
import ConfirmModal from '../components/modals/ConfirmModal';

export default function ContractManagementPage() {
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ContractTemplate | null>(null);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isNewTemplate, setIsNewTemplate] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<ContractTemplate | null>(null);
  const [templateDeleting, setTemplateDeleting] = useState(false);
  const [templateCopyingId, setTemplateCopyingId] = useState<number | null>(null);

  const templateSummary = useMemo(() => {
    const defaultCount = templates.filter((t) => t.IsDefault).length;
    return `${templates.length} şablon${defaultCount > 0 ? ` • ${defaultCount} varsayılan` : ''}`;
  }, [templates]);

  const loadTemplates = async () => {
    try {
      setTemplatesLoading(true);
      const data = await contractTemplateService.getAllAsync(true);
      setTemplates(data);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setTemplatesLoading(false);
    }
  };

  useEffect(() => {
    void loadTemplates();
  }, []);

  const openNewTemplateModal = () => {
    setEditingTemplate(null);
    setIsNewTemplate(true);
    setIsTemplateModalOpen(true);
  };

  const openEditTemplateModal = async (template: ContractTemplate) => {
    try {
      const fullTemplate = await contractTemplateService.getByIdAsync(template.TemplateId);
      setEditingTemplate(fullTemplate);
      setIsNewTemplate(false);
      setIsTemplateModalOpen(true);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  const closeTemplateModal = () => {
    setIsTemplateModalOpen(false);
    setEditingTemplate(null);
    setIsNewTemplate(false);
    void loadTemplates();
  };

  const handleDeleteTemplate = async () => {
    if (!templateToDelete) return;
    try {
      setTemplateDeleting(true);
      await contractTemplateService.deleteAsync(templateToDelete.TemplateId);
      toast.success('Şablon silindi.');
      setTemplateToDelete(null);
      await loadTemplates();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setTemplateDeleting(false);
    }
  };

  const handleCopyTemplate = async (template: ContractTemplate) => {
    try {
      setTemplateCopyingId(template.TemplateId);
      await contractTemplateService.copyAsync(template.TemplateId, `${template.TemplateName} (Kopya)`);
      toast.success('Şablon kopyalandı.');
      await loadTemplates();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setTemplateCopyingId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <Link to="/system-settings" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
          <ArrowLeftIcon size={16} />
          Ayarlar&apos;a Dön
        </Link>
      </div>

      <section className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm text-text-secondary">{templateSummary}</div>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={() => void loadTemplates()} disabled={templatesLoading}>
              Yenile
            </button>
            <button type="button" className="btn-primary" onClick={openNewTemplateModal}>
              <PlusIcon size={16} className="inline-block mr-1" />
              Yeni Şablon
            </button>
          </div>
        </div>
        {templatesLoading ? (
          <div className="text-text-secondary">Şablonlar yükleniyor...</div>
        ) : templates.length === 0 ? (
          <div className="text-text-secondary">Henüz sözleşme şablonu bulunmuyor.</div>
        ) : (
          <div className="space-y-2">
            {templates.map((template) => (
              <div
                key={template.TemplateId}
                className="rounded-lg border border-background-border bg-background-panel p-3 flex flex-wrap items-center justify-between gap-3"
              >
                <div>
                  <div className="font-medium text-text-primary">{template.TemplateName}</div>
                  <div className="text-xs text-text-secondary">
                    {template.IsDefault ? 'Varsayılan şablon' : 'Özel şablon'}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-secondary text-xs px-2 py-1"
                    onClick={() => void openEditTemplateModal(template)}
                  >
                    <PencilSimpleIcon size={14} className="inline-block mr-1" />
                    Düzenle
                  </button>
                  <button
                    type="button"
                    className="btn-secondary text-xs px-2 py-1"
                    onClick={() => void handleCopyTemplate(template)}
                    disabled={templateCopyingId === template.TemplateId}
                  >
                    <CopyIcon size={14} className="inline-block mr-1" />
                    {templateCopyingId === template.TemplateId ? 'Kopyalanıyor...' : 'Kopyala'}
                  </button>
                  <button
                    type="button"
                    className="btn-danger text-xs px-2 py-1"
                    onClick={() => setTemplateToDelete(template)}
                  >
                    <TrashIcon size={14} className="inline-block mr-1" />
                    Sil
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {isTemplateModalOpen && (
        <ContractTemplateEditorModal
          template={editingTemplate}
          isNew={isNewTemplate}
          onClose={closeTemplateModal}
          onSave={() => {
            closeTemplateModal();
          }}
        />
      )}

      <ConfirmModal
        open={Boolean(templateToDelete)}
        title="Onaylıyor musunuz?"
        message={
          templateToDelete
            ? `"${templateToDelete.TemplateName}" şablonunu silmek istediğinizden emin misiniz?`
            : ''
        }
        variant="danger"
        loading={templateDeleting}
        onConfirm={() => void handleDeleteTemplate()}
        onCancel={() => setTemplateToDelete(null)}
      />
    </div>
  );
}
