import { useCallback, useEffect, useState } from 'react';
import type {
  Addendum,
  ContractLineItem,
  ContractQuoteType,
  Inventory,
  Warehouse,
} from '../../models';
import { addendumService } from '../../services/addendumService';
import {
  getAddendumStatusBadgeClass,
  getAddendumStatusLabel,
} from '../../utils/addendum';
import { getApiErrorMessage, getUserFacingApiErrorMessage } from '../../utils/apiError';
import { formatDate, formatShortDateTime } from '../../utils/formatters';
import { toast } from '../../hooks/useToast';
import AddendumDetailModal from '../modals/AddendumDetailModal';
import PdfPreviewModal from '../modals/PdfPreviewModal';

interface ContractAddendaPanelProps {
  contractId: number;
  contractType: ContractQuoteType;
  contractActive: boolean;
  contractLines: ContractLineItem[];
  items: Inventory[];
  warehouses: Warehouse[];
  templateId?: number | '';
  canView: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  /** Onay sonrası sözleşme detayını yenile */
  onContractRefresh: () => Promise<void> | void;
  onClose: () => void;
  /** true iken panel açılınca Yeni Zeyilname editörünü başlatır */
  openCreateRequest?: boolean;
  onOpenCreateConsumed?: () => void;
}

export default function ContractAddendaPanel({
  contractId,
  contractType,
  contractActive,
  contractLines,
  items,
  warehouses,
  templateId = '',
  canView,
  canUpdate,
  canDelete,
  onContractRefresh,
  onClose,
  openCreateRequest = false,
  onOpenCreateConsumed,
}: ContractAddendaPanelProps) {
  const [list, setList] = useState<Addendum[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorAddendumId, setEditorAddendumId] = useState<number | null>(null);

  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [pdfTitle, setPdfTitle] = useState('Zeyilname Önizleme');

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await addendumService.listByContractAsync(contractId);
      rows.sort((a, b) => {
        const an = a.AddendumNo ?? a.AddendumId;
        const bn = b.AddendumNo ?? b.AddendumId;
        return bn - an;
      });
      setList(rows);
    } catch (err) {
      console.error('Load addendums error:', err);
      setError(getApiErrorMessage(err) || 'Zeyilnameler yüklenemedi');
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  useEffect(() => {
    if (!canView) return;
    void loadList();
  }, [canView, loadList]);

  useEffect(() => {
    if (openCreateRequest && canUpdate && contractActive) {
      setEditorAddendumId(null);
      setEditorOpen(true);
      onOpenCreateConsumed?.();
    }
  }, [openCreateRequest, canUpdate, contractActive, onOpenCreateConsumed]);

  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    };
  }, [pdfPreviewUrl]);

  const openCreate = () => {
    if (!canUpdate) {
      toast.warning('Zeyilname oluşturmak için yetkiniz yok');
      return;
    }
    if (!contractActive) {
      toast.warning('Yalnızca aktif sözleşmelerde yeni zeyilname oluşturulabilir');
      return;
    }
    setEditorAddendumId(null);
    setEditorOpen(true);
  };

  const openDetail = (id: number) => {
    setEditorAddendumId(id);
    setEditorOpen(true);
  };

  const closePdfPreview = () => {
    setShowPdfPreview(false);
    if (pdfPreviewUrl) {
      URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(null);
    }
  };

  const handlePreview = async (row: Addendum) => {
    try {
      setIsBusy(true);
      const blob = await addendumService.previewDocumentAsync(
        row.AddendumId,
        templateId ? Number(templateId) : undefined
      );
      if (blob.size === 0) {
        toast.error('Sunucu boş yanıt döndürdü');
        return;
      }
      const url = window.URL.createObjectURL(blob);
      setPdfPreviewUrl(url);
      setPdfTitle(
        `Zeyilname ${row.AddendumNo != null ? `#${row.AddendumNo}` : `#${row.AddendumId}`} Önizleme`
      );
      setShowPdfPreview(true);
    } catch (err) {
      console.error('Addendum list preview error:', err);
      toast.error(getUserFacingApiErrorMessage(err, 'addendum'));
    } finally {
      setIsBusy(false);
    }
  };

  const handleDownload = async (row: Addendum) => {
    try {
      setIsBusy(true);
      const blob = await addendumService.generateDocumentAsync(
        row.AddendumId,
        templateId ? Number(templateId) : undefined,
        'pdf'
      );
      if (blob.size === 0) {
        toast.error('Belge oluşturulamadı');
        return;
      }
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zeyilname_${row.AddendumId}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Addendum list download error:', err);
      toast.error(getUserFacingApiErrorMessage(err, 'addendum'));
    } finally {
      setIsBusy(false);
    }
  };

  if (!canView) {
    return (
      <div className="text-center py-12 text-text-secondary">
        Zeyilnameleri görüntüleme yetkiniz yok.
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold">Zeyilnameler / Ek Protokol</h3>
          <p className="text-sm text-text-secondary mt-1">
            Aktif sözleşmeye ürün ekleme, miktar veya fiyat değişikliği için zeyilname kullanın.
            Onaylanınca sözleşmeye uygulanır.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-secondary text-sm"
            disabled={loading || isBusy}
            onClick={() => void loadList()}
          >
            Yenile
          </button>
          {canUpdate && (
            <button
              type="button"
              className="btn-primary text-sm"
              disabled={!contractActive || isBusy}
              title={
                !contractActive
                  ? 'Tamamlanmış, iptal veya arşiv sözleşmelerde yeni zeyilname açılamaz'
                  : undefined
              }
              onClick={openCreate}
            >
              Yeni Zeyilname
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-text-secondary">Yükleniyor...</div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/40 bg-red-900/15 px-4 py-6 text-center space-y-3">
          <p className="text-sm text-red-200">{error}</p>
          <button type="button" className="btn-secondary text-sm" onClick={() => void loadList()}>
            Tekrar dene
          </button>
        </div>
      ) : list.length === 0 ? (
        <div className="text-center py-12 text-text-secondary">
          Bu sözleşmeye ait zeyilname bulunmuyor.
          {canUpdate && contractActive && (
            <div className="mt-3">
              <button type="button" className="btn-primary text-sm" onClick={openCreate}>
                İlk zeyilnameyi oluştur
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-background-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-secondary bg-background-panel border-b border-background-border">
                <th className="px-3 py-2.5 font-medium">No</th>
                <th className="px-3 py-2.5 font-medium">Kod</th>
                <th className="px-3 py-2.5 font-medium">Durum</th>
                <th className="px-3 py-2.5 font-medium">Geçerlilik</th>
                <th className="px-3 py-2.5 font-medium">Neden</th>
                <th className="px-3 py-2.5 font-medium">Oluşturan</th>
                <th className="px-3 py-2.5 font-medium">Onaylayan</th>
                <th className="px-3 py-2.5 font-medium">Tarih</th>
                <th className="px-3 py-2.5 font-medium">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {list.map((row) => (
                <tr
                  key={row.AddendumId}
                  className="border-b border-background-border/60 hover:bg-background-hover/40 cursor-pointer"
                  title="Zeyilname detayını aç"
                  onClick={() => openDetail(row.AddendumId)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openDetail(row.AddendumId);
                    }
                  }}
                  tabIndex={0}
                >
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {row.AddendumNo ?? row.AddendumId}
                  </td>
                  <td className="px-3 py-2.5">{row.AddendumCode || '—'}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-block text-xs px-2 py-0.5 rounded-full border ${getAddendumStatusBadgeClass(row.Status)}`}
                    >
                      {getAddendumStatusLabel(row.Status)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {row.EffectiveDate ? formatDate(row.EffectiveDate) : '—'}
                  </td>
                  <td className="px-3 py-2.5 max-w-[200px] truncate" title={row.Reason ?? undefined}>
                    {row.Reason || '—'}
                  </td>
                  <td className="px-3 py-2.5">{row.CreatedByName || '—'}</td>
                  <td className="px-3 py-2.5">{row.ApprovedByName || '—'}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {formatShortDateTime(row.CreatedAt)}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        className="btn-secondary text-xs px-2 py-1"
                        disabled={isBusy}
                        onClick={(event) => {
                          event.stopPropagation();
                          openDetail(row.AddendumId);
                        }}
                      >
                        Detay
                      </button>
                      <button
                        type="button"
                        className="btn-secondary text-xs px-2 py-1"
                        disabled={isBusy}
                        onClick={(event) => {
                          event.stopPropagation();
                          void handlePreview(row);
                        }}
                      >
                        PDF
                      </button>
                      <button
                        type="button"
                        className="btn-secondary text-xs px-2 py-1"
                        disabled={isBusy}
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleDownload(row);
                        }}
                      >
                        İndir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <button type="button" onClick={onClose} className="btn-secondary flex-1 sm:flex-none sm:min-w-[120px]">
          Kapat
        </button>
      </div>

      <AddendumDetailModal
        open={editorOpen}
        contractId={contractId}
        contractType={contractType}
        addendumId={editorAddendumId}
        contractLines={contractLines}
        items={items}
        warehouses={warehouses}
        templateId={templateId}
        canUpdate={canUpdate}
        canDelete={canDelete}
        onClose={() => setEditorOpen(false)}
        onChanged={async (opts) => {
          await loadList();
          if (opts?.approved) {
            await Promise.resolve(onContractRefresh());
          }
        }}
      />

      <PdfPreviewModal
        open={showPdfPreview}
        pdfUrl={pdfPreviewUrl}
        title={pdfTitle}
        downloadFileName="zeyilname.pdf"
        onClose={closePdfPreview}
      />
    </>
  );
}
