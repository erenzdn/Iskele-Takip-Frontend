import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePortalTarget } from '../tabs/TabContext';
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
  applyAddendumDisplayNumbers,
  buildContractAddendumDisplayNoMap,
  canApproveOrRejectAddendum,
  canDeleteAddendum,
  canReverseAddendum,
  canSubmitAddendum,
  formatAddendumRefLabel,
  getAddendumDisplayStatusLabel,
  getAddendumStatusBadgeClass,
  getReverseBlockedReason,
  isAddendumEditable,
} from '../../utils/addendum';
import { getApiErrorMessage, getUserFacingApiErrorMessage } from '../../utils/apiError';
import { formatMoney, formatShortDateTime } from '../../utils/formatters';
import { formatDiscountPercent } from '../../utils/lineDiscount';
import { toast } from '../../hooks/useToast';
import { useItemWarehouseStocks } from '../../hooks/useItemWarehouseStocks';
import { useAuthStore } from '../../store/authStore';
import { invalidateData } from '../../store/dataInvalidationStore';
import { isStockErrorMessage } from '../../utils/parseStockError';
import {
  computeStockShortages,
  shortageMap,
  stockNeedKey,
  type StockNeed,
} from '../../utils/stockShortage';
import { firstValidationError, validateRequired } from '../../utils/validation';
import ConfirmModal from './ConfirmModal';
import PdfPreviewModal from './PdfPreviewModal';
import AddendumLineItemModal from './AddendumLineItemModal';
import AddendumAddProductsModal from './AddendumAddProductsModal';
import AddendumReverseModal from './AddendumReverseModal';
import QuickStockEntryModal from './QuickStockEntryModal';
import ContractLinesReferenceDrawer from '../contracts/ContractLinesReferenceDrawer';
import DataTable from '../DataTable';
import StockErrorPanel from '../StockErrorPanel';
import StockShortagePanel from '../StockShortagePanel';
import { LINE_ITEM_COL } from '../../constants/lineItemTableColumns';
import {
  buildAddendumGridRows,
  planAddendumPriceOps,
  planAddendumQtyOps,
  savedTargetPrice,
  savedTargetQty,
  type AddendumGridRow,
} from '../../utils/addendumQuantityGrid';

function todayDateInputValue(): string {
  return new Date().toISOString().split('T')[0];
}

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return todayDateInputValue();
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return todayDateInputValue();
  return d.toISOString().split('T')[0];
}

/** "1.250,50" / "1250.5" / "1250,5" → 1250.5; boş/geçersiz → null */
function parsePriceInput(raw: string): number | null {
  let t = raw.trim().replace(/\s/g, '');
  if (t === '') return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Fiyat kutusunun ilk değeri: Türkçe ondalık, binlik ayırıcısız (örn. 1250,5) */
function formatPriceInput(n: number): string {
  const r = Math.round((Number(n) || 0) * 100) / 100;
  return String(r).replace('.', ',');
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
  /** Sözleşme genel iskontosu (%); zeyilnameye ürün eklerken ilk değer */
  contractDiscountPercent?: number;
  items: Inventory[];
  warehouses: Warehouse[];
  currency?: CurrencyCode;
  templateId?: number | '';
  /** Sözleşme aktif mi (tersine çevirme için) */
  contractActive?: boolean;
  /** Aynı sözleşmedeki diğer zeyilnameler (aktif ters kayıt kontrolü) */
  siblingAddenda?: Addendum[];
  canUpdate: boolean;
  canDelete: boolean;
  onClose: () => void;
  /** Liste + sözleşme yenileme; openAddendumId ile detayı yeni kayda taşı */
  onChanged: (opts?: { approved?: boolean; rejected?: boolean; openAddendumId?: number }) => Promise<void> | void;
  zIndexClass?: string;
}

export default function AddendumDetailModal({
  open,
  contractId,
  contractType,
  addendumId,
  contractLines,
  contractDiscountPercent = 0,
  items,
  warehouses,
  currency = 'TRY',
  templateId = '',
  contractActive = true,
  siblingAddenda = [],
  canUpdate,
  canDelete,
  onClose,
  onChanged,
  zIndexClass = 'z-[60]',
}: AddendumDetailModalProps) {
  const portalTarget = usePortalTarget();
  const isRental = contractType === 'RENTAL';

  const [addendum, setAddendum] = useState<Addendum | null>(null);
  const [loading, setLoading] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [effectiveDate, setEffectiveDate] = useState(todayDateInputValue());
  const [reason, setReason] = useState('');
  const [addendumCode, setAddendumCode] = useState('');

  const [showLineModal, setShowLineModal] = useState(false);
  const [showAddProductsModal, setShowAddProductsModal] = useState(false);
  const [showContractPeek, setShowContractPeek] = useState(false);
  const [seedAddPicks, setSeedAddPicks] = useState<Array<{ item: Inventory; warehouseId?: number | '' }>>(
    []
  );
  const [editingDetail, setEditingDetail] = useState<AddendumDetail | null>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  /** Miktar tablosunda kullanıcının yazdığı (henüz kaydedilmemiş) değerler: satır anahtarı → metin */
  const [qtyInputs, setQtyInputs] = useState<Record<string, string>>({});
  /** Fiyat düzenleme modu ("Fiyat Değiştir") ve girilen fiyatlar: satır anahtarı → metin */
  const [priceEditMode, setPriceEditMode] = useState(false);
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});
  const [confirmDiscardClose, setConfirmDiscardClose] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showReverseModal, setShowReverseModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const createStartedRef = useRef(false);
  /** Sunucudan gelen stok hatası (kaydet / onaya gönder / onay) */
  const [stockError, setStockError] = useState<string | null>(null);
  const [showQuickStock, setShowQuickStock] = useState(false);
  const canCreateStockReceipt = useAuthStore((s) =>
    Boolean(s.user?.permissions?.includes('stockReceipts_create'))
  );

  const status = addendum?.Status ?? 'draft';
  const editable = Boolean(addendum && isAddendumEditable(status) && canUpdate);
  const details = addendum?.details ?? addendum?.Details ?? [];
  const contractPeekHighlightedIds = useMemo(() => {
    const ids = new Set<number>();
    for (const d of details) {
      if (d.ItemId != null && d.ItemId > 0) ids.add(d.ItemId);
    }
    return ids;
  }, [details]);
  const gridRows = useMemo(
    () => buildAddendumGridRows(contractLines, details, isRental),
    [contractLines, details, isRental]
  );
  /** Tabloda satırı olmayan (sözleşme kalemi bulunamayan) fiyat değişiklikleri */
  const otherDetails = useMemo(() => {
    const gridIds = new Set(
      gridRows.flatMap((r) => (r.kind === 'contract' ? [r.contractDetailId] : []))
    );
    return details.filter(
      (d) =>
        d.ChangeType === 'PRICE_CHANGE' &&
        (d.ContractDetailId == null || !gridIds.has(Number(d.ContractDetailId)))
    );
  }, [details, gridRows]);
  const pendingTargets = useMemo(() => {
    const out: Record<string, number> = {};
    for (const row of gridRows) {
      const raw = qtyInputs[row.key];
      if (raw == null) continue;
      const n = raw.trim() === '' ? 0 : Math.floor(Number(raw));
      if (!Number.isFinite(n)) continue;
      if (Math.max(0, n) !== savedTargetQty(row)) out[row.key] = Math.max(0, n);
    }
    return out;
  }, [gridRows, qtyInputs]);
  const pendingPriceTargets = useMemo(() => {
    const out: Record<string, number> = {};
    for (const row of gridRows) {
      if (row.kind !== 'contract') continue;
      const raw = priceInputs[row.key];
      if (raw == null) continue;
      const n = parsePriceInput(raw);
      if (n == null) continue;
      if (Math.round(n * 100) / 100 !== savedTargetPrice(row, isRental)) out[row.key] = n;
    }
    return out;
  }, [gridRows, priceInputs, isRental]);
  const pendingCount =
    Object.keys(pendingTargets).length + Object.keys(pendingPriceTargets).length;
  /** Tabloda kaydedilmemiş miktar veya fiyat değişikliği var mı */
  const hasPendingQty = pendingCount > 0;
  const showReverse =
    addendum != null &&
    canReverseAddendum({
      addendum,
      contractActive,
      canUpdate,
      siblingAddenda,
    });
  const reverseBlockedReason =
    addendum != null && addendum.Status === 'approved' && canUpdate
      ? getReverseBlockedReason({
          addendum,
          contractActive,
          canUpdate,
          siblingAddenda,
        })
      : null;

  /** Tabloda görünen (kaydedilmemiş giriş dahil) hedef miktar */
  const effectiveTargetQty = (row: AddendumGridRow): number => {
    const raw = qtyInputs[row.key];
    if (raw == null) return savedTargetQty(row);
    return raw.trim() === '' ? 0 : Math.max(0, Math.floor(Number(raw)) || 0);
  };

  /** Satırın depodan istediği ek miktar: artış kadar (sözleşme satırı) veya eklenen adet (yeni ürün). */
  const rowStockNeed = (row: AddendumGridRow): StockNeed | null => {
    if (row.kind === 'contract') {
      const line = row.line;
      if (line.kind !== 'inventory' || !line.ItemId || !line.WarehouseId) return null;
      const increase = effectiveTargetQty(row) - row.currentQty;
      if (increase <= 0) return null;
      return {
        ItemId: line.ItemId,
        WarehouseId: line.WarehouseId,
        label: line.ItemNameOverride || line.ItemName || `Ürün #${line.ItemId}`,
        required: increase,
      };
    }
    const d = row.detail;
    if (d.IsManual || !d.ItemId || !d.WarehouseId) return null;
    const qty = effectiveTargetQty(row);
    if (qty <= 0) return null;
    return {
      ItemId: d.ItemId,
      WarehouseId: d.WarehouseId,
      label: d.ItemName || `Ürün #${d.ItemId}`,
      required: qty,
    };
  };

  // Stok kontrolü yalnızca henüz sözleşmeye uygulanmamış (taslak / onay bekleyen) zeyilnamede anlamlı.
  const stockCheckActive = Boolean(addendum && (editable || canApproveOrRejectAddendum(status)));
  const stockNeeds = useMemo(
    () => (stockCheckActive ? gridRows.flatMap((row) => rowStockNeed(row) ?? []) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rowStockNeed qtyInputs'a bağlı
    [stockCheckActive, gridRows, qtyInputs]
  );
  const { stocks, refresh: refreshStocks } = useItemWarehouseStocks(
    stockNeeds.map((n) => n.ItemId),
    open && stockCheckActive
  );
  const shortages = useMemo(() => computeStockShortages(stockNeeds, stocks), [stockNeeds, stocks]);
  const shortageByKey = useMemo(() => shortageMap(shortages), [shortages]);
  const quickStockLines = useMemo(() => {
    const source = shortages.length > 0 ? shortages : stockNeeds;
    const seen = new Set<string>();
    return source.flatMap((n) => {
      const key = stockNeedKey(n.ItemId, n.WarehouseId);
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ ItemId: n.ItemId, label: n.label, warehouseId: n.WarehouseId, key }];
    });
  }, [shortages, stockNeeds]);
  const getRequiredStock = (itemId: number, warehouseId: number) =>
    stockNeeds
      .filter((n) => n.ItemId === itemId && n.WarehouseId === warehouseId)
      .reduce((sum, n) => sum + n.required, 0);
  const openQuickStock =
    canCreateStockReceipt && quickStockLines.length > 0 ? () => setShowQuickStock(true) : undefined;

  /** Stok hatasıysa paneli açar ve stokları tazeler; aksi halde false. */
  const captureStockError = (error: unknown): boolean => {
    const msg = getApiErrorMessage(error);
    if (!msg || !isStockErrorMessage(msg)) return false;
    setStockError(msg);
    void refreshStocks();
    return true;
  };

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
      setShowAddProductsModal(false);
      setShowContractPeek(false);
      setSeedAddPicks([]);
      setEditingDetail(null);
      setConfirmApprove(false);
      setConfirmDelete(false);
      setQtyInputs({});
      setPriceInputs({});
      setPriceEditMode(false);
      setConfirmDiscardClose(false);
      setShowRejectModal(false);
      setShowReverseModal(false);
      setRejectionReason('');
      setStockError(null);
      setShowQuickStock(false);
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

  const displayAddendum = useMemo(() => {
    if (!addendum) return null;
    const peers = siblingAddenda.some((row) => row.AddendumId === addendum.AddendumId)
      ? siblingAddenda
      : [...siblingAddenda, addendum];
    return applyAddendumDisplayNumbers(addendum, buildContractAddendumDisplayNoMap(peers));
  }, [addendum, siblingAddenda]);

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
      if (!(await flushQuantities({ silent: true }))) return;
      const updated = await addendumService.updateAsync(addendum.AddendumId, {
        EffectiveDate: new Date(effectiveDate).toISOString(),
        Reason: reason.trim() || null,
        AddendumCode: addendumCode.trim() || null,
      });
      setAddendum((prev) => ({ ...updated, details: prev?.details ?? prev?.Details ?? details }));
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
    // Yalnızca kalemler yenilenir: başlık alanları (tarih, gerekçe, kod) kullanıcının henüz
    // kaydetmediği değerleri taşıyabilir; sunucudakiyle ezilirse ürün ekleyince tarih geri dönüyordu.
    const full = await addendumService.getByIdAsync(addendum.AddendumId);
    setAddendum(full);
    return full;
  };

  /**
   * Tablodaki bekleyen miktar değişikliklerini zeyilname kalemlerine yazar.
   * true: her şey kaydedildi (veya bekleyen yoktu).
   */
  const flushQuantities = async (opts?: { silent?: boolean }): Promise<boolean> => {
    if (!addendum || !editable || !hasPendingQty) return true;
    // Fiyat işlemlerinin anahtarı "p:" ile ayrılır; aynı satırın miktar hatası fiyatı engellemesin.
    const ops = [
      ...planAddendumQtyOps(gridRows, pendingTargets),
      ...planAddendumPriceOps(gridRows, pendingPriceTargets, isRental).map((op) => ({
        ...op,
        rowKey: `p:${op.rowKey}`,
      })),
    ];
    const failedKeys = new Set<string>();
    let firstError: unknown = null;
    for (const op of ops) {
      if (failedKeys.has(op.rowKey)) continue;
      try {
        if (op.op === 'add') {
          await addendumService.addDetailAsync(addendum.AddendumId, op.payload);
        } else if (op.op === 'update') {
          await addendumService.updateDetailAsync(addendum.AddendumId, op.detailId, op.patch);
        } else {
          await addendumService.deleteDetailAsync(addendum.AddendumId, op.detailId);
        }
      } catch (error) {
        console.error('Addendum quantity sync error:', error);
        failedKeys.add(op.rowKey);
        firstError ??= error;
      }
    }
    try {
      await refreshDetails();
    } catch (error) {
      console.error('Addendum refresh error:', error);
    }
    // Başarılı satırların girişi temizlenir; hatalı satır kullanıcı düzeltsin diye kalır.
    setQtyInputs((prev) => {
      const next: Record<string, string> = {};
      for (const key of failedKeys) if (key in prev) next[key] = prev[key];
      return next;
    });
    setPriceInputs((prev) => {
      const next: Record<string, string> = {};
      for (const key of failedKeys) {
        const k = key.startsWith('p:') ? key.slice(2) : null;
        if (k && k in prev) next[k] = prev[k];
      }
      return next;
    });
    await Promise.resolve(onChanged());
    if (firstError) {
      captureStockError(firstError);
      toast.error(getUserFacingApiErrorMessage(firstError, 'addendum'));
      return false;
    }
    setStockError(null);
    if (!opts?.silent) toast.success('Değişiklikler kaydedildi');
    return true;
  };

  const handleSaveQuantities = async () => {
    try {
      setIsBusy(true);
      await flushQuantities();
    } finally {
      setIsBusy(false);
    }
  };

  const requestClose = () => {
    if (editable && hasPendingQty) {
      setConfirmDiscardClose(true);
      return;
    }
    onClose();
  };

  const handleSubmit = async () => {
    if (!addendum || !canUpdate) return;
    if (!effectiveDate) {
      toast.warning('Geçerlilik tarihi zorunludur');
      return;
    }
    try {
      setIsBusy(true);
      let currentDetails = details;
      if (editable && hasPendingQty) {
        if (!(await flushQuantities({ silent: true }))) return;
        const fresh = await addendumService.getByIdAsync(addendum.AddendumId);
        currentDetails = fresh.details ?? fresh.Details ?? [];
      }
      if (currentDetails.length < 1) {
        toast.warning('Onaya göndermek için en az bir ürünün miktarını değiştirin veya ürün ekleyin');
        return;
      }
      if (editable) {
        await addendumService.updateAsync(addendum.AddendumId, {
          EffectiveDate: new Date(effectiveDate).toISOString(),
          Reason: reason.trim() || null,
          AddendumCode: addendumCode.trim() || null,
        });
      }
      const updated = await addendumService.submitAsync(addendum.AddendumId);
      setAddendum({ ...updated, details: updated.details ?? currentDetails });
      toast.success('Zeyilname onaya gönderildi');
      await Promise.resolve(onChanged());
    } catch (error) {
      console.error('Submit addendum error:', error);
      captureStockError(error);
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
      if (captureStockError(error)) setConfirmApprove(false);
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
      await Promise.resolve(onChanged({ rejected: true }));
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

  const focusGridInput = (column: 'qty' | 'price', rowIndex: number) => {
    const el = document.querySelector<HTMLInputElement>(
      `input[data-addendum-${column}-row="${rowIndex}"]`
    );
    if (el) {
      el.focus();
      el.select();
    }
  };

  const renderGridRow = (row: AddendumGridRow, rowIndex: number) => {
    const isAdded = row.kind === 'added';
    const baseQty = isAdded ? 0 : row.currentQty;
    const savedTarget = savedTargetQty(row);
    const rawInput = qtyInputs[row.key];
    const displayValue = rawInput ?? String(savedTarget);
    const parsed = displayValue.trim() === '' ? 0 : Math.max(0, Math.floor(Number(displayValue)) || 0);
    const diff = parsed - baseQty;
    const isPending = row.key in pendingTargets;
    const savedPrice = row.kind === 'contract' ? savedTargetPrice(row, isRental) : null;
    const hasSavedPriceChange =
      row.kind === 'contract' && savedPrice != null && savedPrice !== row.currentPrice;
    const isPricePending = row.key in pendingPriceTargets;
    const hasSavedChange = !isAdded && (row.savedDelta !== 0 || hasSavedPriceChange);
    const need = stockCheckActive ? rowStockNeed(row) : null;
    const rowShortage = need ? shortageByKey.get(stockNeedKey(need.ItemId, need.WarehouseId)) : undefined;

    let code = '—';
    let name = '';
    let warehouseName = '—';
    let price: number | null = null;
    let discount: number | null = null;
    if (row.kind === 'contract') {
      const line = row.line;
      if (line.kind === 'inventory') {
        code = line.ItemCode || '—';
        name = line.ItemNameOverride || line.ItemName || `Ürün #${line.ItemId}`;
        warehouseName =
          line.WarehouseName ||
          warehouses.find((w) => w.WarehouseId === line.WarehouseId)?.WarehouseName ||
          '—';
        discount = line.Iskonto ?? null;
      } else {
        name = line.Description || 'Manuel kalem';
      }
      price = row.currentPrice;
    } else {
      const d = row.detail;
      code = d.ItemCode || '—';
      name = d.IsManual ? d.Description || 'Manuel kalem' : d.ItemName || `Ürün #${d.ItemId ?? '—'}`;
      warehouseName =
        d.WarehouseName ||
        warehouses.find((w) => w.WarehouseId === d.WarehouseId)?.WarehouseName ||
        '—';
      price = d.NewUnitPrice ?? null;
      discount = d.Iskonto ?? null;
    }

    const rowClass = isPending || isPricePending
      ? 'bg-amber-500/15'
      : isAdded
        ? 'bg-green-500/10'
        : hasSavedChange
          ? 'bg-primary/10'
          : rowIndex % 2 === 0
            ? 'bg-background-panel'
            : 'bg-background-secondary/35';

    return (
      <tr key={row.key} className={rowClass}>
        <td className="row-index-col">
          <span className="row-index-num">{rowIndex + 1}</span>
        </td>
        <td className="text-text-secondary">
          {code !== '—' ? <span className="item-code-badge" title={code}>{code}</span> : '—'}
        </td>
        <td className="font-medium">
          <span className="inline-flex items-center gap-1.5 flex-wrap">
            {name}
            {isAdded && (
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-green-500/20 text-green-300">
                Yeni ürün
              </span>
            )}
          </span>
        </td>
        <td className="text-text-secondary whitespace-nowrap">{warehouseName}</td>
        <td className="text-right tabular-nums whitespace-nowrap">
          {row.kind === 'contract' && editable && priceEditMode ? (
            <input
              type="text"
              inputMode="decimal"
              value={priceInputs[row.key] ?? formatPriceInput(savedPrice ?? row.currentPrice)}
              data-addendum-price-row={rowIndex}
              disabled={isBusy}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d.,]/g, '').slice(0, 16);
                setPriceInputs((prev) => ({ ...prev, [row.key]: v }));
              }}
              onKeyDown={(e) => {
                // Oklar: genel tablo gezinmesi (utils/tableKeyboardNav)
                if (e.key === 'Enter') {
                  e.preventDefault();
                  focusGridInput('price', rowIndex + 1);
                } else if (e.key === 'Escape' && priceInputs[row.key] != null) {
                  e.preventDefault();
                  e.stopPropagation();
                  setPriceInputs((prev) => {
                    const next = { ...prev };
                    delete next[row.key];
                    return next;
                  });
                }
              }}
              className={`input w-full text-right py-0.5 text-xs tabular-nums ${
                isPricePending ? 'border-amber-400/70' : ''
              }`}
              aria-label={isRental ? 'Yeni aylık fiyat' : 'Yeni birim fiyat'}
              title={`Mevcut: ${formatMoney(row.currentPrice, currency)}`}
            />
          ) : hasSavedPriceChange && savedPrice != null && price != null ? (
            <span className="inline-flex flex-col items-end leading-tight">
              <span className="text-[11px] text-text-secondary line-through">
                {formatMoney(price, currency)}
              </span>
              <span className="text-primary font-medium">{formatMoney(savedPrice, currency)}</span>
            </span>
          ) : price != null ? (
            formatMoney(price, currency)
          ) : (
            '—'
          )}
          {discount != null && discount > 0 && (
            <span className="ml-1 text-[11px] text-red-300">-%{formatDiscountPercent(discount)}</span>
          )}
        </td>
        <td className="text-right tabular-nums text-text-secondary">{isAdded ? '—' : baseQty}</td>
        <td className="text-right">
          {editable ? (
            <input
              type="text"
              inputMode="numeric"
              value={displayValue}
              data-addendum-qty-row={rowIndex}
              disabled={isBusy}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '').slice(0, 9);
                setQtyInputs((prev) => ({ ...prev, [row.key]: digits }));
              }}
              onKeyDown={(e) => {
                // Oklar: genel tablo gezinmesi (utils/tableKeyboardNav)
                if (e.key === 'Enter') {
                  e.preventDefault();
                  focusGridInput('qty', rowIndex + 1);
                } else if (e.key === 'Escape' && rawInput != null) {
                  e.preventDefault();
                  e.stopPropagation();
                  setQtyInputs((prev) => {
                    const next = { ...prev };
                    delete next[row.key];
                    return next;
                  });
                }
              }}
              className={`input w-full text-right py-0.5 text-xs tabular-nums ${
                isPending ? 'border-amber-400/70' : ''
              }`}
              aria-label="Yeni miktar"
            />
          ) : (
            <span className="tabular-nums">{parsed}</span>
          )}
        </td>
        <td
          className={`text-right tabular-nums font-medium ${
            diff > 0 ? 'text-green-400' : diff < 0 ? 'text-red-400' : 'text-text-secondary'
          }`}
        >
          {diff > 0 ? `+${diff}` : diff < 0 ? diff : '—'}
          {rowShortage && (
            <span
              className="block text-[10px] font-semibold text-red-400 whitespace-nowrap"
              title={`Depoda kullanılabilir ${rowShortage.available}, gereken ${rowShortage.required}`}
            >
              {rowShortage.missing} eksik
            </span>
          )}
        </td>
        {editable && (
          <td className="action-col">
            <div className="flex justify-end gap-1">
              {row.kind === 'contract' && (isPending || isPricePending || hasSavedChange) && (
                <button
                  type="button"
                  className="btn-secondary !py-0.5 !px-2 text-xs"
                  disabled={isBusy}
                  title="Mevcut miktar ve fiyata döndür"
                  onClick={() => {
                    setQtyInputs((prev) => ({ ...prev, [row.key]: String(row.currentQty) }));
                    setPriceInputs((prev) => ({ ...prev, [row.key]: formatPriceInput(row.currentPrice) }));
                  }}
                >
                  Sıfırla
                </button>
              )}
              {row.kind === 'added' && row.detail.DetailId > 0 && (
                <>
                  <button
                    type="button"
                    className="btn-secondary !py-0.5 !px-2 text-xs"
                    disabled={isBusy}
                    onClick={() => {
                      setEditingDetail(row.detail);
                      setShowLineModal(true);
                    }}
                  >
                    Düzenle
                  </button>
                  <button
                    type="button"
                    className="btn-secondary !py-0.5 !px-2 text-xs text-red-400 border-red-500/30"
                    disabled={isBusy}
                    onClick={() => void handleDeleteDetail(row.detail.DetailId)}
                  >
                    Sil
                  </button>
                </>
              )}
            </div>
          </td>
        )}
      </tr>
    );
  };

  const titleNo =
    displayAddendum?.AddendumNo != null ? `#${displayAddendum.AddendumNo}` : '';

  const modalTree = (
    <div className={`fixed inset-0 flex flex-col bg-background-main ${zIndexClass}`}>
      <header className="shrink-0 flex items-center justify-between px-6 py-4 bg-background-panel border-b border-background-border shadow-sm gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-xl font-bold text-text-primary truncate">
            Zeyilname / Ek Protokol {titleNo}
          </h2>
          {addendum && (
            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <span
                className={`text-xs px-2 py-0.5 rounded-full border ${getAddendumStatusBadgeClass(status)}`}
              >
                {getAddendumDisplayStatusLabel(addendum)}
              </span>
              {addendum.IsReversal && (
                <span className="text-xs px-2 py-0.5 rounded-full border bg-violet-500/20 text-violet-200 border-violet-500/40">
                  Ters zeyilname
                </span>
              )}
              {addendum.IsReversed && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full border bg-slate-500/25 text-slate-200 border-slate-500/40"
                  title={
                    addendum.ReversedAt
                      ? `Tersine çevrilme: ${formatShortDateTime(addendum.ReversedAt)}`
                      : undefined
                  }
                >
                  Tersine çevrildi
                </span>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={requestClose}
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
          <div className="max-w-7xl mx-auto space-y-6">
            {status === 'rejected' && addendum.RejectionReason && (
              <div className="rounded-xl border border-red-500/40 bg-red-900/20 px-4 py-3 text-sm text-red-200">
                <span className="font-medium">Red gerekçesi: </span>
                {addendum.RejectionReason}
              </div>
            )}

            {(addendum.IsReversal || addendum.IsReversed) && (
              <div className="rounded-xl border border-violet-500/30 bg-violet-900/15 px-4 py-3 text-sm text-violet-100 space-y-1.5">
                {addendum.IsReversal && addendum.ReversesAddendumId != null && (
                  <div>
                    <span className="font-medium">Kaynak zeyilname: </span>
                    <button
                      type="button"
                      className="underline underline-offset-2 hover:text-white"
                      disabled={isBusy}
                      onClick={() =>
                        void Promise.resolve(
                          onChanged({ openAddendumId: addendum.ReversesAddendumId! })
                        )
                      }
                    >
                      {formatAddendumRefLabel({
                        number: displayAddendum?.ReversesAddendumNumber,
                        code: addendum.ReversesAddendumCode,
                        id: addendum.ReversesAddendumId,
                      })}
                      {addendum.ReversesAddendumCode
                        ? ` (${addendum.ReversesAddendumCode})`
                        : ''}
                    </button>
                    <span className="text-violet-200/80"> — bu kayıt onu tersine çevirir</span>
                  </div>
                )}
                {addendum.IsReversed && addendum.ReversedByAddendumId != null && (
                  <div
                    title={
                      addendum.ReversedAt
                        ? `Tersine çevrilme: ${formatShortDateTime(addendum.ReversedAt)}`
                        : undefined
                    }
                  >
                    <span className="font-medium">Tersine çeviren: </span>
                    <button
                      type="button"
                      className="underline underline-offset-2 hover:text-white"
                      disabled={isBusy}
                      onClick={() =>
                        void Promise.resolve(
                          onChanged({ openAddendumId: addendum.ReversedByAddendumId! })
                        )
                      }
                    >
                      {formatAddendumRefLabel({
                        number: displayAddendum?.ReversedByAddendumNumber,
                        code: addendum.ReversedByAddendumCode,
                        id: addendum.ReversedByAddendumId,
                      })}
                      {addendum.ReversedByAddendumCode
                        ? ` (${addendum.ReversedByAddendumCode})`
                        : ''}
                    </button>
                    {addendum.ReversedAt && (
                      <span className="text-violet-200/80">
                        {' '}
                        — {formatShortDateTime(addendum.ReversedAt)}
                      </span>
                    )}
                  </div>
                )}
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
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">Ürünler ve Miktarlar</h3>
                  {editable && (
                    <p className="text-xs text-text-secondary mt-0.5">
                      {priceEditMode ? (
                        <>
                          Fiyat düzenleme açık: <strong className="text-text-primary">
                            {isRental ? 'Aylık Fiyat' : 'Birim Fiyat'}
                          </strong>{' '}
                          sütununa yeni fiyatı yazın (iskonto öncesi). Değişen satırlar fiyat değişikliği kalemi olur.
                        </>
                      ) : (
                        <>
                          Sözleşmedeki tüm ürünler listelenir.{' '}
                          <strong className="text-text-primary">Yeni Miktar</strong> sütununu değiştirin; fark
                          otomatik olarak artış / azalış kalemi olur.
                        </>
                      )}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {editable && hasPendingQty && (
                    <>
                      <button
                        type="button"
                        className="btn-secondary text-sm"
                        disabled={isBusy}
                        onClick={() => {
                          setQtyInputs({});
                          setPriceInputs({});
                        }}
                      >
                        Değişiklikleri Geri Al
                      </button>
                      <button
                        type="button"
                        className="btn-primary text-sm"
                        disabled={isBusy}
                        onClick={() => void handleSaveQuantities()}
                      >
                        Değişiklikleri Kaydet ({pendingCount})
                      </button>
                    </>
                  )}
                  {editable && (
                    <>
                      <button
                        type="button"
                        className="btn-secondary text-sm"
                        disabled={isBusy}
                        onClick={() => {
                          setShowContractPeek(false);
                          setShowAddProductsModal(true);
                        }}
                      >
                        Yeni Ürün Ekle
                      </button>
                      <button
                        type="button"
                        className={priceEditMode ? 'btn-primary text-sm' : 'btn-secondary text-sm'}
                        disabled={isBusy || gridRows.every((r) => r.kind !== 'contract')}
                        aria-pressed={priceEditMode}
                        onClick={() => {
                          const next = !priceEditMode;
                          setPriceEditMode(next);
                          if (next) {
                            setTimeout(() => focusGridInput('price', 0), 0);
                          }
                        }}
                      >
                        {priceEditMode ? 'Fiyat Düzenlemeyi Kapat' : 'Fiyat Değiştir'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              <StockShortagePanel
                shortages={shortages}
                warehouses={warehouses}
                onAddStock={openQuickStock}
                description={
                  hasPendingQty
                    ? 'Kaydedilmemiş miktarlar dahil. Eksik stoğu buradan ekleyin; girdiğiniz miktarlar korunur.'
                    : undefined
                }
              />
              {stockError && (
                <StockErrorPanel
                  message={stockError}
                  onDismiss={() => setStockError(null)}
                  onStockTransfer={openQuickStock}
                  showStockTransferLink={false}
                />
              )}

              {gridRows.length === 0 ? (
                <div className="text-center py-8 text-text-secondary text-sm">
                  Sözleşmede ürün yok.
                  {editable && (
                    <>
                      {' '}Yeni ürün için <strong className="text-text-primary">Yeni Ürün Ekle</strong> kullanın.
                    </>
                  )}
                </div>
              ) : (
                <div className="overflow-auto max-h-[60vh] rounded-lg border border-background-border">
                  <DataTable
                    tableId="AddendumQuantityGrid"
                    className="table-data-grid table-excel-rows text-text-primary"
                  >
                    <thead>
                      <tr>
                        <th className="row-index-col" style={{ width: LINE_ITEM_COL.rowIndex }}>
                          #
                        </th>
                        <th className="text-left whitespace-nowrap" style={{ width: LINE_ITEM_COL.itemCode }}>
                          Ürün Kodu
                        </th>
                        <th className="text-left" style={{ width: '30%' }}>
                          Ürün Adı
                        </th>
                        <th className="text-left whitespace-nowrap" style={{ width: LINE_ITEM_COL.warehouse }}>
                          Depo
                        </th>
                        <th className="text-right whitespace-nowrap" style={{ width: LINE_ITEM_COL.unitPrice }}>
                          {isRental ? 'Aylık Fiyat' : 'Birim Fiyat'}
                        </th>
                        <th className="text-right whitespace-nowrap" style={{ width: LINE_ITEM_COL.quantity }}>
                          Mevcut
                        </th>
                        <th className="text-right whitespace-nowrap" style={{ width: '10%' }}>
                          Yeni Miktar
                        </th>
                        <th className="text-right whitespace-nowrap" style={{ width: LINE_ITEM_COL.quantity }}>
                          Fark
                        </th>
                        {editable && (
                          <th className="action-col" style={{ width: '9%' }} aria-label="İşlem" />
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {gridRows.map((row, rowIndex) => renderGridRow(row, rowIndex))}
                    </tbody>
                  </DataTable>
                </div>
              )}

              {otherDetails.length > 0 && (
                <div className="space-y-2 pt-2">
                  <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    Fiyat değişiklikleri
                  </h4>
                  <div className="overflow-x-auto">
                    <DataTable tableId="AddendumDetailModal" className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-text-secondary border-b border-background-border">
                          <th className="py-2 pr-3 font-medium">Kalem</th>
                          <th className="py-2 pr-3 font-medium">Yeni Fiyat</th>
                          {editable && <th className="py-2 font-medium">İşlem</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {otherDetails.map((d, idx) => (
                          <tr
                            key={d.DetailId > 0 ? d.DetailId : `other-${idx}`}
                            className="border-b border-background-border/60"
                          >
                            <td className="py-2 pr-3">{detailSummary(d)}</td>
                            <td className="py-2 pr-3">
                              {d.NewUnitPrice != null ? formatMoney(d.NewUnitPrice, currency) : '—'}
                              {d.NewMonthlyOverride != null && (
                                <span className="ml-1.5 text-xs text-text-secondary">
                                  Aylık: {formatMoney(d.NewMonthlyOverride, currency)}
                                </span>
                              )}
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
                    </DataTable>
                  </div>
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
          <button type="button" className="btn-secondary" onClick={requestClose} disabled={isBusy}>
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
          {showReverse && addendum && (
            <button
              type="button"
              className="btn-secondary border-violet-500/40 text-violet-200"
              disabled={isBusy}
              onClick={() => setShowReverseModal(true)}
            >
              Tersine Çevir
            </button>
          )}
          {!showReverse &&
            addendum &&
            addendum.Status === 'approved' &&
            canUpdate &&
            reverseBlockedReason &&
            !addendum.IsReversed && (
              <button
                type="button"
                className="btn-secondary opacity-50 cursor-not-allowed"
                disabled
                title={reverseBlockedReason}
              >
                Tersine Çevir
              </button>
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
          'Onay sonrası değişiklikler sözleşmeye uygulanır.\nGerekirse daha sonra ters zeyilname ile etkisi geri alınabilir.'
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
        open={confirmDiscardClose}
        title="Kaydedilmemiş değişiklikler"
        message="Tabloda kaydedilmemiş miktar veya fiyat değişiklikleri var. Kaydetmeden kapatılsın mı?"
        confirmLabel="Kaydetmeden Kapat"
        cancelLabel="Geri Dön"
        variant="danger"
        zIndexClass="z-[80]"
        onConfirm={() => {
          setConfirmDiscardClose(false);
          setQtyInputs({});
          setPriceInputs({});
          onClose();
        }}
        onCancel={() => setConfirmDiscardClose(false)}
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
          <div className="bg-background-panel rounded-panel w-full max-w-md p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
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
          contractLines={contractLines}
          contractDiscountPercent={contractDiscountPercent}
          zIndexClass="z-[75]"
          seedPicks={seedAddPicks}
          onSeedConsumed={() => setSeedAddPicks([])}
          onClose={() => setShowAddProductsModal(false)}
          onSaved={async () => {
            await refreshDetails();
            await Promise.resolve(onChanged());
          }}
        />
      )}

      <ContractLinesReferenceDrawer
        open={showContractPeek}
        onClose={() => setShowContractPeek(false)}
        lines={contractLines}
        contractType={contractType}
        currency={currency}
        highlightedItemIds={contractPeekHighlightedIds}
        highlightLabel="Bu zeyilnamede"
        zIndexClass="z-[80]"
        items={items}
        onSelectInventory={
          editable
            ? (item, line) => {
                setSeedAddPicks([{ item, warehouseId: line.WarehouseId }]);
                setShowContractPeek(false);
                setShowAddProductsModal(true);
              }
            : undefined
        }
      />

      {addendum && (
        <AddendumLineItemModal
          open={showLineModal}
          addendumId={addendum.AddendumId}
          contractType={contractType}
          contractLines={contractLines}
          items={items}
          warehouses={warehouses}
          currency={currency}
          contractDiscountPercent={contractDiscountPercent}
          editingDetail={editingDetail}
          initialChangeType={editingDetail ? undefined : 'PRICE_CHANGE'}
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

      {showQuickStock && quickStockLines.length > 0 && (
        <QuickStockEntryModal
          warehouses={warehouses}
          lines={quickStockLines}
          getRequiredQuantity={getRequiredStock}
          title="Eksik Stoğu Ekle"
          description={
            addendum?.AddendumCode
              ? `Zeyilname ${addendum.AddendumCode} için stok girişi`
              : 'Zeyilname için stok girişi'
          }
          zIndexClass="z-[90]"
          onClose={() => setShowQuickStock(false)}
          onSaved={async () => {
            setStockError(null);
            invalidateData('inventory');
            const fresh = await refreshStocks();
            if (computeStockShortages(stockNeeds, fresh).length === 0) {
              toast.info('Stok eksiği kalmadı; kaldığınız yerden devam edebilirsiniz.');
            }
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

      {addendum && (
        <AddendumReverseModal
          open={showReverseModal}
          sourceAddendum={displayAddendum ?? addendum}
          zIndexClass="z-[85]"
          onClose={() => setShowReverseModal(false)}
          onCreated={async (newAddendumId) => {
            await Promise.resolve(onChanged({ openAddendumId: newAddendumId }));
          }}
        />
      )}
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalTree, portalTarget) : null;
}
