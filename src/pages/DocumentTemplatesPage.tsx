import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeftIcon,
  CopyIcon,
  FileTextIcon,
  PencilSimpleIcon,
  PlusIcon,
  ScrollIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import { ContractTemplate, QuoteTemplate } from '../models';
import { contractTemplateService } from '../services/contractTemplateService';
import { quoteTemplateService } from '../services/quoteTemplateService';
import { getApiErrorMessage } from '../utils/apiError';
import { isExtreContractTemplate, partitionContractTemplates, type ContractDocumentKind } from '../utils/documentTemplates';
import { toast } from '../hooks/useToast';
import QuoteTemplateEditorModal from '../components/modals/QuoteTemplateEditorModal';
import ContractTemplateEditorModal from '../components/modals/ContractTemplateEditorModal';
import ConfirmModal from '../components/modals/ConfirmModal';

type MainTab = 'quote' | 'contract';
type ContractFilter = 'all' | ContractDocumentKind;

const mainTabs: { id: MainTab; label: string; description: string }[] = [
  {
    id: 'quote',
    label: 'Teklif Şablonları',
    description: 'Müşteriye gönderilen teklif belgeleri için kullanılır.',
  },
  {
    id: 'contract',
    label: 'Sözleşme Şablonları',
    description: 'Sözleşme belgeleri ve kullanım ekstreleri için kullanılır.',
  },
];

function TemplateBadge({ kind }: { kind: 'quote' | 'contract' | 'extre' }) {
  const styles =
    kind === 'quote'
      ? 'bg-info/10 text-info'
      : kind === 'extre'
        ? 'bg-warning/10 text-warning'
        : 'bg-primary/10 text-primary';
  const label = kind === 'quote' ? 'Teklif' : kind === 'extre' ? 'Kullanım Extresi' : 'Sözleşme';
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles}`}>
      {label}
    </span>
  );
}

export default function DocumentTemplatesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const initialTab: MainTab = tabParam === 'contract' ? 'contract' : 'quote';
  const [activeTab, setActiveTab] = useState<MainTab>(initialTab);
  const [contractFilter, setContractFilter] = useState<ContractFilter>('all');

  const [quoteTemplates, setQuoteTemplates] = useState<QuoteTemplate[]>([]);
  const [contractTemplates, setContractTemplates] = useState<ContractTemplate[]>([]);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [contractLoading, setContractLoading] = useState(false);

  const [editingQuoteTemplate, setEditingQuoteTemplate] = useState<QuoteTemplate | null>(null);
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [isNewQuoteTemplate, setIsNewQuoteTemplate] = useState(false);
  const [quoteToDelete, setQuoteToDelete] = useState<QuoteTemplate | null>(null);
  const [quoteDeleting, setQuoteDeleting] = useState(false);
  const [quoteCopyingId, setQuoteCopyingId] = useState<number | null>(null);

  const [editingContractTemplate, setEditingContractTemplate] = useState<ContractTemplate | null>(null);
  const [isContractModalOpen, setIsContractModalOpen] = useState(false);
  const [isNewContractTemplate, setIsNewContractTemplate] = useState(false);
  const [contractToDelete, setContractToDelete] = useState<ContractTemplate | null>(null);
  const [contractDeleting, setContractDeleting] = useState(false);
  const [contractCopyingId, setContractCopyingId] = useState<number | null>(null);
  const [isEnsuringExtreTemplate, setIsEnsuringExtreTemplate] = useState(false);

  const { contractTemplates: regularContractTemplates, extreTemplates } = useMemo(
    () => partitionContractTemplates(contractTemplates),
    [contractTemplates]
  );

  const visibleContractTemplates = useMemo(() => {
    if (contractFilter === 'all') return contractTemplates;
    if (contractFilter === 'extre') return extreTemplates;
    return regularContractTemplates;
  }, [contractFilter, contractTemplates, extreTemplates, regularContractTemplates]);

  const quoteSummary = useMemo(() => {
    const defaultCount = quoteTemplates.filter((t) => t.IsDefault).length;
    return `${quoteTemplates.length} şablon${defaultCount > 0 ? ` • ${defaultCount} varsayılan` : ''}`;
  }, [quoteTemplates]);

  const contractSummary = useMemo(() => {
    const defaultCount = contractTemplates.filter((t) => t.IsDefault).length;
    return `${contractTemplates.length} şablon (${regularContractTemplates.length} sözleşme, ${extreTemplates.length} extre)${
      defaultCount > 0 ? ` • ${defaultCount} varsayılan` : ''
    }`;
  }, [contractTemplates, extreTemplates.length, regularContractTemplates.length]);

  const loadQuoteTemplates = useCallback(async () => {
    try {
      setQuoteLoading(true);
      const data = await quoteTemplateService.getAllAsync(true);
      setQuoteTemplates(data);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setQuoteLoading(false);
    }
  }, []);

  const loadContractTemplates = useCallback(async () => {
    try {
      setContractLoading(true);
      const data = await contractTemplateService.getAllAsync(true);
      setContractTemplates(data);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setContractLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQuoteTemplates();
    void loadContractTemplates();
  }, [loadContractTemplates, loadQuoteTemplates]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const handleMainTabChange = (nextTab: MainTab) => {
    setActiveTab(nextTab);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', nextTab);
      return next;
    });
  };

  const openNewQuoteTemplate = () => {
    setEditingQuoteTemplate(null);
    setIsNewQuoteTemplate(true);
    setIsQuoteModalOpen(true);
  };

  const openEditQuoteTemplate = async (template: QuoteTemplate) => {
    try {
      const fullTemplate = await quoteTemplateService.getByIdAsync(template.TemplateId);
      setEditingQuoteTemplate(fullTemplate);
      setIsNewQuoteTemplate(false);
      setIsQuoteModalOpen(true);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  const closeQuoteModal = () => {
    setIsQuoteModalOpen(false);
    setEditingQuoteTemplate(null);
    setIsNewQuoteTemplate(false);
    void loadQuoteTemplates();
  };

  const handleDeleteQuoteTemplate = async () => {
    if (!quoteToDelete) return;
    try {
      setQuoteDeleting(true);
      await quoteTemplateService.deleteAsync(quoteToDelete.TemplateId);
      toast.success('Teklif şablonu silindi.');
      setQuoteToDelete(null);
      await loadQuoteTemplates();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setQuoteDeleting(false);
    }
  };

  const handleCopyQuoteTemplate = async (template: QuoteTemplate) => {
    try {
      setQuoteCopyingId(template.TemplateId);
      await quoteTemplateService.copyAsync(template.TemplateId, `${template.TemplateName} (Kopya)`);
      toast.success('Teklif şablonu kopyalandı.');
      await loadQuoteTemplates();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setQuoteCopyingId(null);
    }
  };

  const openNewContractTemplate = () => {
    setEditingContractTemplate(null);
    setIsNewContractTemplate(true);
    setIsContractModalOpen(true);
  };

  const openEditContractTemplate = async (template: ContractTemplate) => {
    try {
      const fullTemplate = await contractTemplateService.getByIdAsync(template.TemplateId);
      setEditingContractTemplate(fullTemplate);
      setIsNewContractTemplate(false);
      setIsContractModalOpen(true);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  const closeContractModal = () => {
    setIsContractModalOpen(false);
    setEditingContractTemplate(null);
    setIsNewContractTemplate(false);
    void loadContractTemplates();
  };

  const handleDeleteContractTemplate = async () => {
    if (!contractToDelete) return;
    try {
      setContractDeleting(true);
      await contractTemplateService.deleteAsync(contractToDelete.TemplateId);
      toast.success('Sözleşme şablonu silindi.');
      setContractToDelete(null);
      await loadContractTemplates();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setContractDeleting(false);
    }
  };

  const handleCopyContractTemplate = async (template: ContractTemplate) => {
    try {
      setContractCopyingId(template.TemplateId);
      await contractTemplateService.copyAsync(template.TemplateId, `${template.TemplateName} (Kopya)`);
      toast.success('Sözleşme şablonu kopyalandı.');
      await loadContractTemplates();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setContractCopyingId(null);
    }
  };

  const handleEnsureExtreTemplate = async () => {
    try {
      setIsEnsuringExtreTemplate(true);
      const template = await contractTemplateService.ensureKullanimExtresiTemplateAsync();
      await loadContractTemplates();
      setContractFilter('extre');
      toast.success(`"${template.TemplateName}" şablonu hazır.`);
    } catch (error) {
      toast.error(getApiErrorMessage(error) || 'Kullanım Extresi şablonu oluşturulamadı');
    } finally {
      setIsEnsuringExtreTemplate(false);
    }
  };

  const activeTabMeta = mainTabs.find((tab) => tab.id === activeTab)!;

  return (
    <div className="space-y-3">
      <div>
        <Link to="/system-settings" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
          <ArrowLeftIcon size={16} />
          Ayarlar&apos;a Dön
        </Link>
      </div>

      <section className="card p-4 space-y-3">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Belge Şablonları</h2>
          <p className="text-sm text-text-secondary mt-1">
            Teklif, sözleşme ve kullanım extresi belgelerinin tasarımını tek merkezden yönetin.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {mainTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleMainTabChange(tab.id)}
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
        <p className="text-xs text-text-secondary">{activeTabMeta.description}</p>
      </section>

      {activeTab === 'quote' && (
        <section className="card p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-text-secondary">{quoteSummary}</div>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void loadQuoteTemplates()}
                disabled={quoteLoading}
              >
                Yenile
              </button>
              <button type="button" className="btn-primary" onClick={openNewQuoteTemplate}>
                <PlusIcon size={16} className="inline-block mr-1" />
                Yeni Teklif Şablonu
              </button>
            </div>
          </div>
          {quoteLoading ? (
            <div className="text-text-secondary">Şablonlar yükleniyor...</div>
          ) : quoteTemplates.length === 0 ? (
            <div className="rounded-xl border border-dashed border-background-border px-4 py-8 text-center text-sm text-text-secondary">
              Henüz teklif şablonu bulunmuyor.
            </div>
          ) : (
            <div className="space-y-2">
              {quoteTemplates.map((template) => (
                <div
                  key={template.TemplateId}
                  className="rounded-lg border border-background-border bg-background-panel p-3 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-text-primary">{template.TemplateName}</span>
                      <TemplateBadge kind="quote" />
                      {template.IsDefault && (
                        <span className="text-[10px] font-medium text-success uppercase tracking-wide">Varsayılan</span>
                      )}
                    </div>
                    <div className="text-xs text-text-secondary">Teklif PDF / Word belgelerinde kullanılır</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-secondary text-xs px-2 py-1"
                      onClick={() => void openEditQuoteTemplate(template)}
                    >
                      <PencilSimpleIcon size={14} className="inline-block mr-1" />
                      Düzenle
                    </button>
                    <button
                      type="button"
                      className="btn-secondary text-xs px-2 py-1"
                      onClick={() => void handleCopyQuoteTemplate(template)}
                      disabled={quoteCopyingId === template.TemplateId}
                    >
                      <CopyIcon size={14} className="inline-block mr-1" />
                      {quoteCopyingId === template.TemplateId ? 'Kopyalanıyor...' : 'Kopyala'}
                    </button>
                    <button
                      type="button"
                      className="btn-danger text-xs px-2 py-1"
                      onClick={() => setQuoteToDelete(template)}
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

      {activeTab === 'contract' && (
        <section className="card p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-text-secondary">{contractSummary}</div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void loadContractTemplates()}
                disabled={contractLoading}
              >
                Yenile
              </button>
              {extreTemplates.length === 0 && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => void handleEnsureExtreTemplate()}
                  disabled={isEnsuringExtreTemplate}
                >
                  <ScrollIcon size={16} className="inline-block mr-1" />
                  {isEnsuringExtreTemplate ? 'Oluşturuluyor...' : 'Extre Şablonu Oluştur'}
                </button>
              )}
              <button type="button" className="btn-primary" onClick={openNewContractTemplate}>
                <PlusIcon size={16} className="inline-block mr-1" />
                Yeni Sözleşme Şablonu
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: 'all' as const, label: `Tümü (${contractTemplates.length})` },
                { id: 'contract' as const, label: `Sözleşme (${regularContractTemplates.length})` },
                { id: 'extre' as const, label: `Kullanım Extresi (${extreTemplates.length})` },
              ] as const
            ).map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setContractFilter(filter.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  contractFilter === filter.id
                    ? 'bg-background-elevated text-text-primary border border-primary/30'
                    : 'bg-background-hover text-text-secondary hover:text-text-primary'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {contractLoading ? (
            <div className="text-text-secondary">Şablonlar yükleniyor...</div>
          ) : visibleContractTemplates.length === 0 ? (
            <div className="rounded-xl border border-dashed border-background-border px-4 py-8 text-center text-sm text-text-secondary">
              {contractFilter === 'extre'
                ? 'Henüz kullanım extresi şablonu yok. "Extre Şablonu Oluştur" ile hazır şablonu ekleyebilirsiniz.'
                : 'Bu filtrede görüntülenecek sözleşme şablonu bulunmuyor.'}
            </div>
          ) : (
            <div className="space-y-2">
              {visibleContractTemplates.map((template) => {
                const isExtre = isExtreContractTemplate(template);
                return (
                  <div
                    key={template.TemplateId}
                    className="rounded-lg border border-background-border bg-background-panel p-3 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-text-primary">{template.TemplateName}</span>
                        <TemplateBadge kind={isExtre ? 'extre' : 'contract'} />
                        {template.IsDefault && (
                          <span className="text-[10px] font-medium text-success uppercase tracking-wide">Varsayılan</span>
                        )}
                      </div>
                      <div className="text-xs text-text-secondary">
                        {isExtre
                          ? 'Kiralama sözleşmelerinde kullanım extresi PDF / Word belgelerinde kullanılır'
                          : 'Sözleşme ve zeyilname PDF / Word belgelerinde kullanılır'}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn-secondary text-xs px-2 py-1"
                        onClick={() => void openEditContractTemplate(template)}
                      >
                        <PencilSimpleIcon size={14} className="inline-block mr-1" />
                        Düzenle
                      </button>
                      <button
                        type="button"
                        className="btn-secondary text-xs px-2 py-1"
                        onClick={() => void handleCopyContractTemplate(template)}
                        disabled={contractCopyingId === template.TemplateId}
                      >
                        <CopyIcon size={14} className="inline-block mr-1" />
                        {contractCopyingId === template.TemplateId ? 'Kopyalanıyor...' : 'Kopyala'}
                      </button>
                      <button
                        type="button"
                        className="btn-danger text-xs px-2 py-1"
                        onClick={() => setContractToDelete(template)}
                      >
                        <TrashIcon size={14} className="inline-block mr-1" />
                        Sil
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      <section className="card p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background-hover text-text-secondary">
            <FileTextIcon size={18} />
          </span>
          <div className="text-sm text-text-secondary space-y-1">
            <p className="font-medium text-text-primary">Kullanım ipuçları</p>
            <p>Teklif şablonları yalnızca teklif ekranında; sözleşme şablonları sözleşme ekranında kullanılır.</p>
            <p>
              Sözleşme detayında belge türü seçerek sözleşme veya kullanım extresi belgesi oluşturabilirsiniz.
            </p>
          </div>
        </div>
      </section>

      {isQuoteModalOpen && (
        <QuoteTemplateEditorModal
          template={editingQuoteTemplate}
          isNew={isNewQuoteTemplate}
          onClose={closeQuoteModal}
          onSave={closeQuoteModal}
        />
      )}

      {isContractModalOpen && (
        <ContractTemplateEditorModal
          template={editingContractTemplate}
          isNew={isNewContractTemplate}
          onClose={closeContractModal}
          onSave={closeContractModal}
        />
      )}

      <ConfirmModal
        open={Boolean(quoteToDelete)}
        title="Onaylıyor musunuz?"
        message={
          quoteToDelete ? `"${quoteToDelete.TemplateName}" teklif şablonunu silmek istediğinizden emin misiniz?` : ''
        }
        variant="danger"
        loading={quoteDeleting}
        onConfirm={() => void handleDeleteQuoteTemplate()}
        onCancel={() => setQuoteToDelete(null)}
      />

      <ConfirmModal
        open={Boolean(contractToDelete)}
        title="Onaylıyor musunuz?"
        message={
          contractToDelete
            ? `"${contractToDelete.TemplateName}" sözleşme şablonunu silmek istediğinizden emin misiniz?`
            : ''
        }
        variant="danger"
        loading={contractDeleting}
        onConfirm={() => void handleDeleteContractTemplate()}
        onCancel={() => setContractToDelete(null)}
      />
    </div>
  );
}
