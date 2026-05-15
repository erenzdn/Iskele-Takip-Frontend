import { useState, useEffect, useCallback } from 'react';
import { XIcon, TrashIcon, PlusIcon } from '@phosphor-icons/react';
import {
  StockReceipt,
  StockReceiptDetail,
  StockReceiptItem,
  ReceiptType,
  CreateStockReceiptRequest,
  Inventory,
  Warehouse,
  ReportTemplate,
} from '../../models';
import { stockReceiptService } from '../../services/stockReceiptService';
import { warehouseService } from '../../services/warehouseService';
import { inventoryService } from '../../services/inventoryService';
import { reportTemplateService } from '../../services/reportTemplateService';
import { useAuthStore } from '../../store/authStore';
import { getApiErrorMessage } from '../../utils/apiError';
import { toast } from '../../hooks/useToast';
import { formatShortDateTime } from '../../utils/formatters';
import ConfirmModal from './ConfirmModal';
import PdfPreviewModal from './PdfPreviewModal';
import ProductPickerModal from './ProductPickerModal';
import SearchableItemCombobox from '../SearchableItemCombobox';
import ReportTemplateEditorModal from './ReportTemplateEditorModal';

const RECEIPT_TYPE_LABELS: Record<ReceiptType, string> = {
  IN: 'Giriş',
  OUT: 'Çıkış',
  CONSUMPTION: 'Sarf/Fire',
  TRANSFER: 'Transfer',
};

const STATUS_LABELS = { ACTIVE: 'Aktif', CANCELLED: 'İptal' } as const;

interface StockReceiptDetailModalProps {
  receipt: StockReceipt | null;
  isNew: boolean;
  onClose: () => void;
}

interface CreateLineRow {
  clientId: string;
  ItemId: number | '';
  Quantity: string;
  Description: string;
}

export default function StockReceiptDetailModal({
  receipt: receiptProp,
  isNew,
  onClose,
}: StockReceiptDetailModalProps) {
  const user = useAuthStore((state) => state.user);
  const canCreate = user?.permissions?.includes('stockReceipts_create');
  const canCreateReportTemplate = user?.permissions?.includes('reportTemplates_create');
  const canUpdateReportTemplate = user?.permissions?.includes('reportTemplates_update');

  const [detail, setDetail] = useState<StockReceiptDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [inventoryItems, setInventoryItems] = useState<Inventory[]>([]);

  const [receiptType, setReceiptType] = useState<ReceiptType>('IN');
  const [warehouseId, setWarehouseId] = useState<number | ''>('');
  const [targetWarehouseId, setTargetWarehouseId] = useState<number | ''>('');
  const [description, setDescription] = useState('');
  const [lineRows, setLineRows] = useState<CreateLineRow[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showProductPicker, setShowProductPicker] = useState(false);

  const [reportTemplates, setReportTemplates] = useState<ReportTemplate[]>([]);
  const [selectedPdfTemplateId, setSelectedPdfTemplateId] = useState<number | ''>('');
  const [editingTemplate, setEditingTemplate] = useState<ReportTemplate | null>(null);
  const [isNewTemplate, setIsNewTemplate] = useState(false);

  useEffect(() => {
    warehouseService.getAllAsync().then(setWarehouses).catch(() => setWarehouses([]));
    inventoryService.getAllAsync().then(setInventoryItems).catch(() => setInventoryItems([]));
  }, []);

  useEffect(() => {
    if (!isNew) {
      reportTemplateService
        .getAllAsync()
        .then((list) => {
          setReportTemplates(list ?? []);
          const defaultT = (list ?? []).find((t) => t.IsDefault);
          setSelectedPdfTemplateId((prev) => (prev === '' && defaultT ? defaultT.TemplateId : prev));
        })
        .catch(() => setReportTemplates([]));
    }
  }, [isNew]);

  useEffect(() => {
    if (!isNew && receiptProp?.ReceiptId) {
      setLoadingDetail(true);
      stockReceiptService
        .getByIdAsync(receiptProp.ReceiptId)
        .then(setDetail)
        .catch(() => setDetail(null))
        .finally(() => setLoadingDetail(false));
    } else {
      setDetail(null);
      if (isNew) {
        setLineRows([]);
      }
    }
  }, [isNew, receiptProp?.ReceiptId]);

  const handleCancelReceipt = async () => {
    if (!detail?.ReceiptId) return;
    try {
      setIsBusy(true);
      await stockReceiptService.cancelAsync(detail.ReceiptId);
      const [refetchedDetail, refetchedInventory] = await Promise.all([
        stockReceiptService.getByIdAsync(detail.ReceiptId),
        inventoryService.getAllAsync(),
      ]);
      setDetail(refetchedDetail);
      setInventoryItems(refetchedInventory ?? []);
      setShowCancelConfirm(false);
      onClose();
    } catch (error) {
      toast.error(getApiErrorMessage(error) || 'İptal işlemi başarısız');
    } finally {
      setIsBusy(false);
    }
  };

  const handlePdfDownload = async () => {
    if (!detail?.ReceiptId) return;
    try {
      setIsBusy(true);
      const templateId = selectedPdfTemplateId === '' ? undefined : selectedPdfTemplateId;
      const blob = await stockReceiptService.getPdfBlobAsync(detail.ReceiptId, templateId);
      if (blob.size === 0) {
        toast.error('PDF oluşturulamadı.');
        return;
      }
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stok-fisi-${detail.ReceiptNo || detail.ReceiptId}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(getApiErrorMessage(error) || 'PDF indirme hatası');
    } finally {
      setIsBusy(false);
    }
  };

  const handlePdfPreview = async () => {
    if (!detail?.ReceiptId) return;
    try {
      setPdfLoading(true);
      const templateId = selectedPdfTemplateId === '' ? undefined : selectedPdfTemplateId;
      const blob = await stockReceiptService.getPdfBlobAsync(detail.ReceiptId, templateId);
      if (blob.size === 0) {
        toast.error('PDF oluşturulamadı.');
        return;
      }
      const url = window.URL.createObjectURL(blob);
      setPdfPreviewUrl(url);
      setShowPdfPreview(true);
    } catch (error) {
      toast.error(getApiErrorMessage(error) || 'PDF önizleme hatası');
    } finally {
      setPdfLoading(false);
    }
  };

  const closePdfPreview = useCallback(() => {
    setShowPdfPreview(false);
    if (pdfPreviewUrl) {
      window.URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(null);
    }
  }, [pdfPreviewUrl]);

  const addItemFromPicker = (item: Inventory, quantity: number) => {
    setLineRows((prev) => [
      ...prev,
      {
        clientId: crypto.randomUUID(),
        ItemId: item.ItemId,
        Quantity: String(Math.max(1, quantity)),
        Description: '',
      },
    ]);
    setShowProductPicker(false);
    return true;
  };

  const removeLineRow = (clientId: string) => {
    setLineRows((prev) => prev.filter((r) => r.clientId !== clientId));
  };

  const updateLineRow = (clientId: string, patch: Partial<CreateLineRow>) => {
    setLineRows((prev) =>
      prev.map((r) => (r.clientId === clientId ? { ...r, ...patch } : r))
    );
  };

  const handleCreateSubmit = async () => {
    setCreateError(null);
    if (!warehouseId) {
      setCreateError('Depo seçimi zorunludur.');
      return;
    }
    if (receiptType === 'TRANSFER' && (!targetWarehouseId || targetWarehouseId === warehouseId)) {
      setCreateError('Transfer için farklı bir hedef depo seçmelisiniz.');
      return;
    }
    const validRows = lineRows.filter((r) => Number(r.Quantity) > 0 && r.ItemId !== '');
    const hasInvalidRows = lineRows.some((r) => Number(r.Quantity) <= 0 || r.ItemId === '');
    if (validRows.length === 0) {
      setCreateError('En az bir kalem ekleyin ve her satırda ürün seçin.');
      return;
    }
    if (hasInvalidRows) {
      setCreateError('Tüm satırlarda ürün seçimi ve pozitif miktar zorunludur.');
      return;
    }
    const quantityInt = (n: number) => Math.max(1, Math.floor(Number(n)) || 1);
    const items = validRows.map((r) => ({
      ItemId: Number(r.ItemId),
      Quantity: quantityInt(Number(r.Quantity)),
      ...(r.Description.trim() ? { Description: r.Description.trim() } : {}),
    }));

    try {
      setIsBusy(true);
      const payload: CreateStockReceiptRequest = {
        ReceiptType: receiptType,
        WarehouseId: Number(warehouseId),
        items,
      };
      if (receiptType === 'TRANSFER' && targetWarehouseId !== '') {
        payload.TargetWarehouseId = Number(targetWarehouseId);
      }
      if (description.trim()) {
        payload.Description = description.trim();
      }
      if (import.meta.env.DEV) {
        console.log('[Stok Fişi] POST body:', JSON.stringify(payload, null, 2));
      }
      await stockReceiptService.createAsync(payload);
      const [refetchedInventory, refetchedWarehouses] = await Promise.all([
        inventoryService.getAllAsync(),
        warehouseService.getAllAsync(),
      ]);
      setInventoryItems(refetchedInventory ?? []);
      setWarehouses(refetchedWarehouses ?? []);
      onClose();
    } catch (error) {
      setCreateError(getApiErrorMessage(error) || 'Fiş oluşturulamadı.');
    } finally {
      setIsBusy(false);
    }
  };

  const displayReceipt = detail ?? receiptProp;
  const items = detail?.items ?? [];

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-background-panel rounded-panel w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <header className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-background-border">
            <h2 className="text-xl font-semibold text-text-primary">
              {isNew ? 'Yeni Stok Fişi' : (displayReceipt?.ReceiptNo ? `Stok Fişi: ${displayReceipt.ReceiptNo}` : 'Stok Fişi Detayı')}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-text-secondary hover:bg-background-hover hover:text-text-primary transition-colors"
              aria-label="Kapat"
            >
              <XIcon size={22} weight="regular" />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto p-6">
            {!isNew && loadingDetail && (
              <div className="text-text-secondary py-8">Yükleniyor...</div>
            )}

            {!isNew && !loadingDetail && displayReceipt && (
              <>
                <div className="grid grid-cols-2 gap-4 text-sm mb-6">
                  <div>
                    <span className="text-text-secondary">İşlem tipi: </span>
                    <span className="font-medium">{RECEIPT_TYPE_LABELS[displayReceipt.ReceiptType]}</span>
                  </div>
                  <div>
                    <span className="text-text-secondary">Depo: </span>
                    <span className="font-medium">{displayReceipt.WarehouseName ?? '-'}</span>
                  </div>
                  {displayReceipt.ReceiptType === 'TRANSFER' && (
                    <div>
                      <span className="text-text-secondary">Hedef depo: </span>
                      <span className="font-medium">{displayReceipt.TargetWarehouseName ?? '-'}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-text-secondary">Durum: </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        displayReceipt.Status === 'CANCELLED'
                          ? 'bg-red-500/15 text-red-400'
                          : 'bg-emerald-500/15 text-emerald-400'
                      }`}
                    >
                      {STATUS_LABELS[displayReceipt.Status]}
                    </span>
                  </div>
                  <div>
                    <span className="text-text-secondary">Oluşturan: </span>
                    <span className="font-medium">{displayReceipt.CreatedByName ?? '-'}</span>
                  </div>
                  <div>
                    <span className="text-text-secondary">Tarih: </span>
                    <span className="font-medium">{formatShortDateTime(displayReceipt.CreatedAt ?? null)}</span>
                  </div>
                  {displayReceipt.Description && (
                    <div className="col-span-2">
                      <span className="text-text-secondary">Açıklama: </span>
                      <span className="font-medium">{displayReceipt.Description}</span>
                    </div>
                  )}
                </div>

                <div className="mb-4">
                  <h3 className="text-sm font-medium text-text-secondary mb-2">Kalemler</h3>
                  <div className="border border-background-border rounded overflow-hidden">
                    <table className="w-full text-xs border-collapse text-text-primary">
                      <thead className="bg-background-surface">
                        <tr>
                          <th className="text-left py-2 px-2 font-medium">Ürün</th>
                          <th className="text-right py-2 px-2 font-medium">Miktar</th>
                          <th className="text-left py-2 px-2 font-medium">Açıklama</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item: StockReceiptItem) => (
                          <tr key={item.ItemLineId} className="border-t border-background-border bg-background-surface hover:bg-background-hover transition-colors">
                            <td className="py-1.5 px-2">{item.ItemName ?? '-'}</td>
                            <td className="py-1.5 px-2 text-right">{item.Quantity}</td>
                            <td className="py-1.5 px-2 text-text-secondary">{item.Description?.trim() || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mb-4 p-3 rounded-lg border border-background-border bg-background-hover/30">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <label className="block text-sm font-medium text-text-secondary">PDF şablonu</label>
                    <div className="flex items-center gap-2">
                      {canCreateReportTemplate && (
                        <button
                          type="button"
                          className="btn-secondary text-xs py-1 px-2"
                          onClick={() => {
                            setEditingTemplate(null);
                            setIsNewTemplate(true);
                          }}
                        >
                          Yeni şablon
                        </button>
                      )}
                      {canUpdateReportTemplate && selectedPdfTemplateId !== '' && (
                        <button
                          type="button"
                          className="btn-secondary text-xs py-1 px-2"
                          onClick={() => {
                            const t = reportTemplates.find((x) => x.TemplateId === selectedPdfTemplateId);
                            if (t) {
                              setEditingTemplate(t);
                              setIsNewTemplate(false);
                            }
                          }}
                        >
                          Seçiliyi düzenle
                        </button>
                      )}
                    </div>
                  </div>
                  <select
                    value={selectedPdfTemplateId === '' ? '' : selectedPdfTemplateId}
                    onChange={(e) => setSelectedPdfTemplateId(e.target.value === '' ? '' : Number(e.target.value))}
                    className="input w-full max-w-xs py-2 px-3 text-sm"
                  >
                    <option value="">Varsayılan şablon</option>
                    {reportTemplates.map((t) => (
                      <option key={t.TemplateId} value={t.TemplateId}>
                        {t.TemplateName}
                        {t.IsDefault ? ' (varsayılan)' : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-text-secondary mt-1">İndir ve önizlemede bu şablon kullanılır.</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handlePdfDownload}
                    disabled={isBusy}
                    className="btn-secondary text-sm"
                  >
                    PDF İndir
                  </button>
                  <button
                    type="button"
                    onClick={handlePdfPreview}
                    disabled={pdfLoading || isBusy}
                    className="btn-secondary text-sm"
                  >
                    {pdfLoading ? 'Hazırlanıyor...' : 'PDF Önizleme'}
                  </button>
                  {canCreate && displayReceipt.Status === 'ACTIVE' && (
                    <button
                      type="button"
                      onClick={() => setShowCancelConfirm(true)}
                      disabled={isBusy}
                      className="btn-danger text-sm"
                    >
                      İptal Et
                    </button>
                  )}
                  {canCreate && displayReceipt.Status === 'CANCELLED' && (
                    <button
                      type="button"
                      disabled
                      className="btn-secondary text-sm opacity-60 cursor-not-allowed"
                      title="İptal edilmiş fiş yeniden iptal edilemez."
                    >
                      Zaten İptal Edildi
                    </button>
                  )}
                </div>
              </>
            )}

            {isNew && (
              <>
                <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                  <div>
                    <label className="block text-text-secondary mb-1">İşlem tipi</label>
                    <select
                      value={receiptType}
                      onChange={(e) => setReceiptType(e.target.value as ReceiptType)}
                      className="input w-full py-2 px-3"
                    >
                      <option value="IN">Giriş</option>
                      <option value="OUT">Çıkış</option>
                      <option value="CONSUMPTION">Sarf/Fire</option>
                      <option value="TRANSFER">Transfer</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-text-secondary mb-1">Depo (kaynak)</label>
                    <select
                      value={warehouseId}
                      onChange={(e) => setWarehouseId(e.target.value === '' ? '' : Number(e.target.value))}
                      className="input w-full py-2 px-3"
                    >
                      <option value="">Seçin</option>
                      {warehouses.map((w) => (
                        <option key={w.WarehouseId} value={w.WarehouseId}>
                          {w.WarehouseName}
                        </option>
                      ))}
                    </select>
                  </div>
                  {receiptType === 'TRANSFER' && (
                    <div>
                      <label className="block text-text-secondary mb-1">Hedef depo</label>
                      <select
                        value={targetWarehouseId}
                        onChange={(e) => setTargetWarehouseId(e.target.value === '' ? '' : Number(e.target.value))}
                        className="input w-full py-2 px-3"
                      >
                        <option value="">Seçin</option>
                        {warehouses
                          .filter((w) => w.WarehouseId !== warehouseId)
                          .map((w) => (
                            <option key={w.WarehouseId} value={w.WarehouseId}>
                              {w.WarehouseName}
                            </option>
                          ))}
                      </select>
                    </div>
                  )}
                  <div className={receiptType === 'TRANSFER' ? '' : 'col-span-2'}>
                    <label className="block text-text-secondary mb-1">Açıklama (opsiyonel)</label>
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="input w-full py-2 px-3"
                      placeholder="Kısa açıklama"
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-text-secondary">Fiş kalemleri</h3>
                    <button
                      type="button"
                      onClick={() => setShowProductPicker(true)}
                      className="btn-primary text-sm flex items-center gap-2 py-2 px-3"
                    >
                      <PlusIcon size={18} weight="bold" /> Ürün ekle
                    </button>
                  </div>
                  {lineRows.length === 0 ? (
                    <div className="border border-dashed border-background-border rounded-lg py-8 px-4 text-center bg-background-hover/30">
                      <p className="text-text-secondary text-sm mb-3">Henüz kalem eklenmedi.</p>
                      <p className="text-text-secondary/80 text-xs mb-4">Kalem eklemek için envanterden ürün seçin.</p>
                      <button
                        type="button"
                        onClick={() => setShowProductPicker(true)}
                        className="btn-primary text-sm inline-flex items-center gap-2"
                      >
                        <PlusIcon size={16} /> Ürün ekle
                      </button>
                    </div>
                  ) : (
                    <div className="border border-background-border rounded-lg overflow-visible">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse text-text-primary">
                        <thead className="bg-background-surface">
                          <tr>
                            <th className="text-left py-2.5 px-3 font-medium text-text-secondary min-w-[260px]">Ürün</th>
                            <th className="text-right py-2.5 px-3 font-medium text-text-secondary w-28">Miktar</th>
                            <th className="text-left py-2.5 px-3 font-medium text-text-secondary min-w-[140px]">Açıklama</th>
                            <th className="w-12"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {lineRows.map((row) => {
                            const itemName = row.ItemId
                              ? (inventoryItems.find((i) => i.ItemId === row.ItemId)?.ItemName ?? `#${row.ItemId}`)
                              : null;
                            return (
                              <tr key={row.clientId} className="border-t border-background-border bg-background-surface hover:bg-background-hover transition-colors">
                                <td className="py-2 px-3 align-top min-w-[260px]">
                                  {itemName !== null ? (
                                    <span className="font-medium text-text-primary">{itemName}</span>
                                  ) : (
                                    <div className="w-full min-w-[240px]">
                                      <SearchableItemCombobox
                                        items={inventoryItems}
                                        value={row.ItemId}
                                        onChange={(id) => updateLineRow(row.clientId, { ItemId: id })}
                                        placeholder="Ürün seçin..."
                                      />
                                    </div>
                                  )}
                                </td>
                                <td className="py-2 px-3">
                                  <input
                                    type="number"
                                    min={1}
                                    value={row.Quantity}
                                    onChange={(e) => updateLineRow(row.clientId, { Quantity: e.target.value })}
                                    className="input w-full py-2 px-2 text-right max-w-[100px]"
                                  />
                                </td>
                                <td className="py-2 px-3">
                                  <input
                                    type="text"
                                    value={row.Description}
                                    onChange={(e) => updateLineRow(row.clientId, { Description: e.target.value })}
                                    className="input w-full py-2 px-2"
                                    placeholder="Opsiyonel açıklama"
                                  />
                                </td>
                                <td className="py-2 px-2">
                                  <button
                                    type="button"
                                    onClick={() => removeLineRow(row.clientId)}
                                    className="p-2 rounded-lg text-text-secondary hover:bg-red-500/20 hover:text-error transition-colors"
                                    aria-label="Kalemi sil"
                                  >
                                    <TrashIcon size={18} />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      </div>
                    </div>
                  )}
                </div>

                <ProductPickerModal
                  open={showProductPicker}
                  onClose={() => setShowProductPicker(false)}
                  items={inventoryItems}
                  onItemSelect={addItemFromPicker}
                />

                {createError && (
                  <div className="mb-4 p-3 rounded bg-red-900/30 border border-red-700 text-error text-sm">
                    {createError}
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <button type="button" onClick={onClose} className="btn-secondary">
                    Vazgeç
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateSubmit}
                    disabled={isBusy}
                    className="btn-primary"
                  >
                    {isBusy ? 'Kaydediliyor...' : 'Fişi Oluştur'}
                  </button>
                </div>
              </>
            )}

            {!isNew && !loadingDetail && !displayReceipt && (
              <div className="text-text-secondary py-8">Fiş bilgisi yüklenemedi.</div>
            )}
          </div>
        </div>
      </div>

      {(editingTemplate !== null || isNewTemplate) && (
        <ReportTemplateEditorModal
          template={editingTemplate}
          isNew={isNewTemplate}
          onClose={() => {
            setEditingTemplate(null);
            setIsNewTemplate(false);
            // Şablon listesini tazele
            if (!isNew) {
              reportTemplateService
                .getAllAsync()
                .then((list) => {
                  setReportTemplates(list ?? []);
                  const defaultT = (list ?? []).find((t) => t.IsDefault);
                  setSelectedPdfTemplateId((prev) =>
                    prev === '' && defaultT ? defaultT.TemplateId : prev
                  );
                })
                .catch(() => setReportTemplates([]));
            }
          }}
          onSave={(templateId) => {
            setEditingTemplate(null);
            setIsNewTemplate(false);
            if (!isNew) {
              reportTemplateService
                .getAllAsync()
                .then((list) => {
                  setReportTemplates(list ?? []);
                  setSelectedPdfTemplateId(templateId);
                })
                .catch(() => setReportTemplates([]));
            } else {
              setSelectedPdfTemplateId(templateId);
            }
          }}
        />
      )}

      <ConfirmModal
        open={showCancelConfirm}
        title="Fişi iptal et"
        message="Bu stok fişini iptal etmek istediğinize emin misiniz? İptal edilen fişin stok hareketi geri alınmaz."
        confirmLabel="İptal et"
        cancelLabel="Vazgeç"
        variant="danger"
        loading={isBusy}
        onConfirm={handleCancelReceipt}
        onCancel={() => setShowCancelConfirm(false)}
      />

      <PdfPreviewModal
        open={showPdfPreview}
        pdfUrl={pdfPreviewUrl}
        title="Stok Fişi PDF"
        downloadFileName={detail ? `stok-fisi-${detail.ReceiptNo || detail.ReceiptId}.pdf` : 'stok-fisi.pdf'}
        onClose={closePdfPreview}
      />
    </>
  );
}
