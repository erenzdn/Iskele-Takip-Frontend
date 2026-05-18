import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeftIcon, CopyIcon, PencilSimpleIcon, PlusIcon, TrashIcon, PercentIcon } from '@phosphor-icons/react';
import { MaterialCategory, QuoteTemplate } from '../models';
import { inventoryService } from '../services/inventoryService';
import { quoteTemplateService } from '../services/quoteTemplateService';
import { getApiErrorMessage } from '../utils/apiError';
import { toast } from '../hooks/useToast';
import CategoryDetailModal from '../components/modals/CategoryDetailModal';
import CategoryDiscountModal from '../components/modals/CategoryDiscountModal';
import QuoteTemplateEditorModal from '../components/modals/QuoteTemplateEditorModal';
import ConfirmModal from '../components/modals/ConfirmModal';
import QuotePackagesPage from './QuotePackagesPage';

type ManagementTab = 'categories' | 'templates' | 'packages';

const tabs: { id: ManagementTab; label: string }[] = [
  { id: 'categories', label: 'Kategori Yönetimi' },
  { id: 'templates', label: 'Teklif Şablonları' },
  { id: 'packages', label: 'Teklif Paketleri' },
];

export default function OfferManagementPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const initialTab: ManagementTab = tabParam === 'templates' || tabParam === 'packages' ? tabParam : 'categories';
  const [activeTab, setActiveTab] = useState<ManagementTab>(initialTab);

  const [categories, setCategories] = useState<MaterialCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<MaterialCategory | null>(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [selectedCategoryForDiscount, setSelectedCategoryForDiscount] = useState<MaterialCategory | null>(null);
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);

  const [templates, setTemplates] = useState<QuoteTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<QuoteTemplate | null>(null);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isNewTemplate, setIsNewTemplate] = useState(false);

  const [templateToDelete, setTemplateToDelete] = useState<QuoteTemplate | null>(null);
  const [templateDeleting, setTemplateDeleting] = useState(false);
  const [templateCopyingId, setTemplateCopyingId] = useState<number | null>(null);

  const categorySummary = useMemo(() => {
    return `${categories.length} kategori`;
  }, [categories.length]);

  const templateSummary = useMemo(() => {
    const defaultCount = templates.filter((t) => t.IsDefault).length;
    return `${templates.length} şablon${defaultCount > 0 ? ` • ${defaultCount} varsayılan` : ''}`;
  }, [templates]);

  const loadCategories = async () => {
    try {
      setCategoriesLoading(true);
      const data = await inventoryService.getAllCategoriesAsync();
      setCategories(data);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setCategoriesLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      setTemplatesLoading(true);
      const data = await quoteTemplateService.getAllAsync(true);
      setTemplates(data);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setTemplatesLoading(false);
    }
  };

  useEffect(() => {
    void loadCategories();
    void loadTemplates();
  }, []);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const handleTabChange = (nextTab: ManagementTab) => {
    setActiveTab(nextTab);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', nextTab);
      return next;
    });
  };

  const openNewCategoryModal = () => {
    setSelectedCategory(null);
    setIsCategoryModalOpen(true);
  };

  const openEditCategoryModal = (category: MaterialCategory) => {
    setSelectedCategory(category);
    setIsCategoryModalOpen(true);
  };

  const closeCategoryModal = () => {
    setIsCategoryModalOpen(false);
    setSelectedCategory(null);
    void loadCategories();
  };

  const openDiscountModal = (category: MaterialCategory) => {
    setSelectedCategoryForDiscount(category);
    setIsDiscountModalOpen(true);
  };

  const closeDiscountModal = () => {
    setIsDiscountModalOpen(false);
    setSelectedCategoryForDiscount(null);
  };

  const openNewTemplateModal = () => {
    setEditingTemplate(null);
    setIsNewTemplate(true);
    setIsTemplateModalOpen(true);
  };

  const openEditTemplateModal = async (template: QuoteTemplate) => {
    try {
      const fullTemplate = await quoteTemplateService.getByIdAsync(template.TemplateId);
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
      await quoteTemplateService.deleteAsync(templateToDelete.TemplateId);
      toast.success('Şablon silindi.');
      setTemplateToDelete(null);
      await loadTemplates();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setTemplateDeleting(false);
    }
  };

  const handleCopyTemplate = async (template: QuoteTemplate) => {
    try {
      setTemplateCopyingId(template.TemplateId);
      await quoteTemplateService.copyAsync(template.TemplateId, `${template.TemplateName} (Kopya)`);
      toast.success('Şablon kopyalandı.');
      await loadTemplates();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setTemplateCopyingId(null);
    }
  };

  return (
    <div className="p-8 space-y-4">
      <div>
        <Link to="/system-settings" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
          <ArrowLeftIcon size={16} />
          Ayarlar'a Dön
        </Link>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Teklif & Kategori Yönetimi</h1>
          <p className="text-sm text-text-secondary">
            Kategori, alt kategori, teklif şablonu ve paket işlemlerini tek merkezden yönetin.
          </p>
        </div>
      </div>

      <section className="card p-2">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-primary text-white'
                  : 'bg-background-hover text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {activeTab === 'categories' && (
        <section className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-text-secondary">{categorySummary}</div>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary" onClick={() => void loadCategories()} disabled={categoriesLoading}>
                Yenile
              </button>
              <button type="button" className="btn-primary" onClick={openNewCategoryModal}>
                <PlusIcon size={16} className="inline-block mr-1" />
                Yeni Kategori
              </button>
            </div>
          </div>
          {categoriesLoading ? (
            <div className="text-text-secondary">Kategoriler yükleniyor...</div>
          ) : categories.length === 0 ? (
            <div className="text-text-secondary">Henüz kategori bulunmuyor.</div>
          ) : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
              {categories.map((category) => (
                <div
                  key={category.CategoryId}
                  className="rounded-lg border border-background-border bg-background-panel p-3 flex flex-col justify-between gap-3"
                >
                  <div>
                    <div className="font-medium text-text-primary">{category.CategoryName}</div>
                    <div className="text-xs text-text-secondary">
                      Kiralama birimi: {category.RentalUnit?.trim() ? category.RentalUnit : '-'}
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      className="btn-secondary text-xs px-2 py-1 flex items-center gap-1"
                      onClick={() => openEditCategoryModal(category)}
                    >
                      <PencilSimpleIcon size={14} />
                      Düzenle
                    </button>
                    <button
                      type="button"
                      className="btn-primary text-xs px-2 py-1 flex items-center gap-1"
                      onClick={() => openDiscountModal(category)}
                    >
                      <PercentIcon size={14} />
                      İndirim Uygula
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'templates' && (
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
            <div className="text-text-secondary">Henüz teklif şablonu bulunmuyor.</div>
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
      )}

      {activeTab === 'packages' && (
        <section className="space-y-2">
          <div className="text-sm text-text-secondary px-1">
            Teklif paketleri yönetimi bu sekmede merkezi olarak çalışır.
          </div>
          <div className="card p-0 overflow-hidden">
            <QuotePackagesPage />
          </div>
        </section>
      )}

      {isCategoryModalOpen && (
        <CategoryDetailModal category={selectedCategory} categories={categories} onClose={closeCategoryModal} />
      )}

      {isDiscountModalOpen && selectedCategoryForDiscount && (
        <CategoryDiscountModal
          category={selectedCategoryForDiscount}
          onClose={closeDiscountModal}
          onSuccess={() => void loadCategories()}
        />
      )}

      {isTemplateModalOpen && (
        <QuoteTemplateEditorModal
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
