import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { XIcon } from '@phosphor-icons/react';
import type {
  Addendum,
  AddendumDetail,
  ContractLineItem,
  ContractQuoteType,
  CurrencyCode,
  Inventory,
  Warehouse,
} from '../../models';
import { addendumService } from '../../services/addendumService';
import {
  canApproveOrRejectAddendum,
  canDeleteAddendum,
  canSubmitAddendum,
  getAddendumStatusBadgeClass,
  getAddendumStatusLabel,
  getChangeTypeLabel,
  isAddendumEditable,
} from '../../utils/addendum';
import { getApiErrorMessage, getUserFacingApiErrorMessage } from '../../utils/apiError';
import { formatMoney, formatShortDateTime } from '../../utils/formatters';
import { toast } from '../../hooks/useToast';
import { firstValidationError, validateRequired } from '../../utils/validation';
import ConfirmModal from './ConfirmModal';
import PdfPreviewModal from './PdfPreviewModal';
import AddendumLineItemModal from './AddendumLineItemModal';
import AddendumAddProductsModal from './AddendumAddProductsModal';

function todayDateInputValue(): string {
  return new Date().toISOString().split('T')[0];
}

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return todayDateInputValue();
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return todayDateInputValue();
  return d.toISOString().split('T')[0];
}

function detailSummary(d: AddendumDetail): string {
  if (d.ChangeType === 'ADD') {
    if (d.IsManual) return d.Description || 'Manuel kalem';
    const code = d.ItemCode ? `${d.ItemCode} — ` : '';
    return `${code}${d.ItemName || `Ürün #${d.ItemId ?? '—'}`}`;
  }
  if (d.ContractDetailDescription) return d.ContractDetailDescription;
  if (d.ItemName) return d.ItemName;
  return d.ContractDetailId != null ? `Kalem #${d.ContractDetailId}` : '—';
}

interface AddendumDetailModalProps {
  open: boolean;
  contractId: number;
  contractType: ContractQuoteType;
  /** null = yeni oluştur */
  addendumId: number | null;
  contractLines: ContractLineItem[];
  items: Inventory[];
  warehouses: Warehouse[];
  currency?: CurrencyCode;
  templateId?: number | '';
  canUpdate: boolean;
  canDelete: boolean;
  onClose: () => void;
  /** Liste + sözleşme yenileme */
  onChanged: (opts?: { approved?: boolean }) => Promise<void> | void;
  zIndexClass?: string;
}

export default function AddendumDetailModal({
  open,
  contractId,
  contractType,
  addendumId,
  contractLines,
  items,
  warehouses,
  currency = 'TRY',
  templateId = '',
  canUpdate,
  canDelete,
  onClose,
  onChanged,
  zIndexClass = 'z-[60]',
}: AddendumDetailModalProps) {
  const isRental = contractType === 'RENTAL';

  const [addendum, setAddendum] = useState<Addendum | null>(null);
  const [loading, setLoading] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [effectiveDate, setEffectiveDate] = useState(todayDateInputValue());
  const [reason, setReason] = useState('');
  const [addendumCode, setAddendumCode] = useState('');

  const [showLineModal, setShowLineModal] = useState(false);
  const [showAddProductsModal, setShowAddProductsModal] = useState(false);
  const [editingDetail, setEditingDetail] = useState<AddendumDetail | null>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const createStartedRef = useRef(false);

  const status = addendum?.Status ?? 'draft';
  const editable = Boolean(addendum && isAddendumEditable(status) && canUpdate);
  const details = addendum?.details ?? addendum?.Details ?? [];

  const loadAddendum = async (id: number) => {
    setLoading(true);
    try {
      const full = await addendumService.getByIdAsync(id);
      setAddendum(full);
      setEffectiveDate(toDateInputValue(full.EffectiveDate));
      setReason(full.Reason ?? '');
      setAddendumCode(full.AddendumCode ?? '');
    } catch (error) {
      console.error('Load addendum error:', error);
      toast.error(getUserFacingApiErrorMessage(error, 'addendum'));
      onClose();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) {
      setAddendum(null);
      setShowLineModal(false);
      setEditingDetail(null);
      setConfirmApprove(false);
      setConfirmDelete(false);
      setShowRejectModal(false);
      setRejectionReason('');
      createStartedRef.current = false;
      return;
    }

    let cancelled = false;

    const boot = async () => {
      if (addendumId != null) {
        await loadAddendum(addendumId);
        return;
      }
      if (!canUpdate) {
        toast.warning('Zeyilname oluşturmak için yetkiniz yok');
        onClose();
        return;
      }
      if (createStartedRef.current) return;
      createStartedRef.current = true;
      setLoading(true);
      try {
        const created = await addendumService.createAsync(contractId, {
          EffectiveDate: new Date(todayDateInputValue()).toISOString(),
          Reason: '',
        });
        if (cancelled) return;
        setAddendum(created);
        setEffectiveDate(toDateInputValue(created.EffectiveDate));
        setReason(created.Reason ?? '');
        setAddendumCode(created.AddendumCode ?? '');
        await Promise.resolve(onChanged());
      } catch (error) {
        createStartedRef.current = false;
        console.error('Create addendum error:', error);
        toast.error(getUserFacingApiErrorMessage(error, 'addendum'));
        onClose();
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void boot();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open/addendumId tetikler
  }, [open, addendumId, contractId]);

  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    };
  }, [pdfPreviewUrl]);

  if (!open) return null;

  const handleSaveHeader = async () => {
    if (!addendum || !editable) return;
    const err = firstValidationError([validateRequired(effectiveDate, 'Geçerlilik tarihi')]);
    if (err) {
      toast.warning(err);
      return;
    }
    try {
      setIsBusy(true);
      const updated = await addendumService.updateAsync(addendum.AddendumId, {
        EffectiveDate: new Date(effectiveDate).toISOString(),
        Reason: reason.trim() || null,
        AddendumCode: addendumCode.trim() || null,
      });
      setAddendum({ ...updated, details: details });
      toast.success('Zeyilname kaydedildi');
      await Promise.resolve(onChanged());
    } catch (error) {
      console.error('Update addendum error:', error);
      toast.error(getUserFacingApiErrorMessage(error, 'addendum'));
    } finally {
      setIsBusy(false);
    }
  };

  const refreshDetails = async () => {
    if (!addendum) return;
    const full = await addendumService.getByIdAsync(addendum.AddendumId);
    setAddendum(full);
    setEffectiveDate(toDateInputValue(full.EffectiveDate));
    setReason(full.Reason ?? '');
    setAddendumCode(full.AddendumCode ?? '');
  };

  const handleSubmit = async () => {
    if (!addendum || !canUpdate) return;
    if (!effectiveDate) {
      toast.warning('Geçerlilik tarihi zorunludur');
      return;
    }
    if (details.length < 1) {
      toast.warning('Onaya göndermek için en az bir kalem ekleyin');
      return;
    }
    try {
      setIsBusy(true);
      if (editable) {
        await addendumService.updateAsync(addendum.AddendumId, {
          EffectiveDate: new Date(effectiveDate).toISOString(),
          Reason: reason.trim() || null,
          AddendumCode: addendumCode.trim() || null,
        });
      }
      const updated = await addendumService.submitAsync(addendum.AddendumId);
      setAddendum({ ...updated, details: updated.details ?? details });
      toast.success('Zeyilname onaya gönderildi');
      await Promise.resolve(onChanged());
    } catch (error) {
      console.error('Submit addendum error:', error);
      toast.error(getUserFacingApiErrorMessage(error, 'addendum'));
    } finally {
      setIsBusy(false);
    }
  };

  const handleApprove = async () => {
    if (!addendum || !canUpdate) return;
    try {
      setIsBusy(true);
      const updated = await addendumService.approveAsync(addendum.AddendumId);
      setAddendum({ ...updated, details: updated.details ?? details });
      setConfirmApprove(false);
      toast.success('Zeyilname onaylandı ve sözleşmeye uygulandı');
      await Promise.resolve(onChanged({ approved: true }));
    } catch (error) {
      console.error('Approve addendum error:', error);
      toast.error(getUserFacingApiErrorMessage(error, 'addendum'));
    } finally {
      setIsBusy(false);
    }
  };

  const handleReject = async () => {
    if (!addendum || !canUpdate) return;
    const trimmed = rejectionReason.trim();
    if (!trimmed) {
      toast.warning('Red gerekçesi zorunludur');
      return;
    }
    try {
      setIsBusy(true);
      const updated = await addendumService.rejectAsync(addendum.AddendumId, {
        RejectionReason: trimmed,
      });
      setAddendum({ ...updated, details: updated.details ?? details });
      setShowRejectModal(false);
      setRejectionReason('');
      toast.success('Zeyilname reddedildi');
      await Promise.resolve(onChanged());
    } catch (error) {
      console.error('Reject addendum error:', error);
      toast.error(getUserFacingApiErrorMessage(error, 'addendum'));
    } finally {
      setIsBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!addendum || !canDelete || !canDeleteAddendum(status)) return;
    try {
      setIsBusy(true);
      await addendumService.deleteAsync(addendum.AddendumId);
      setConfirmDelete(false);
      toast.success('Zeyilname silindi');
      await Promise.resolve(onChanged());
      onClose();
    } catch (error) {
      console.error('Delete addendum error:', error);
      toast.error(getUserFacingApiErrorMessage(error, 'addendum'));
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteDetail = async (detailId: number) => {
    if (!addendum || !editable) return;
    try {
      setIsBusy(true);
      await addendumService.deleteDetailAsync(addendum.AddendumId, detailId);
      toast.success('Kalem silindi');
      await refreshDetails();
      await Promise.resolve(onChanged());
    } catch (error) {
      console.error('Delete addendum detail error:', error);
      toast.error(getUserFacingApiErrorMessage(error, 'addendum'));
    } finally {
      setIsBusy(false);
    }
  };

  const closePdfPreview = () => {
    setShowPdfPreview(false);
    if (pdfPreviewUrl) {
      URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(null);
    }
  };

  const handlePreviewPdf = async () => {
    if (!addendum) return;
    try {
      setIsBusy(true);
      const blob = await addendumService.previewDocumentAsync(
        addendum.AddendumId,
        templateId ? Number(templateId) : undefined
      );
      if (blob.size === 0) {
        toast.error('Sunucu boş yanıt döndürdü');
        return;
      }
      const url = window.URL.createObjectURL(blob);
      setPdfPreviewUrl(url);
      setShowPdfPreview(true);
    } catch (error) {
      console.error('Addendum preview error:', error);
      toast.error(getApiErrorMessage(error) || 'Önizleme hatası');
    } finally {
      setIsBusy(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!addendum) return;
    try {
      setIsBusy(true);
      const blob = await addendumService.generateDocumentAsync(
        addendum.AddendumId,
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
      a.download = `zeyilname_${addendum.AddendumId}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Addendum generate error:', error);
      toast.error(getApiErrorMessage(error) || 'PDF indirme hatası');
    } finally {
      setIsBusy(false);
    }
  };

  const titleNo =
    addendum?.AddendumNo != null
      ? `#${addendum.AddendumNo}`
      : addendum
        ? `#${addendum.AddendumId}`
        : '';

  const modalTree = (
    <div className={`fixed inset-0 flex flex-col bg-background-main ${zIndexClass}`}>
      <header className="shrink-0 flex items-center justify-between px-6 py-4 bg-background-panel border-b border-background-border shadow-sm gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-xl font-bold text-text-primary truncate">
            Zeyilname / Ek Protokol {titleNo}
          </h2>
          {addendum && (
            <span
              className={`shrink-0 text-xs px-2 py-0.5 rounded-full border ${getAddendumStatusBadgeClass(status)}`}
            >
              {getAddendumStatusLabel(status)}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-lg text-text-secondary hover:bg-background-hover hover:text-text-primary transition-colors"
          aria-label="Kapat"
          disabled={isBusy}
        >
          <XIcon size={22} weight="regular" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {loading || !addendum ? (
          <div className="text-center py-16 text-text-secondary">Yükleniyor...</div>
        ) : (
          <div className="max-w-5xl mx-auto space-y-6">
            {status === 'rejected' && addendum.RejectionReason && (
              <div className="rounded-xl border border-red-500/40 bg-red-900/20 px-4 py-3 text-sm text-red-200">
                <span className="font-medium">Red gerekçesi: </span>
                {addendum.RejectionReason}
              </div>
            )}

            <section className="rounded-xl border border-background-border bg-background-panel p-4 space-y-4">
              <h3 className="text-sm font-semibold text-text-primary">Genel Bilgiler</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-text-primary mb-1">
                    Geçerlilik Tarihi *
                  </label>
                  <input
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                    className="input w-full"
                    disabled={!editable || isBusy}
                  />
                  {isRental && (
                    <p className="text-[11px] text-amber-300/90 mt-1">
                      Bu tarihten itibaren ücretlenir.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-primary mb-1">
                    Zeyilname Kodu (opsiyonel)
                  </label>
                  <input
                    type="text"
                    value={addendumCode}
                    onChange={(e) => setAddendumCode(e.target.value)}
                    className="input w-full"
                    disabled={!editable || isBusy}
                    placeholder="Opsiyonel kod"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-text-primary mb-1">
                    Değişiklik Nedeni
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="input w-full min-h-[72px]"
                    disabled={!editable || isBusy}
                    placeholder="Örn: Ek malzeme ihtiyacı"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-text-secondary">
                {addendum.CreatedByName && <span>Oluşturan: {addendum.CreatedByName}</span>}
                {addendum.CreatedAt && <span>Oluşturma: {formatShortDateTime(addendum.CreatedAt)}</span>}
                {addendum.ApprovedByName && <span>Onaylayan: {addendum.ApprovedByName}</span>}
                {addendum.ApprovedAt && <span>Onay: {formatShortDateTime(addendum.ApprovedAt)}</span>}
              </div>
            </section>

            <section className="rounded-xl border border-background-border bg-background-panel p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-text-primary">Kalemler</h3>
                {editable && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-primary text-sm"
                      disabled={isBusy}
                      onClick={() => setShowAddProductsModal(true)}
                    >
                      Ürün Ekle
                    </button>
                    <button
                      type="button"
                      className="btn-secondary text-sm"
                      disabled={isBusy}
                      onClick={() => {
                        setEditingDetail(null);
                        setShowLineModal(true);
                      }}
                    >
                      Mevcut Kalemi Değiştir
                    </button>
                  </div>
                )}
              </div>

              {details.length === 0 ? (
                <div className="text-center py-8 text-text-secondary text-sm">
                  Henüz kalem eklenmedi. Yeni ürün için <strong className="text-text-primary">Ürün Ekle</strong>,
                  mevcut kalem için <strong className="text-text-primary">Mevcut Kalemi Değiştir</strong> kullanın.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-text-secondary border-b border-background-border">
                        <th className="py-2 pr-3 font-medium">Tip</th>
                        <th className="py-2 pr-3 font-medium">Açıklama</th>
                        <th className="py-2 pr-3 font-medium">Miktar</th>
                        <th className="py-2 pr-3 font-medium">Fiyat</th>
                        {editable && <th className="py-2 font-medium">İşlem</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {details.map((d) => (
                        <tr key={d.DetailId} className="border-b border-background-border/60">
                          <td className="py-2 pr-3 whitespace-nowrap">
                            {getChangeTypeLabel(d.ChangeType)}
                          </td>
                          <td className="py-2 pr-3">{detailSummary(d)}</td>
                          <td className="py-2 pr-3">
                            {d.QuantityChange != null ? d.QuantityChange : '—'}
                          </td>
                          <td className="py-2 pr-3">
                            {d.NewUnitPrice != null
                              ? formatMoney(d.NewUnitPrice)
                              : d.NewMonthlyOverride != null
                                ? `Aylık: ${formatMoney(d.NewMonthlyOverride)}`
                                : '—'}
                          </td>
                          {editable && (
                            <td className="py-2">
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  className="btn-secondary text-xs px-2 py-1"
                                  disabled={isBusy}
                                  onClick={() => {
                                    setEditingDetail(d);
                                    setShowLineModal(true);
                                  }}
                                >
                                  Düzenle
                                </button>
                                <button
                                  type="button"
                                  className="btn-secondary text-xs px-2 py-1 text-red-400 border-red-500/30"
                                  disabled={isBusy}
                                  onClick={() => void handleDeleteDetail(d.DetailId)}
                                >
                                  Sil
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      <footer className="shrink-0 flex flex-wrap items-center justify-between gap-2 px-6 py-4 bg-background-panel border-t border-background-border">
        <div className="flex flex-wrap gap-2">
          {addendum && (
            <>
              <button
                type="button"
                className="btn-secondary text-sm"
                disabled={isBusy || loading}
                onClick={() => void handlePreviewPdf()}
              >
                PDF Önizle
              </button>
              <button
                type="button"
                className="btn-secondary text-sm"
                disabled={isBusy || loading}
                onClick={() => void handleDownloadPdf()}
              >
                PDF İndir
              </button>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={isBusy}>
            Kapat
          </button>
          {editable && (
            <button
              type="button"
              className="btn-secondary"
              disabled={isBusy}
              onClick={() => void handleSaveHeader()}
            >
              Kaydet
            </button>
          )}
          {canUpdate && addendum && canSubmitAddendum(status) && (
            <button
              type="button"
              className="btn-primary"
              disabled={isBusy}
              onClick={() => void handleSubmit()}
            >
              Onaya Gönder
            </button>
          )}
          {canUpdate && addendum && canApproveOrRejectAddendum(status) && (
            <>
              <button
                type="button"
                className="btn-primary"
                disabled={isBusy}
                onClick={() => setConfirmApprove(true)}
              >
                Onayla
              </button>
              <button
                type="button"
                className="btn-secondary text-red-400 border-red-500/40"
                disabled={isBusy}
                onClick={() => {
                  setRejectionReason('');
                  setShowRejectModal(true);
                }}
              >
                Reddet
              </button>
            </>
          )}
          {canDelete && addendum && canDeleteAddendum(status) && (
            <button
              type="button"
              className="btn-danger"
              disabled={isBusy}
              onClick={() => setConfirmDelete(true)}
            >
              Sil
            </button>
          )}
        </div>
      </footer>

      <ConfirmModal
        open={confirmApprove}
        title="Zeyilnameyi onayla"
        message={
          'Bu işlem geri alınamaz.\nOnay sonrası değişiklikler sözleşmeye uygulanır.\n\nOnay sonrası değişiklik geri alınamaz.'
        }
        confirmLabel="Onayla"
        cancelLabel="Vazgeç"
        variant="danger"
        loading={isBusy}
        zIndexClass="z-[80]"
        onConfirm={() => void handleApprove()}
        onCancel={() => setConfirmApprove(false)}
      />

      <ConfirmModal
        open={confirmDelete}
        title="Zeyilnameyi sil"
        message="Bu taslak zeyilname kalıcı olarak silinecek. Devam edilsin mi?"
        confirmLabel="Sil"
        cancelLabel="Vazgeç"
        variant="danger"
        loading={isBusy}
        zIndexClass="z-[80]"
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmDelete(false)}
      />

      {showRejectModal && (
        <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-background-panel rounded-panel w-full max-w-md p-6 shadow-xl space-y-4">
            <h3 className="text-xl font-bold">Zeyilnameyi reddet</h3>
            <p className="text-sm text-text-secondary">Red gerekçesi zorunludur.</p>
            <textarea
              className="input w-full min-h-[100px]"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Red gerekçesi"
              disabled={isBusy}
            />
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                className="btn-secondary flex-1"
                disabled={isBusy}
                onClick={() => setShowRejectModal(false)}
              >
                Vazgeç
              </button>
              <button
                type="button"
                className="btn-danger flex-1"
                disabled={isBusy}
                onClick={() => void handleReject()}
              >
                {isBusy ? 'İşleniyor...' : 'Reddet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {addendum && (
        <AddendumAddProductsModal
          open={showAddProductsModal}
          addendumId={addendum.AddendumId}
          contractType={contractType}
          items={items}
          warehouses={warehouses}
          currency={currency}
          zIndexClass="z-[75]"
          onClose={() => setShowAddProductsModal(false)}
          onSaved={async () => {
            await refreshDetails();
            await Promise.resolve(onChanged());
          }}
        />
      )}

      {addendum && (
        <AddendumLineItemModal
          open={showLineModal}
          addendumId={addendum.AddendumId}
          contractType={contractType}
          contractLines={contractLines}
          items={items}
          warehouses={warehouses}
          editingDetail={editingDetail}
          initialChangeType={editingDetail ? undefined : 'INCREASE'}
          zIndexClass="z-[75]"
          onClose={() => {
            setShowLineModal(false);
            setEditingDetail(null);
          }}
          onSaved={async () => {
            await refreshDetails();
            await Promise.resolve(onChanged());
          }}
        />
      )}

      <PdfPreviewModal
        open={showPdfPreview}
        pdfUrl={pdfPreviewUrl}
        title={`Zeyilname ${titleNo} Önizleme`}
        downloadFileName={`zeyilname_${addendum?.AddendumId ?? ''}.pdf`}
        onClose={closePdfPreview}
      />
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalTree, document.body) : null;
}
