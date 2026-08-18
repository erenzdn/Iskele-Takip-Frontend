import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAuthStore } from '../../store/authStore';
import { ClipboardIcon, CopySimpleIcon, XIcon, Plus } from '@phosphor-icons/react';
import {
  ContractQuoteType,
  Contract,
  resolveContractQuoteType,
  Quote,
  QuoteTemplate,
  QuotePackage,
  Customer,
  Inventory,
  QuoteLineItem,
  ConstructionSite,
  QuoteStatus,
  Warehouse,
  isQuoteConverted,
} from '../../models';
import { quoteService, WarehouseAssignment } from '../../services/quoteService';
import { contractService } from '../../services/contractService';
import { quoteTemplateService } from '../../services/quoteTemplateService';
import { customerService } from '../../services/customerService';
import { getApiErrorMessage, getApiFieldErrors, getUserFacingApiErrorMessage, isArchivedInventoryApiError, isConvertedQuoteApiError, userMessageForCustomerRelatedApiError } from '../../utils/apiError';
import { formatInventoryLineBilingualLabel, formatMoney, formatShortDateTime } from '../../utils/formatters';
import { toast } from '../../hooks/useToast';
import { firstValidationError, normalizeText, validateDate, validateNumber, validateRequired } from '../../utils/validation';
import { extractFirstQuotedName, isStockErrorMessage } from '../../utils/parseStockError';
import StockErrorPanel from '../StockErrorPanel';
import { inventoryService } from '../../services/inventoryService';
import { warehouseService } from '../../services/warehouseService';
import { siteService } from '../../services/siteService';
import { packageService } from '../../services/packageService';
import ConfirmModal from './ConfirmModal';
import ProductPickerModal from './ProductPickerModal';
import QuoteTemplateEditorModal from './QuoteTemplateEditorModal';
import PdfPreviewModal from './PdfPreviewModal';
import ManualLineItemModal from './ManualLineItemModal';
import CustomerSearchField from '../CustomerSearchField';
import SiteSelectField from '../SiteSelectField';
import CustomerDetailModal from './CustomerDetailModal';
import SiteCreateModal from './SiteCreateModal';
import ContractDetailModal from './ContractDetailModal';
import {
  applyCreatedSiteId,
  buildSiteRequestFields,
  EMPTY_NEW_SITE_FORM,
  isSaveBlockedByNewSite,
  isSiteRelatedApiMessage,
  NEW_SITE_SELECT_VALUE,
  NewSiteFormState,
  validateSiteSelection,
} from '../../utils/siteSelection';
import { hasMeaningfulQuoteDraftContent, isQuoteDraftStatus } from '../../utils/quoteDraft';

interface QuoteDetailModalProps {
  quote: Quote | null;
  isNew: boolean;
  onClose: () => void;
  onDataChanged?: () => void | Promise<void>;
  /** Dönüşüm sonrası yeni sözleşmeye yönlendirme (parent listesini yeniler) */
  onConverted?: (contractId: number) => void | Promise<void>;
  /** Yeni teklif: menüden gelen varsayılan tip */
  defaultTypeForNew?: ContractQuoteType;
  /** true ise yeni teklifte tip seçilemez (ayrı menü sayfaları) */
  lockNewQuoteType?: boolean;
  /**
   * "Teklifi Kopyala" akışı için: backend tarafından oluşturulan yeni teklif
   * (status=pending, QuoteCode boş, fiyatlar/kalemler aynen) parent'a iletilir.
   * Parent bu callback ile mevcut modalı kapatıp yeni teklifi düzenleme modunda
   * tekrar açabilir. Verilmezse modal kendi içinde kapanır ve `onDataChanged` çağrılır.
   */
  onQuoteCloned?: (newQuote: Quote) => void;
  /**
   * Var olan bir teklif açılırken modalın doğrudan düzenleme modunda
   * başlamasını sağlar (örn. kopyalanmış taslak teklif). Yeni teklifte
   * (`isNew=true`) zaten otomatik düzenlenebilir olduğu için göz ardı edilir.
   */
  startInEditMode?: boolean;
  /**
   * Görsel "Taslak (kopyalanmış teklif)" rozeti gösterir. Sadece bilgi amaçlı,
   * iş mantığını etkilemez.
   */
  isClonedDraft?: boolean;
}

function unitPriceForQuoteInventory(
  inv: Inventory,
  cur: 'TRY' | 'EUR' | 'USD',
  qType: ContractQuoteType
): number {
  if (qType === 'SALE') {
    return cur === 'EUR'
      ? inv.UnitPriceEur ?? 0
      : cur === 'USD'
        ? inv.UnitPriceUsd ?? 0
        : inv.UnitPrice ?? 0;
  }
  return cur === 'EUR'
    ? (inv.MonthlyListPriceEur ?? 0) / 30
    : cur === 'USD'
      ? (inv.MonthlyListPriceUsd ?? 0) / 30
      : (inv.MonthlyListPrice || 0) / 30;
}

export default function QuoteDetailModal({
  quote,
  isNew,
  onClose,
  onDataChanged,
  onConverted,
  defaultTypeForNew,
  lockNewQuoteType,
  onQuoteCloned,
  startInEditMode = false,
  isClonedDraft = false,
}: QuoteDetailModalProps) {
  const [isReadOnly, setIsReadOnly] = useState(!isNew && !startInEditMode);
  const [showCloneConfirm, setShowCloneConfirm] = useState(false);
  const [isCloning, setIsCloning] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [availableItems, setAvailableItems] = useState<Inventory[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | ''>('');
  const [selectedAuthorizedContactId, setSelectedAuthorizedContactId] = useState<number | ''>('');
  const [authorizedContacts, setAuthorizedContacts] = useState<NonNullable<Customer['AuthorizedContacts']>>([]);
  const [authorizedContactsLoading, setAuthorizedContactsLoading] = useState(false);
  const [authorizedContactError, setAuthorizedContactError] = useState<string | null>(null);
  const [sites, setSites] = useState<ConstructionSite[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<number | ''>('');
  const [sitesLoading, setSitesLoading] = useState(false);
  const [isNewSiteMode, setIsNewSiteMode] = useState(false);
  const [newSiteForm, setNewSiteForm] = useState<NewSiteFormState>(EMPTY_NEW_SITE_FORM);
  const [startDate, setStartDate] = useState('');
  const [plannedEndDate, setPlannedEndDate] = useState('');
  /** RENTAL: kiralama süresi (gün), min 1 */
  const [rentalDurationDays, setRentalDurationDays] = useState(30);
  const [quoteItems, setQuoteItems] = useState<QuoteLineItem[]>([]);
  const [status, setStatus] = useState<QuoteStatus>(QuoteStatus.Pending);
  const [subject, setSubject] = useState('');
  const [notes, setNotes] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [persistedQuoteId, setPersistedQuoteId] = useState<number | null>(quote?.QuoteId ?? null);
  const [isDirty, setIsDirty] = useState(false);
  const skipDirtyRef = useRef(true);
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);

  // Hızlı merkez yetkilisi oluşturma
  const [showCreateContactModal, setShowCreateContactModal] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newContactTitle, setNewContactTitle] = useState('');
  const [isCreatingContact, setIsCreatingContact] = useState(false);
  const [showCreateCustomerModal, setShowCreateCustomerModal] = useState(false);
  const [showCreateSiteModal, setShowCreateSiteModal] = useState(false);

  // Sözleşmeye dönüştürme — late binding: yalnızca varsayılan depo veya ürün bazlı atama (global mod kaldırıldı)
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [convertMode, setConvertMode] = useState<'defaultWarehouse' | 'perItem'>('defaultWarehouse');
  const [defaultWarehouseIdForConvert, setDefaultWarehouseIdForConvert] = useState<number | ''>('');
  const [decrementStock, setDecrementStock] = useState<boolean | null>(null);
  const [convertModalError, setConvertModalError] = useState<string | null>(null);
  /** RENTAL sözleşmeye çevir: zorunlu sözleşme tarihleri */
  const [convertContractStartDate, setConvertContractStartDate] = useState('');
  const [convertContractEndDate, setConvertContractEndDate] = useState('');
  // perItemAssignments[ItemId] = { WarehouseId, Quantity }[]
  const [perItemAssignments, setPerItemAssignments] = useState<
    Record<number, { WarehouseId: number; Quantity: number }[]>
  >({});
  /** Dönüşüm modalında ürün bazlı depo stokları */
  const [convertItemStocks, setConvertItemStocks] = useState<
    Record<number, { WarehouseId: number; Quantity: number; WarehouseName?: string }[]>
  >({});
  const [convertStocksLoading, setConvertStocksLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDeleteReasonModal, setShowDeleteReasonModal] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteReasonError, setDeleteReasonError] = useState<string | null>(null);
  const [showRejectReasonModal, setShowRejectReasonModal] = useState(false);
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionReasonError, setRejectionReasonError] = useState<string | null>(null);
  const [showProductPickerModal, setShowProductPickerModal] = useState(false);
  const [lastAddedItemIds, setLastAddedItemIds] = useState<number[]>([]);
  const [iskonto, setIskonto] = useState<number>(0);
  /** Satır bazlı iskonto (%) - key: ItemId. Üstteki iskonto değişince tüm satırlara yansır; satırda tek tek de düzenlenebilir. */
  const [itemIskonto, setItemIskonto] = useState<Record<number, number>>({});
  const [vatRate, setVatRate] = useState<number>(20);
  const [quoteCode, setQuoteCode] = useState<string>('');
  const [currency, setCurrency] = useState<'TRY' | 'EUR' | 'USD'>('TRY');
  const [quoteType, setQuoteType] = useState<ContractQuoteType>(() => defaultTypeForNew ?? 'RENTAL');
  const [language, setLanguage] = useState<'TR' | 'EN'>('TR');

  /**
   * Fiyat inputları: TR ondalık ayıracı (,) desteklemek için string tutulur.
   * key: ItemId
   */
  const [priceOverrideInputs, setPriceOverrideInputs] = useState<Record<number, string>>({});

  // Teklif şablonu yönetimi
  const [templates, setTemplates] = useState<QuoteTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | ''>('');
  const [isTemplateEditorOpen, setIsTemplateEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<QuoteTemplate | null>(null);
  const [isNewTemplate, setIsNewTemplate] = useState(false);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [isAddingMaterialTable, setIsAddingMaterialTable] = useState(false);
  const [showManualLineModal, setShowManualLineModal] = useState(false);
  const [packages, setPackages] = useState<QuotePackage[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<string>('');
  const [showCreatePackageModal, setShowCreatePackageModal] = useState(false);
  const [newPackageName, setNewPackageName] = useState('');
  const [newPackageDescription, setNewPackageDescription] = useState('');
  const [newPackageDiscount, setNewPackageDiscount] = useState<number>(0);
  const [isCreatingPackage, setIsCreatingPackage] = useState(false);
  const [packagesLoadError, setPackagesLoadError] = useState<string | null>(null);
  const [fullQuote, setFullQuote] = useState<Quote | null>(null);
  const [isContractModalOpen, setIsContractModalOpen] = useState(false);
  const [convertedContract, setConvertedContract] = useState<Contract | null>(null);
  const [isOpeningConvertedContract, setIsOpeningConvertedContract] = useState(false);
  const [activeQuoteGridCell, setActiveQuoteGridCell] = useState<{ row: number; col: 2 | 3 | 4 | 6 } | null>(null);
  const quoteGridRefs = useRef<Map<string, HTMLElement>>(new Map());
  const activeQuote = fullQuote ?? quote;
  const converted = Boolean(activeQuote && isQuoteConverted(activeQuote));

  const openConvertedContract = async () => {
    if (!activeQuote?.ConvertedContractId) return;
    try {
      setIsOpeningConvertedContract(true);
      const c = await contractService.getByIdAsync(activeQuote.ConvertedContractId);
      setConvertedContract(c);
      setIsContractModalOpen(true);
    } catch (error) {
      console.error('Open converted contract error:', error);
      toast.error(getApiErrorMessage(error) || 'Sözleşme açılamadı');
    } finally {
      setIsOpeningConvertedContract(false);
    }
  };

  const formatAuthorizedContactLabel = (contact: NonNullable<Customer['AuthorizedContacts']>[number]) => {
    const suffix: string[] = [];
    if (contact.Title) suffix.push(contact.Title);
    const titlePart = suffix.length > 0 ? ` - ${suffix.join(' ')}` : '';
    const phonePart = contact.Phone ? ` (${contact.Phone})` : '';
    return `${contact.Name}${titlePart}${phonePart}`;
  };

  const resetSiteSelection = () => {
    setSelectedSiteId('');
    setIsNewSiteMode(false);
    setNewSiteForm(EMPTY_NEW_SITE_FORM);
  };

  const resetNewSiteMode = () => {
    setIsNewSiteMode(false);
    setNewSiteForm(EMPTY_NEW_SITE_FORM);
  };

  const handleSiteSelect = (value: number | '' | typeof NEW_SITE_SELECT_VALUE) => {
    if (value === NEW_SITE_SELECT_VALUE) {
      setIsNewSiteMode(true);
      setSelectedSiteId('');
      return;
    }
    setIsNewSiteMode(false);
    setNewSiteForm(EMPTY_NEW_SITE_FORM);
    setSelectedSiteId(value);
  };

  const handleCustomerChange = (value: number | '') => {
    setSelectedCustomerId(value);
    setSelectedAuthorizedContactId('');
    setAuthorizedContactError(null);
    resetSiteSelection();
  };

  const handleRequestNewSite = () => {
    if (!selectedCustomerId) {
      toast.warning('Önce müşteri seçin.');
      return;
    }
    setShowCreateSiteModal(true);
  };

  const handleSiteCreated = async (site: ConstructionSite) => {
    if (!selectedCustomerId) return;
    try {
      const refreshed = await siteService.getByCustomerAsync(Number(selectedCustomerId), { forceRefresh: true });
      setSites(refreshed);
    } catch {
      setSites((prev) => (prev.some((s) => s.SiteId === site.SiteId) ? prev : [...prev, site]));
    }
    setIsNewSiteMode(false);
    setNewSiteForm(EMPTY_NEW_SITE_FORM);
    setSelectedSiteId(site.SiteId);
  };

  const handleCustomerSaved = async (result: { customerId: number; isNew: boolean }) => {
    try {
      const [custData, created] = await Promise.all([
        customerService.getAllAsync(undefined, { forceRefresh: true }),
        result.isNew ? customerService.getByIdAsync(result.customerId).catch(() => null) : Promise.resolve(null),
      ]);
      const merged = created && !custData.some((c) => c.CustomerId === created.CustomerId)
        ? [created, ...custData]
        : created
          ? custData.map((c) => (c.CustomerId === created.CustomerId ? created : c))
          : custData;
      setCustomers(merged);
    } catch (error) {
      console.error('Reload customers error:', error);
    }
    if (result.isNew) {
      handleCustomerChange(result.customerId);
    }
  };

  const handleCreateContact = async () => {
    if (!selectedCustomerId) return;
    if (!newContactName.trim()) {
      toast.error('Ad Soyad zorunludur.');
      return;
    }

    try {
      setIsCreatingContact(true);
      const updatedCustomer = await customerService.createContactAsync(Number(selectedCustomerId), {
        Name: newContactName.trim(),
        Phone: newContactPhone.trim() || undefined,
        Email: newContactEmail.trim() || undefined,
        Title: newContactTitle.trim() || undefined,
        IsPrimary: true,
      });

      // State'i güncelle
      setCustomers((prev) =>
        prev.map((c) => (c.CustomerId === updatedCustomer.CustomerId ? updatedCustomer : c))
      );

      // Yeni yetkiliyi otomatik seç
      const newContact = updatedCustomer.AuthorizedContacts?.find(
        (c) => c.Name === newContactName.trim() && c.IsPrimary
      );
      if (newContact) {
        setSelectedAuthorizedContactId(newContact.CustomerAuthorizedContactId ?? '');
      }

      toast.success('Merkez yetkilisi başarıyla oluşturuldu.');
      setShowCreateContactModal(false);
      // Formu temizle
      setNewContactName('');
      setNewContactPhone('');
      setNewContactEmail('');
      setNewContactTitle('');
    } catch (error) {
      console.error('Create contact error:', error);
      toast.error(getApiErrorMessage(error) || 'Yetkili oluşturulamadı.');
    } finally {
      setIsCreatingContact(false);
    }
  };



  useEffect(() => {
    loadData();
    loadTemplates();
    loadPackages();
  }, []);

  useEffect(() => {
    if (isNew) {
      setQuoteType(defaultTypeForNew ?? 'RENTAL');
    }
  }, [isNew, defaultTypeForNew]);

  useEffect(() => {
    // Modal aynı component instance'ı ile tekrar açılabildiği için (key değişse bile),
    // "Yeni Teklif" / "kopyalanmış taslak" modlarında satırların düzenlenebilir
    // olduğundan emin ol.
    setIsReadOnly(!isNew && !startInEditMode);
  }, [isNew, startInEditMode]);

  useEffect(() => {
    if (quote?.QuoteId) setPersistedQuoteId(quote.QuoteId);
  }, [quote?.QuoteId]);

  useEffect(() => {
    skipDirtyRef.current = true;
    setIsDirty(false);
    const t = window.setTimeout(() => {
      skipDirtyRef.current = false;
    }, 400);
    return () => window.clearTimeout(t);
  }, [isReadOnly, quote?.QuoteId, isNew]);

  useEffect(() => {
    if (skipDirtyRef.current || isReadOnly) return;
    setIsDirty(true);
  }, [
    isReadOnly,
    selectedCustomerId,
    selectedAuthorizedContactId,
    selectedSiteId,
    quoteItems,
    subject,
    notes,
    quoteCode,
    startDate,
    plannedEndDate,
    rentalDurationDays,
    iskonto,
    vatRate,
    currency,
    language,
    status,
    quoteType,
  ]);

  useEffect(() => {
    if (!quote?.QuoteId || isNew) {
      setFullQuote(null);
      return;
    }
    let cancelled = false;
    const loadFullQuote = async () => {
      try {
        const detail = await quoteService.getByIdAsync(quote.QuoteId);
        if (!cancelled) setFullQuote(detail);
      } catch (error) {
        console.error('Load full quote error:', error);
        if (!cancelled) setFullQuote(quote);
      }
    };
    loadFullQuote();
    return () => {
      cancelled = true;
    };
  }, [quote?.QuoteId, isNew]);

  const refreshQuoteDetail = useCallback(async () => {
    if (!quote?.QuoteId || isNew) return;
    try {
      const detail = await quoteService.getByIdAsync(quote.QuoteId);
      setFullQuote(detail);
    } catch (error) {
      console.error('Refresh quote error:', error);
    }
    await onDataChanged?.();
  }, [quote?.QuoteId, isNew, onDataChanged]);

  useEffect(() => {
    if (converted) {
      setIsReadOnly(true);
    }
  }, [converted]);

  useEffect(() => {
    if (isNew) {
      return;
    }
    const source = fullQuote ?? quote;
    if (source) {
      const parsedIskonto = Number(
        (source as any).Iskonto ??
          (source as any).iskonto ??
          (source as any).Discount ??
          (source as any).discount ??
          0
      );
      const parsedVatRate = Number(
        (source as any).VatRate ??
          (source as any).vatRate ??
          (source as any).Kdv ??
          (source as any).kdv ??
          20
      );
      setSelectedCustomerId(source.CustomerId ?? '');
      setSelectedAuthorizedContactId((source as { CustomerAuthorizedContactId?: number | null }).CustomerAuthorizedContactId ?? '');
      setSelectedSiteId(source.SiteId || '');
      {
        const sourceStartDate = source.StartDate;
        if (sourceStartDate != null && String(sourceStartDate).trim()) {
          setStartDate(String(sourceStartDate).split('T')[0]);
        } else {
          setStartDate('');
        }
      }
      {
        const ped = source.PlannedEndDate;
        if (ped != null && String(ped).trim()) {
          setPlannedEndDate(String(ped).split('T')[0]);
        } else {
          setPlannedEndDate('');
        }
      }
      {
        const rdRaw = (source as Quote).RentalDurationDays ?? (source as any).rentalDurationDays;
        const rdNum = rdRaw != null && String(rdRaw).trim() !== '' ? Math.floor(Number(rdRaw)) : NaN;
        if (Number.isFinite(rdNum) && rdNum >= 1) {
          setRentalDurationDays(rdNum);
        } else {
          const sd = (source as Quote).StartDate;
          const ped = source.PlannedEndDate;
          if (sd != null && String(sd).trim() && ped != null && String(ped).trim()) {
            const s = new Date(String(sd)).getTime();
            const e = new Date(String(ped)).getTime();
            const d = Math.ceil((e - s) / (1000 * 60 * 60 * 24));
            setRentalDurationDays(Number.isFinite(d) && d >= 1 ? d : 30);
          } else {
            setRentalDurationDays(30);
          }
        }
      }
      setStatus(source.Status);
      setRejectionReason(String((source as Quote).RejectionReason ?? '').trim());
      setSubject(String((source as any).Subject ?? (source as any).subject ?? '').trim());
      setNotes(source.Notes || '');
      setIskonto(Number.isFinite(parsedIskonto) ? parsedIskonto : 0);
      setVatRate(Number.isFinite(parsedVatRate) ? parsedVatRate : 20);
      setQuoteCode(source.QuoteCode ?? '');
      setCurrency(source.Currency === 'EUR' ? 'EUR' : source.Currency === 'USD' ? 'USD' : 'TRY');
      setLanguage((source as any).Language === 'EN' ? 'EN' : 'TR');
      setQuoteType(resolveContractQuoteType(source));

      const details = (source as any).details ?? source.QuoteDetails ?? [];
      if (details.length > 0) {
        const items: QuoteLineItem[] = (details as any[]).map((detail: any) => {
          const isManual = detail.is_manual === true || detail.IsManual === true || detail.IsManual === 1;
          if (isManual) {
            return {
              kind: 'manual',
              ClientId: `manual-${detail.QuoteDetailId ?? crypto.randomUUID()}`,
              QuoteDetailId: detail.QuoteDetailId,
              is_manual: true,
              Description: String(detail.Description ?? detail.description ?? '').trim() || 'Manuel Kalem',
              Quantity: Number(detail.Quantity ?? 1) || 1,
              UnitPriceSnapshot: Number(detail.UnitPriceSnapshot ?? detail.unitPriceSnapshot ?? detail.DailyPrice ?? 0) || 0,
              PriceUnit: (detail.PriceUnit ?? detail.priceUnit ?? (resolveContractQuoteType(source) === 'SALE' ? 'EACH' : 'DAY')) as any,
              PriceSource: (detail.PriceSource ?? detail.priceSource ?? 'MANUAL') as any,
            };
          }
          return {
            kind: 'inventory',
            QuoteDetailId: detail.QuoteDetailId,
            ItemId: detail.ItemId,
            Quantity: detail.Quantity,
            UnitPriceSnapshot: Number(detail.UnitPriceSnapshot ?? detail.unitPriceSnapshot ?? detail.DailyPrice ?? 0) || 0,
            PriceUnit: (detail.PriceUnit ?? detail.priceUnit ?? (resolveContractQuoteType(source) === 'SALE' ? 'EACH' : 'DAY')) as any,
            MonthlyPriceOverride:
              detail.MonthlyPriceOverride != null && Number.isFinite(Number(detail.MonthlyPriceOverride))
                ? Number(detail.MonthlyPriceOverride)
                : undefined,
            PriceSource: (detail.PriceSource ?? detail.priceSource ?? 'INVENTORY') as any,
            OverrideUnitPrice: undefined,
            OverrideMonthlyPrice:
              detail.MonthlyPriceOverride != null && Number.isFinite(Number(detail.MonthlyPriceOverride))
                ? Number(detail.MonthlyPriceOverride)
                : undefined,
            Item: undefined,
            // ItemName: envanterdeki orijinal ad (detail.ItemName backend'de override birleşik dönebilir)
            ItemName:
              detail.Item?.ItemName ??
              detail.item?.itemName ??
              '',
            ItemNameOverride:
              (detail.ItemNameOverride ??
                detail.itemNameOverride ??
                detail.ItemName_Override ??
                detail.item_name_override ??
                null) as any,
            ItemCode: detail.ItemCode ?? detail.itemCode ?? undefined,
            ItemCodeOverride:
              (detail.ItemCodeOverride ??
                detail.itemCodeOverride ??
                detail.ItemCode_Override ??
                detail.item_code_override ??
                null) as string | null,
            ItemNameEn: detail.ItemNameEn ?? detail.itemNameEn ?? undefined,
          };
        });
        setQuoteItems(items);
        setPriceOverrideInputs((prev) => {
          const next = { ...prev };
          const sourceQuoteType = resolveContractQuoteType(source);
          for (const it of items) {
            if (it.kind !== 'inventory') continue;
            // Kullanicinin daha once bu satirda dokundugu/temizledigi degeri ezme.
            if (next[it.ItemId] != null) continue;

            // Yeni model:
            // - RENTAL: MonthlyPriceOverride doluysa input'u bununla doldur.
            // - SALE: backend override'ı ayrıca dönmeyebilir; input başlangıçta boş, placeholder UnitPriceSnapshot.
            if (sourceQuoteType === 'RENTAL') {
              const candidate =
                it.OverrideMonthlyPrice != null && Number.isFinite(Number(it.OverrideMonthlyPrice))
                  ? Number(it.OverrideMonthlyPrice)
                  : null;
              if (candidate != null) {
                const { masked } = normalizeMaskedDecimalTR(String(candidate), {
                  maxIntDigits: 9,
                  maxFracDigits: 2,
                });
                next[it.ItemId] = masked;
              } else {
                next[it.ItemId] = '';
              }
            } else {
              next[it.ItemId] = '';
            }
          }
          return next;
        });
        const globalIsk = Number.isFinite(parsedIskonto) ? parsedIskonto : 0;
        setItemIskonto((prev) => {
          const next = { ...prev };
          items.forEach((i) => {
            if (i.kind === 'inventory') next[i.ItemId] = globalIsk;
          });
          return next;
        });
      } else {
        setQuoteItems([]);
      }

      if (source.CustomerId) {
        loadSites(source.CustomerId);
      }
    }
  }, [isNew, quote, fullQuote]);

  const parsePriceInput = (raw: string): number | undefined | null => {
    const s = String(raw ?? '').trim();
    if (!s) return undefined;
    // Hem TR (,) hem EN (.) ondalık ayracı destekle:
    // - Virgül varsa: virgül ondalıktır, noktalar binliktir.
    // - Virgül yoksa ve nokta varsa: nokta ondalıktır, virgüller binliktir.
    // - İkisi de yoksa: düz sayı.
    const compact = s.replace(/\s+/g, '');
    let normalized = compact;
    if (compact.includes(',')) {
      normalized = compact.replace(/\./g, '').replace(',', '.');
    } else if (compact.includes('.')) {
      // TR maskelemede '.' binlik ayıracı olarak gelebilir (örn: 1.234.567).
      // Bu durumda tüm noktaları kaldırmalıyız; aksi halde Number("1.234.567") => NaN olur.
      const dotCount = (compact.match(/\./g) ?? []).length;
      if (dotCount > 1 || /^\d{1,3}(\.\d{3})+$/.test(compact)) {
        normalized = compact.replace(/\./g, '').replace(/,/g, '');
      } else {
        normalized = compact.replace(/,/g, '');
      }
    } else {
      normalized = compact.replace(/,/g, '').replace(/\./g, '');
    }
    const v = Number(normalized);
    if (!Number.isFinite(v)) return null;
    if (v < 0) return null;
    return v;
  };

  const formatPriceInput = (value: number | undefined): string => {
    if (value == null || !Number.isFinite(value)) return '';
    return String(value).replace('.', ',');
  };

  const formatThousandsTR = (digits: string): string => {
    const d = (digits ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
    if (!d) return '';
    return d.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };

  const limitDigits = (digits: string, max: number): string => digits.slice(0, max);

  const coerceDecimalDotToComma = (raw: string): string => {
    const s = String(raw ?? '').trim();
    if (!s || s.includes(',')) return s;
    const compact = s.replace(/\s+/g, '');
    const dotCount = (compact.match(/\./g) ?? []).length;
    if (dotCount === 0) return s;
    // Birden fazla nokta veya binlik deseni: noktalar binlik ayırıcıdır.
    if (dotCount > 1 || /^\d{1,3}(\.\d{3})+$/.test(compact)) return s;
    // Tek nokta: ondalık (örn. 12.5, 1234.56, 12.)
    return compact.replace('.', ',');
  };

  const normalizeMaskedDecimalTR = (
    raw: string,
    opts?: { maxIntDigits?: number; maxFracDigits?: number }
  ): { masked: string; numeric: number | undefined | null } => {
    const maxIntDigits = opts?.maxIntDigits ?? 9;
    const maxFracDigits = opts?.maxFracDigits ?? 2;
    const s = coerceDecimalDotToComma(String(raw ?? '').trim());
    if (!s) return { masked: '', numeric: undefined };

    // TR gösterimde '.' binlik, ',' ondalık olsun.
    const decimalSep = s.includes(',') ? ',' : null;
    const hasTrailingDecimalSep = /,$/.test(s.replace(/\s+/g, ''));

    let intPart = '';
    let fracPart = '';
    if (decimalSep) {
      const idx = s.lastIndexOf(decimalSep);
      intPart = s.slice(0, idx);
      fracPart = s.slice(idx + 1);
    } else {
      intPart = s;
      fracPart = '';
    }

    const intDigits = limitDigits(intPart.replace(/\D/g, ''), maxIntDigits);
    const fracDigits = limitDigits(fracPart.replace(/\D/g, ''), maxFracDigits);

    const maskedInt = formatThousandsTR(intDigits);
    const masked = fracDigits
      ? `${maskedInt},${fracDigits}`
      : hasTrailingDecimalSep && maskedInt
        ? `${maskedInt},`
        : maskedInt;

    const numeric = parsePriceInput(masked);
    return { masked, numeric };
  };

  const normalizeMaskedIntegerTR = (
    raw: string,
    opts?: { maxDigits?: number; min?: number }
  ): { masked: string; numeric: number } => {
    const maxDigits = opts?.maxDigits ?? 9;
    const min = opts?.min ?? 1;
    const digits = limitDigits(String(raw ?? '').replace(/\D/g, ''), maxDigits);
    const masked = formatThousandsTR(digits);
    const n = Number(digits || 0);
    const numeric = Number.isFinite(n) ? Math.max(min, Math.floor(n)) : min;
    return { masked, numeric };
  };

  useEffect(() => {
    const loadAuthorizedContacts = async () => {
      if (!selectedCustomerId) {
        setAuthorizedContacts([]);
        setSelectedAuthorizedContactId('');
        setAuthorizedContactError(null);
        return;
      }

      setAuthorizedContactsLoading(true);
      try {
        let customer = customers.find((c) => c.CustomerId === Number(selectedCustomerId));
        if (!customer || customer.AuthorizedContacts === undefined) {
          customer = await customerService.getByIdAsync(Number(selectedCustomerId));
        }
        const contacts = [...(customer.AuthorizedContacts ?? [])].sort(
          (a, b) => (a.OrderNo ?? Number.MAX_SAFE_INTEGER) - (b.OrderNo ?? Number.MAX_SAFE_INTEGER)
        );
        setAuthorizedContacts(contacts);
        if (contacts.length === 0) {
          setSelectedAuthorizedContactId('');
          setAuthorizedContactError('Bu müşteri için yetkili tanımlı değil.');
          return;
        }
        setAuthorizedContactError(null);
        setSelectedAuthorizedContactId((prev) => {
          if (prev && contacts.some((c) => c.CustomerAuthorizedContactId === prev)) return prev;
          const primary = contacts.find((c) => c.IsPrimary);
          return primary?.CustomerAuthorizedContactId ?? contacts[0].CustomerAuthorizedContactId ?? '';
        });
      } catch (error) {
        console.error('Load authorized contacts error:', error);
        setAuthorizedContacts([]);
        setSelectedAuthorizedContactId('');
        setAuthorizedContactError('Yetkili listesi yüklenemedi.');
      } finally {
        setAuthorizedContactsLoading(false);
      }
    };
    loadAuthorizedContacts();
  }, [selectedCustomerId, customers]);

  // Müşteri değiştiğinde şantiyeleri yükle
  useEffect(() => {
    if (selectedCustomerId) {
      loadSites(Number(selectedCustomerId));
    } else {
      setSites([]);
      resetSiteSelection();
    }
  }, [selectedCustomerId]);

  useEffect(() => {
    // SALE seçilince PlannedEndDate backend tarafından yok sayılıyor (null).
    // Kullanıcı "kaydedilmedi mi?" yanılgısı yaşamaması için state'i temizle.
    if (quoteType === 'SALE') {
      setPlannedEndDate('');
    }
  }, [quoteType]);

  const loadSites = async (customerId: number, forceRefresh = false) => {
    try {
      setSitesLoading(true);
      const data = await siteService.getByCustomerAsync(customerId, { forceRefresh });
      setSites(data);
    } catch (error) {
      console.error('Load sites error:', error);
      setSites([]);
    } finally {
      setSitesLoading(false);
    }
  };

  useEffect(() => {
    // Load item names for quote items
    const loadItemNames = async () => {
      const itemsWithNames = await Promise.all(
        quoteItems.map(async (item) => {
          if (item.kind === 'manual') return item;
          try {
            const inventoryItem =
              item.Item ?? availableItems.find((i) => i.ItemId === item.ItemId) ??
              (await inventoryService.getByIdAsync(item.ItemId));
            if (
              item.Item &&
              item.ItemName === inventoryItem.ItemName &&
              item.ItemNameEn !== undefined
            ) {
              return item;
            }
            return {
              ...item,
              Item: inventoryItem,
              ItemName: inventoryItem.ItemName,
              ItemNameEn: inventoryItem.ItemNameEn ?? undefined,
            };
          } catch {
            return { ...item, ItemName: item.ItemName || 'Bilinmiyor' };
          }
        })
      );
      const changed = itemsWithNames.some((it, i) => it !== quoteItems[i]);
      if (changed) setQuoteItems(itemsWithNames);
    };

    if (quoteItems.some((i) => i.kind === 'inventory')) {
      loadItemNames();
    }
  }, [quoteItems.length, availableItems.length]);

  useEffect(() => {
    if (quoteItems.length === 0) return;
    setQuoteItems((prev) => {
      let changed = false;
      const next = prev.map((item) => {
        if (item.kind !== 'inventory') return item;
        const inv = item.Item ?? availableItems.find((i) => i.ItemId === item.ItemId);
        if (!inv) return item;
        // Server'dan yuklenen mevcut bir kalem (QuoteDetailId dolu) ise fiyat snapshot'ına
        // DOKUNMA. Backend satır için UnitPriceSnapshot'ı (ve varsa override) zaten
        // normalize edip döndürüyor; envanterin güncel fiyatıyla ezersek geçmiş snapshot bozulur.
        // Sadece eksik envanter referansını ve görselleme alanlarını doldur.
        const isExistingDetail = item.QuoteDetailId != null;
        if (isExistingDetail) {
          const canonicalName = inv.ItemName;
          const canonicalEn = inv.ItemNameEn ?? undefined;
          if (
            item.Item &&
            item.ItemName === canonicalName &&
            item.ItemNameEn !== undefined
          ) {
            return item;
          }
          changed = true;
          return {
            ...item,
            Item: item.Item ?? inv,
            ItemName: canonicalName,
            ItemNameEn: item.ItemNameEn ?? canonicalEn,
          };
        }
        // Yeni teklif / kullanicinin client-side eklemis oldugu kalem: para birimi
        // veya teklif tipi degistigind, fiyati guncel envantere gore senkronize et.
        const dp = unitPriceForQuoteInventory(inv, currency, quoteType);
        if (item.UnitPriceSnapshot === dp && item.Item) return item;
        changed = true;
        return {
          ...item,
          UnitPriceSnapshot: dp,
          PriceUnit: (quoteType === 'SALE' ? 'EACH' : 'DAY') as 'EACH' | 'DAY',
          Item: item.Item ?? inv,
          ItemNameEn: item.ItemNameEn ?? inv.ItemNameEn ?? undefined,
        };
      });
      return changed ? next : prev;
    });
  }, [quoteType, currency, availableItems]);

  const loadData = async () => {
    try {
      const [custData, invData, whData] = await Promise.all([
        customerService.getAllAsync(),
        inventoryService.getAllAsync(undefined, { forceRefresh: true }),
        warehouseService.getActiveAsync(),
      ]);
      setCustomers(custData);
      setAvailableItems(invData);
      setWarehouses(whData);
    } catch (error) {
      console.error('Load data error:', error);
    }
  };

  const loadTemplates = async () => {
    try {
      const templateList = await quoteTemplateService.getAllAsync();
      setTemplates(templateList);
      setSelectedTemplateId((prev) => {
        if (prev) return prev;
        const defaultTemplate = templateList.find((t) => t.IsDefault) ?? templateList[0];
        return defaultTemplate ? defaultTemplate.TemplateId : '';
      });
    } catch (error) {
      console.error('Load templates error:', error);
      setTemplates([]);
    }
  };

  const loadPackages = async () => {
    try {
      const packageList = await packageService.getAllAsync();
      setPackages(packageList);
      setPackagesLoadError(null);
    } catch (error) {
      console.error('Load packages error:', error);
      setPackages([]);
      setPackagesLoadError(getApiErrorMessage(error));
    }
  };

  const plannedDays = useMemo(() => {
    if (quoteType !== 'RENTAL') return 0;
    const hasPair = Boolean(startDate.trim() && plannedEndDate.trim());
    if (hasPair) {
      const end = new Date(plannedEndDate).getTime();
      const start = new Date(startDate).getTime();
      if (!Number.isFinite(end) || !Number.isFinite(start)) return 0;
      const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
      return Number.isFinite(days) ? Math.max(0, days) : 0;
    }
    const d = Math.floor(Number(rentalDurationDays));
    return Number.isFinite(d) && d >= 1 ? d : 0;
  }, [quoteType, plannedEndDate, startDate, rentalDurationDays]);

  const billedDays = useMemo(() => {
    if (quoteType !== 'RENTAL') return 0;
    return Math.max(30, plannedDays);
  }, [quoteType, plannedDays]);

  const effectiveDailyPrice = (item: QuoteLineItem): number => {
    if (item.kind === 'manual') return item.UnitPriceSnapshot;
    if (quoteType === 'SALE') {
      return item.OverrideUnitPrice != null ? item.OverrideUnitPrice : item.UnitPriceSnapshot;
    }
    return item.OverrideMonthlyPrice != null ? item.OverrideMonthlyPrice / 30 : item.UnitPriceSnapshot;
  };

  const getLineTotal = (item: QuoteLineItem) => {
    const daily = effectiveDailyPrice(item);
    if (item.kind === 'manual') return daily * item.Quantity;
    if (quoteType === 'SALE') return daily * item.Quantity;
    return daily * item.Quantity * billedDays;
  };

  const totalPrice = quoteItems.reduce((sum, item) => sum + getLineTotal(item), 0);

  /** Satır için iskonto oranı: satıra özel yoksa üstteki global iskonto. */
  const getItemIskonto = (itemId: number) => itemIskonto[itemId] ?? iskonto;

  // Toplam tutar kırılımları (satır bazlı iskonto)
  const subtotal = totalPrice;
  const discountAmount = quoteItems.reduce((sum, item) => {
    const lineTotal = getLineTotal(item);
    const pct = item.kind === 'inventory' ? getItemIskonto(item.ItemId) : iskonto;
    return sum + lineTotal * (pct / 100);
  }, 0);
  const discountedTotal = subtotal - discountAmount;
  const vatAmount = discountedTotal * (vatRate / 100);
  const grandTotal = discountedTotal + vatAmount;

  /** Panelden ürün + miktar ile listeye ekler. */
  const addItemFromPicker = (item: Inventory, quantity: number) => {
    const qty = Math.max(1, quantity);
    const existingItem = quoteItems.find((i) => i.kind === 'inventory' && i.ItemId === item.ItemId);

    if (existingItem) {
      setQuoteItems(
        quoteItems.map((i) =>
          i.kind === 'inventory' && i.ItemId === item.ItemId ? { ...i, Quantity: i.Quantity + qty } : i
        )
      );
    } else {
      const dailyPrice = unitPriceForQuoteInventory(item, currency, quoteType);
      setQuoteItems([
        ...quoteItems,
        {
          kind: 'inventory',
          QuoteDetailId: 0,
          ItemId: item.ItemId,
          Quantity: qty,
          UnitPriceSnapshot: dailyPrice,
          PriceUnit: (quoteType === 'SALE' ? 'EACH' : 'DAY') as 'EACH' | 'DAY',
          MonthlyPriceOverride: undefined,
          PriceSource: 'INVENTORY',
          OverrideUnitPrice: undefined,
          OverrideMonthlyPrice: undefined,
          Item: item,
          ItemName: item.ItemName,
          ItemNameOverride: null,
          ItemCode: item.ItemCode,
          ItemCodeOverride: null,
          ItemNameEn: item.ItemNameEn ?? undefined,
        },
      ]);
      setItemIskonto((prev) => ({ ...prev, [item.ItemId]: iskonto }));
    }
    setLastAddedItemIds((prev) => [...prev.filter((id) => id !== item.ItemId), item.ItemId]);
    return true;
  };

  useEffect(() => {
    if (lastAddedItemIds.length === 0) return;
    const t = setTimeout(() => setLastAddedItemIds([]), 1600);
    return () => clearTimeout(t);
  }, [lastAddedItemIds]);

  useEffect(() => {
    if (isReadOnly || quoteItems.length === 0) {
      setActiveQuoteGridCell(null);
      return;
    }
    setActiveQuoteGridCell((prev) => {
      if (!prev) return { row: 0, col: 2 };
      const nextRow = Math.min(prev.row, quoteItems.length - 1);
      // quoteItems her değiştiğinde aynı hücreyi tekrar set etmek,
      // focus effect'inin input'u yeniden select etmesine ve yazımın bölünmesine sebep olur.
      if (nextRow === prev.row) return prev;
      return { row: nextRow, col: prev.col };
    });
  }, [isReadOnly, quoteItems]);

  useEffect(() => {
    if (!activeQuoteGridCell) return;
    const key = `${activeQuoteGridCell.row}-${activeQuoteGridCell.col}`;
    const target = quoteGridRefs.current.get(key);
    target?.focus();
    if (target instanceof HTMLInputElement) {
      target.select();
    }
  }, [activeQuoteGridCell]);

  const handleQuoteGridKeyDown = (
    e: React.KeyboardEvent<HTMLElement>,
    row: number,
    col: 2 | 3 | 4 | 6
  ) => {
    const colOrder: Array<2 | 3 | 4 | 6> = [2, 3, 4, 6];
    const colIndex = colOrder.indexOf(col);
    if (colIndex < 0 || quoteItems.length === 0) return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
    } else {
      return;
    }

    let nextRow = row;
    let nextColIndex = colIndex;

    if (e.key === 'ArrowDown') nextRow = Math.min(quoteItems.length - 1, row + 1);
    if (e.key === 'ArrowUp') nextRow = Math.max(0, row - 1);
    if (e.key === 'ArrowRight') nextColIndex = Math.min(colOrder.length - 1, colIndex + 1);
    if (e.key === 'ArrowLeft') nextColIndex = Math.max(0, colIndex - 1);

    // Manuel satırlarda fiyat inputu olmayabilir; aynı yönde, ref bulunan hücreyi bulup ona git.
    const stepRow = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    const stepCol = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;

    let probeRow = nextRow;
    let probeColIndex = nextColIndex;
    const maxProbe = quoteItems.length * colOrder.length;
    for (let i = 0; i < maxProbe; i++) {
      const key = `${probeRow}-${colOrder[probeColIndex]}`;
      if (quoteGridRefs.current.get(key)) {
        setActiveQuoteGridCell({ row: probeRow, col: colOrder[probeColIndex] });
        return;
      }
      // aynı yönde ilerle
      if (stepRow !== 0) {
        probeRow = Math.min(quoteItems.length - 1, Math.max(0, probeRow + stepRow));
        if (probeRow === 0 || probeRow === quoteItems.length - 1) break;
      } else if (stepCol !== 0) {
        probeColIndex = Math.min(colOrder.length - 1, Math.max(0, probeColIndex + stepCol));
        if (probeColIndex === 0 || probeColIndex === colOrder.length - 1) break;
      } else {
        break;
      }
    }

    setActiveQuoteGridCell({ row: nextRow, col: colOrder[nextColIndex] });
  };

  const handleRemoveItem = (itemId: number) => {
    setQuoteItems(quoteItems.filter((i) => !(i.kind === 'inventory' && i.ItemId === itemId)));
  };

  const pickerPickedItemIds = useMemo(
    () => new Set(quoteItems.filter((i) => i.kind === 'inventory').map((i) => i.ItemId)),
    [quoteItems]
  );

  const toggleItemFromPicker = (item: Inventory, quantity: number) => {
    const existing = quoteItems.find((i) => i.kind === 'inventory' && i.ItemId === item.ItemId);
    if (existing) {
      handleRemoveItem(item.ItemId);
      return 'removed' as const;
    }
    return addItemFromPicker(item, quantity);
  };

  const handleRemoveManualItem = (clientId: string) => {
    setQuoteItems(quoteItems.filter((i) => !(i.kind === 'manual' && i.ClientId === clientId)));
  };

  const updateQuoteItemQuantity = (itemId: number, newQty: number) => {
    const qty = Math.max(0, Math.floor(newQty));
    setQuoteItems((prev) =>
      prev.map((i) => (i.kind === 'inventory' && i.ItemId === itemId ? { ...i, Quantity: qty } : i))
    );
  };

  const updateQuoteItemIskonto = (itemId: number, value: number) => {
    const pct = Math.max(0, Math.min(100, value));
    setItemIskonto((prev) => ({ ...prev, [itemId]: pct }));
  };

  /** Üstteki iskonto değişince tüm satırlara uygula */
  const handleGlobalIskontoChange = (value: number) => {
    setIskonto(value);
    setItemIskonto((prev) => {
      const next = { ...prev };
      quoteItems.forEach((i) => {
        if (i.kind === 'inventory') next[i.ItemId] = value;
      });
      return next;
    });
  };

  const currentUser = useAuthStore((s) => s.user);
  const canUpdateQuote = Boolean(currentUser?.permissions?.includes('quotes_update'));
  const canDeleteQuote = Boolean(currentUser?.permissions?.includes('quotes_delete'));
  const canCancelContract = Boolean(currentUser?.permissions?.includes('contracts_delete'));

  const isDraftRecord = isNew || isQuoteDraftStatus(status);
  const hasDraftContent = hasMeaningfulQuoteDraftContent({
    customerId: selectedCustomerId === '' ? null : Number(selectedCustomerId),
    itemCount: quoteItems.length,
    subject,
    notes,
    quoteCode,
  });

  const buildQuoteDetailsPayload = () => {
    const normalizeOptionalOverride = (raw: unknown): string | null => {
      const s = typeof raw === 'string' ? raw.trim() : '';
      return s ? s : null;
    };
    return quoteItems.map((item) => {
      if (item.kind === 'manual') {
        return {
          is_manual: true,
          Description: item.Description,
          Quantity: item.Quantity,
          DailyPrice: item.UnitPriceSnapshot,
        };
      }
      const base: Record<string, unknown> = {
        ItemId: item.ItemId,
        Quantity: item.Quantity,
        is_manual: false,
        ItemNameOverride: normalizeOptionalOverride(item.ItemNameOverride),
        ItemCodeOverride: normalizeOptionalOverride(item.ItemCodeOverride),
      };
      if (quoteType === 'SALE') {
        if (item.OverrideUnitPrice != null && Number.isFinite(item.OverrideUnitPrice)) {
          base.OverrideUnitPrice = item.OverrideUnitPrice;
        }
      } else if (item.OverrideMonthlyPrice != null && Number.isFinite(item.OverrideMonthlyPrice)) {
        base.OverrideMonthlyPrice = item.OverrideMonthlyPrice;
      }
      return base;
    });
  };

  const buildQuoteHeaderPayload = (targetStatus: QuoteStatus) => {
    const requestBody: Record<string, unknown> = {
      Status: targetStatus,
      Subject: normalizeText(subject) ? normalizeText(subject) : null,
      Notes: normalizeText(notes) || undefined,
      Iskonto: iskonto,
      VatRate: vatRate,
      Currency: currency,
      Language: language,
      Type: quoteType,
    };
    if (selectedCustomerId !== '') {
      requestBody.CustomerId = Number(selectedCustomerId);
    } else if (targetStatus === QuoteStatus.Draft) {
      requestBody.CustomerId = null;
    }
    if (selectedAuthorizedContactId !== '') {
      requestBody.CustomerAuthorizedContactId = Number(selectedAuthorizedContactId);
    }
    if (quoteType === 'RENTAL') {
      const useDatePair = Boolean(startDate.trim() && plannedEndDate.trim());
      if (useDatePair) {
        requestBody.StartDate = new Date(startDate).toISOString();
        requestBody.PlannedEndDate = new Date(plannedEndDate).toISOString();
        const rd = Math.floor(Number(rentalDurationDays));
        if (Number.isFinite(rd) && rd >= 1) requestBody.RentalDurationDays = rd;
      } else {
        const rd = Math.floor(Number(rentalDurationDays));
        if (Number.isFinite(rd) && rd >= 1) {
          requestBody.RentalDurationDays = rd;
        }
      }
    }
    const siteFields = buildSiteRequestFields(isNewSiteMode, newSiteForm, selectedSiteId);
    if (selectedCustomerId !== '') {
      Object.assign(requestBody, siteFields);
    }
    if (normalizeText(quoteCode)) {
      requestBody.QuoteCode = normalizeText(quoteCode);
    }
    const details = buildQuoteDetailsPayload();
    if (details.length > 0) requestBody.details = details;
    return requestBody;
  };

  const persistDraft = async (options?: { silent?: boolean }): Promise<number | null> => {
    if (!hasDraftContent) return persistedQuoteId;
    try {
      setIsBusy(true);
      const body = buildQuoteHeaderPayload(QuoteStatus.Draft);
      const existingId = persistedQuoteId ?? quote?.QuoteId ?? null;
      let quoteId = existingId;
      if (!quoteId) {
        const result = await quoteService.createAsync(body as any);
        quoteId = result.QuoteId;
        setPersistedQuoteId(quoteId);
        if (result.CreatedSiteId && selectedCustomerId) {
          await applyCreatedSiteId({
            customerId: Number(selectedCustomerId),
            createdSiteId: result.CreatedSiteId,
            setSites,
            setSelectedSiteId,
            resetNewSiteMode,
          });
        }
      } else {
        const updateResult = await quoteService.updateAsync(quoteId, body as any);
        if (updateResult.CreatedSiteId && selectedCustomerId) {
          await applyCreatedSiteId({
            customerId: Number(selectedCustomerId),
            createdSiteId: updateResult.CreatedSiteId,
            setSites,
            setSelectedSiteId,
            resetNewSiteMode,
          });
        }
      }
      setStatus(QuoteStatus.Draft);
      setIsDirty(false);
      if (!options?.silent) {
        toast.success('Taslak kaydedildi.');
      }
      await onDataChanged?.();
      return quoteId;
    } catch (error) {
      console.error('Save draft quote error:', error);
      toast.error(getApiErrorMessage(error) || 'Taslak kaydedilemedi.');
      return null;
    } finally {
      setIsBusy(false);
    }
  };

  const requestClose = async () => {
    if (isBusy) return;
    if (isDraftRecord && !isReadOnly && isDirty && hasDraftContent) {
      const savedId = await persistDraft({ silent: true });
      if (!savedId) return;
      toast.info('Taslak kaydedildi. Listeden devam edebilirsiniz.');
      onClose();
      return;
    }
    if (!isDraftRecord && !isReadOnly && isDirty && !converted) {
      setShowUnsavedConfirm(true);
      return;
    }
    onClose();
  };

  const handleSaveAsDraft = async () => {
    if (isBusy) return;
    if (!hasDraftContent) {
      toast.warning('Taslak için müşteri, kalem veya not ekleyin.');
      return;
    }
    const savedId = await persistDraft();
    if (savedId) onClose();
  };

  const openProductPicker = async () => {
    try {
      const invData = await inventoryService.getAllAsync(undefined, { forceRefresh: true });
      setAvailableItems(invData);
    } catch (error) {
      console.error('Refresh inventory for picker error:', error);
    }
    setShowProductPickerModal(true);
  };

  const handleSave = async (forceStatus?: QuoteStatus) => {
    if (!forceStatus && !isNew && isQuoteDraftStatus(status)) {
      const savedId = await persistDraft();
      if (savedId) onClose();
      return;
    }

    const hasRentalDatePair =
      quoteType === 'RENTAL' && Boolean(startDate.trim() && plannedEndDate.trim());
    const rentalDur = Math.floor(Number(rentalDurationDays));
    const hasRentalDuration = quoteType === 'RENTAL' && Number.isFinite(rentalDur) && rentalDur >= 1;

    const validationError = firstValidationError([
      validateRequired(String(selectedCustomerId || ''), 'Müşteri'),
      validateRequired(String(selectedAuthorizedContactId || ''), 'Merkez yetkili'),
      ...(quoteType === 'RENTAL' && !hasRentalDatePair && !hasRentalDuration
        ? [
            {
              valid: false as const,
              message:
                'Kiralama için kiralama süresi (en az 1 gün) veya başlangıç ve planlanan bitiş tarihlerini birlikte girin.',
            },
          ]
        : []),
      ...(quoteType === 'RENTAL' && hasRentalDatePair
        ? [
            validateDate(startDate, 'Başlangıç tarihi', true),
            validateDate(plannedEndDate, 'Planlanan bitiş tarihi', true),
          ]
        : []),
      ...(quoteType === 'RENTAL' && hasRentalDuration && !hasRentalDatePair
        ? [validateNumber(rentalDur, 'Kiralama süresi (gün)', { min: 1, max: 36500 })]
        : []),
      validateNumber(iskonto, 'İskonto', { min: 0, max: 100 }),
      validateNumber(vatRate, 'KDV', { min: 0, max: 100 }),
    ]);
    if (validationError) {
      toast.warning(validationError);
      return;
    }

    if (quoteType === 'RENTAL' && hasRentalDatePair) {
      const sd = new Date(startDate).getTime();
      const ped = new Date(plannedEndDate).getTime();
      if (!Number.isFinite(sd) || !Number.isFinite(ped) || ped <= sd) {
        toast.warning('Planlanan bitiş tarihi başlangıçtan sonra olmalıdır.');
        return;
      }
    }
    if (quoteItems.length === 0) {
      toast.warning('En az bir malzeme veya manuel kalem eklemelisiniz.');
      return;
    }
    if (selectedCustomerId && authorizedContacts.length === 0) {
      setAuthorizedContactError('Bu müşteri için yetkili tanımlı değil.');
      toast.warning('Bu müşteri için yetkili tanımlı değil.');
      return;
    }

    const siteValidationError = validateSiteSelection({
      sites,
      isNewSiteMode,
      selectedSiteId,
      newSiteName: newSiteForm.SiteName,
      siteRequired: quoteType === 'RENTAL' && sites.length > 0,
    });
    if (siteValidationError) {
      toast.warning(siteValidationError);
      return;
    }

    try {
      setIsBusy(true);
      const normalizeOptionalOverride = (raw: unknown): string | null => {
        const s = typeof raw === 'string' ? raw.trim() : '';
        return s ? s : null;
      };
      const details = quoteItems.map((item) => {
        if (item.kind === 'manual') {
          return {
            is_manual: true,
            Description: item.Description,
            Quantity: item.Quantity,
            DailyPrice: item.UnitPriceSnapshot,
          };
        }
        const base: Record<string, unknown> = {
          ItemId: item.ItemId,
          Quantity: item.Quantity,
          is_manual: false,
          // Kritik: Kullanıcı dokunmasa bile state'teki mevcut değeri payload'a koy.
          ItemNameOverride: normalizeOptionalOverride(item.ItemNameOverride),
          ItemCodeOverride: normalizeOptionalOverride(item.ItemCodeOverride),
        };
        if (quoteType === 'SALE') {
          if (item.OverrideUnitPrice != null && Number.isFinite(item.OverrideUnitPrice)) {
            base.OverrideUnitPrice = item.OverrideUnitPrice;
          }
        } else {
          if (item.OverrideMonthlyPrice != null && Number.isFinite(item.OverrideMonthlyPrice)) {
            base.OverrideMonthlyPrice = item.OverrideMonthlyPrice;
          }
        }
        return base;
      });

      const requestBody: Record<string, unknown> = {
        CustomerId: Number(selectedCustomerId),
        CustomerAuthorizedContactId: Number(selectedAuthorizedContactId),
        Subject: normalizeText(subject) ? normalizeText(subject) : null,
        Notes: normalizeText(notes) || undefined,
        Iskonto: iskonto,
        VatRate: vatRate,
        Currency: currency,
        Language: language,
        details,
      };
      if (quoteType === 'RENTAL') {
        const useDatePair = Boolean(startDate.trim() && plannedEndDate.trim());
        if (useDatePair) {
          requestBody.StartDate = new Date(startDate).toISOString();
          requestBody.PlannedEndDate = new Date(plannedEndDate).toISOString();
        } else {
          requestBody.RentalDurationDays = Math.max(1, Math.floor(Number(rentalDurationDays)) || 1);
        }
      }

      const siteFields = buildSiteRequestFields(isNewSiteMode, newSiteForm, selectedSiteId);
      Object.assign(requestBody, siteFields);
      if (normalizeText(quoteCode)) {
        requestBody.QuoteCode = normalizeText(quoteCode);
      }

        const existingId = persistedQuoteId ?? quote?.QuoteId ?? null;
        if (!existingId) {
        requestBody.Type = quoteType;
        requestBody.Status = QuoteStatus.Pending;
        const result = await quoteService.createAsync(requestBody as any);
        if (result.CreatedSiteId && selectedCustomerId) {
          await applyCreatedSiteId({
            customerId: Number(selectedCustomerId),
            createdSiteId: result.CreatedSiteId,
            setSites,
            setSelectedSiteId,
            resetNewSiteMode,
          });
        }
        toast.success(`Teklif başarıyla oluşturuldu! (ID: ${result.QuoteId})`);
        await onDataChanged?.();
        onClose();
        return;
        }

        const updateBody: Record<string, unknown> = {
          Status: forceStatus ?? status,
          Iskonto: iskonto,
          VatRate: vatRate,
          Currency: currency,
          Language: language,
          Subject: normalizeText(subject) ? normalizeText(subject) : null,
          Notes: normalizeText(notes) || undefined,
          // Kalem değişiklikleri (override fiyatlar dahil) PATCH ile de gitsin; aksi halde fiyat yeniden hesaplanmaz.
          details,
        };
        if (
          (quote as { CustomerAuthorizedContactId?: number | null } | null)?.CustomerAuthorizedContactId !==
          Number(selectedAuthorizedContactId)
        ) {
          updateBody.CustomerAuthorizedContactId = Number(selectedAuthorizedContactId);
        }
        if (quoteType === 'RENTAL') {
          const useUpdateDatePair = Boolean(startDate.trim() && plannedEndDate.trim());
          if (useUpdateDatePair) {
            updateBody.StartDate = new Date(startDate).toISOString();
            updateBody.PlannedEndDate = new Date(plannedEndDate).toISOString();
            const rd = Math.floor(Number(rentalDurationDays));
            if (Number.isFinite(rd) && rd >= 1) {
              updateBody.RentalDurationDays = rd;
            }
          } else {
            updateBody.RentalDurationDays = Math.max(1, Math.floor(Number(rentalDurationDays)) || 1);
          }
        }
        const originalSiteId = (quote as { SiteId?: number | null } | null)?.SiteId ?? null;
        const updateSiteFields = buildSiteRequestFields(isNewSiteMode, newSiteForm, selectedSiteId);
        if (isNewSiteMode) {
          if (updateSiteFields.newSite) {
            updateBody.newSite = updateSiteFields.newSite;
          }
        } else {
          const nextSiteId = selectedSiteId ? Number(selectedSiteId) : null;
          if (originalSiteId !== nextSiteId) {
            if (nextSiteId != null) updateBody.SiteId = nextSiteId;
          }
        }
        if (normalizeText(quoteCode)) {
          updateBody.QuoteCode = normalizeText(quoteCode);
        }
        if (status === QuoteStatus.Rejected) {
          const reason = rejectionReason.trim();
          if (reason.length < 3) {
            setRejectionReasonError('Red gerekçesi en az 3 karakter olmalıdır.');
            setIsBusy(false);
            return;
          }
          updateBody.rejectionReason = reason;
        }
        const updateResult = await quoteService.updateAsync(existingId, updateBody as any);
        if (updateResult.CreatedSiteId && selectedCustomerId) {
          await applyCreatedSiteId({
            customerId: Number(selectedCustomerId),
            createdSiteId: updateResult.CreatedSiteId,
            setSites,
            setSelectedSiteId,
            resetNewSiteMode,
          });
        }
        toast.success('Teklif başarıyla güncellendi!');
        await onDataChanged?.();
        onClose();
        return;
    } catch (error) {
      console.error('Save quote error:', error);
      const fieldErrors = getApiFieldErrors(error, [
        'CustomerAuthorizedContactId',
        'customerAuthorizedContactId',
        'StartDate',
        'startDate',
        'PlannedEndDate',
        'plannedEndDate',
        'RentalDurationDays',
        'rentalDurationDays',
      ]);
      const rawMessage = getApiErrorMessage(error);
      const normalizedMessage = rawMessage.toLowerCase();
      if (fieldErrors.CustomerAuthorizedContactId || fieldErrors.customerAuthorizedContactId) {
        const msg = fieldErrors.CustomerAuthorizedContactId ?? fieldErrors.customerAuthorizedContactId ?? '';
        setAuthorizedContactError(msg || 'Merkez yetkili alanı zorunludur.');
      }
      if (
        normalizedMessage.includes('customerauthorizedcontactid') ||
        (normalizedMessage.includes('yetkili') && normalizedMessage.includes('müşteri')) ||
        normalizedMessage.includes('bu müşteriye ait değil')
      ) {
        setAuthorizedContactError(
          normalizedMessage.includes('required')
            ? 'Merkez yetkili seçimi zorunludur.'
            : 'Seçilen merkez yetkili bu müşteriye ait değil.'
        );
      }
      toast.error(
        isSiteRelatedApiMessage(rawMessage)
          ? rawMessage
          : isArchivedInventoryApiError(error)
            ? getUserFacingApiErrorMessage(error, 'quote-save')
            : userMessageForCustomerRelatedApiError(error, rawMessage || 'Kaydetme hatası')
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteClick = () => {
    if (!activeQuote) return;
    if (converted) {
      toast.info('Teklifi silmek için önce bağlı sözleşmeyi iptal etmeniz gerekir. Sözleşme ekranı açılıyor…');
      void openConvertedContract();
      return;
    }
    if (!canDeleteQuote) {
      toast.error('Teklif silmek için yetkiniz bulunmuyor.');
      return;
    }
    setDeleteReason('');
    setDeleteReasonError(null);
    setShowDeleteReasonModal(true);
  };

  const handleDeleteReasonContinue = () => {
    const trimmed = deleteReason.trim();
    if (trimmed.length > 0 && trimmed.length < 3) {
      setDeleteReasonError('Gerekçe en az 3 karakter olmalıdır.');
      return;
    }
    setDeleteReasonError(null);
    setShowDeleteReasonModal(false);
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!activeQuote) return;
    try {
      setIsBusy(true);
      const trimmed = deleteReason.trim();
      await quoteService.deleteAsync(
        activeQuote.QuoteId,
        trimmed.length >= 3 ? { reason: trimmed } : undefined
      );
      setShowDeleteConfirm(false);
      setDeleteReason('');
      await onDataChanged?.();
      onClose();
    } catch (error) {
      console.error('Delete quote error:', error);
      setShowDeleteConfirm(false);
      if (isConvertedQuoteApiError(error)) {
        toast.error(getApiErrorMessage(error));
      } else {
        toast.error(getUserFacingApiErrorMessage(error, 'quote-delete'));
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleAccept = async () => {
    if (!activeQuote || converted) return;
    try {
      setIsBusy(true);
      await quoteService.acceptQuoteAsync(activeQuote.QuoteId);
      setStatus(QuoteStatus.Accepted);
      await onDataChanged?.();
      toast.success('Teklif kabul edildi.');
      onClose();
    } catch (error) {
      console.error('Accept quote error:', error);
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleRejectClick = () => {
    if (!activeQuote || converted) return;
    if (!canUpdateQuote) {
      toast.error('Bu işlem için yetkiniz yok.');
      return;
    }
    setRejectionReason('');
    setRejectionReasonError(null);
    setShowRejectReasonModal(true);
  };

  const handleRejectReasonContinue = () => {
    const reason = rejectionReason.trim();
    if (reason.length < 3) {
      setRejectionReasonError('Red gerekçesi en az 3 karakter olmalıdır.');
      return;
    }
    setRejectionReasonError(null);
    setShowRejectReasonModal(false);
    setShowRejectConfirm(true);
  };

  const handleRejectConfirm = async () => {
    if (!activeQuote || converted) return;
    const reason = rejectionReason.trim();
    if (reason.length < 3) return;
    try {
      setIsBusy(true);
      await quoteService.rejectQuoteAsync(activeQuote.QuoteId, reason);
      setStatus(QuoteStatus.Rejected);
      setShowRejectConfirm(false);
      await onDataChanged?.();
      toast.success('Teklif reddedildi.');
      onClose();
    } catch (error) {
      console.error('Reject quote error:', error);
      setShowRejectConfirm(false);
      toast.error(getUserFacingApiErrorMessage(error, 'quote-reject'));
    } finally {
      setIsBusy(false);
    }
  };

  const getConvertStockForWarehouse = (itemId: number, warehouseId: number): number | null => {
    const stocks = convertItemStocks[itemId];
    if (!stocks) return null;
    const entry = stocks.find((s) => s.WarehouseId === warehouseId);
    return entry?.Quantity ?? 0;
  };

  const formatWarehouseOptionLabel = (wh: Warehouse, itemId?: number) => {
    if (!itemId) return wh.WarehouseName;
    const qty = getConvertStockForWarehouse(itemId, wh.WarehouseId);
    if (qty == null) return wh.WarehouseName;
    return `${wh.WarehouseName} (${qty} adet)`;
  };

  useEffect(() => {
    if (!showConvertModal) return;
    const invItems = quoteItems.filter((i) => i.kind === 'inventory');
    if (invItems.length === 0) return;

    let cancelled = false;
    setConvertStocksLoading(true);
    void (async () => {
      const next: Record<number, { WarehouseId: number; Quantity: number; WarehouseName?: string }[]> = {};
      await Promise.all(
        invItems.map(async (item) => {
          try {
            const stocks = await inventoryService.getWarehousesByItemAsync(item.ItemId);
            if (cancelled) return;
            next[item.ItemId] = stocks.map((s) => ({
              WarehouseId: s.WarehouseId,
              Quantity: s.Quantity,
              WarehouseName:
                warehouses.find((w) => w.WarehouseId === s.WarehouseId)?.WarehouseName,
            }));
          } catch {
            if (!cancelled) next[item.ItemId] = [];
          }
        })
      );
      if (!cancelled) {
        setConvertItemStocks(next);
        setConvertStocksLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [showConvertModal, quoteItems, warehouses]);

  const handleReduceConvertQuantity = (available: number) => {
    const itemName = extractFirstQuotedName(convertModalError ?? '');
    if (!itemName || convertMode !== 'perItem') return;

    const item = quoteItems.find(
      (i) =>
        i.kind === 'inventory' &&
        (i.ItemName === itemName ||
          formatInventoryLineBilingualLabel(i.ItemName, i.ItemNameEn, i.Item).includes(itemName))
    );
    if (!item || item.kind !== 'inventory') return;

    const itemId = item.ItemId;
    setPerItemAssignments((prev) => {
      const assignments = [...(prev[itemId] ?? [])];
      if (assignments.length === 0) return prev;
      assignments[0] = {
        ...assignments[0],
        Quantity: Math.max(1, Math.min(assignments[0].Quantity, available)),
      };
      return { ...prev, [itemId]: assignments };
    });
    setConvertModalError(null);
  };

  const openConvertModal = () => {
    if (!activeQuote || status !== QuoteStatus.Accepted || converted) return;
    setConvertModalError(null);
    setConvertMode('defaultWarehouse');
    setDefaultWarehouseIdForConvert(warehouses[0]?.WarehouseId ?? '');
    setShowConvertModal(true);
    setPerItemAssignments({});
    setConvertItemStocks({});
    setDecrementStock(quoteType === 'RENTAL' ? true : null);
    if (resolveContractQuoteType(activeQuote) === 'RENTAL') {
      const qs = activeQuote.StartDate != null && String(activeQuote.StartDate).trim()
        ? String(activeQuote.StartDate).split('T')[0]
        : '';
      const qe =
        activeQuote.PlannedEndDate != null && String(activeQuote.PlannedEndDate).trim()
          ? String(activeQuote.PlannedEndDate).split('T')[0]
          : '';
      setConvertContractStartDate(qs);
      setConvertContractEndDate(qe);
    } else {
      setConvertContractStartDate('');
      setConvertContractEndDate('');
    }
  };

  const addWarehouseAssignment = (itemId: number) => {
    const current = perItemAssignments[itemId] ?? [];
    setPerItemAssignments({
      ...perItemAssignments,
      [itemId]: [...current, { WarehouseId: warehouses[0]?.WarehouseId ?? 0, Quantity: 1 }],
    });
  };

  const updateWarehouseAssignment = (
    itemId: number,
    index: number,
    field: 'WarehouseId' | 'Quantity',
    value: number
  ) => {
    const current = [...(perItemAssignments[itemId] ?? [])];
    current[index] = { ...current[index], [field]: value };
    setPerItemAssignments({ ...perItemAssignments, [itemId]: current });
  };

  const removeWarehouseAssignment = (itemId: number, index: number) => {
    const current = (perItemAssignments[itemId] ?? []).filter((_, i) => i !== index);
    if (current.length === 0) {
      const { [itemId]: _, ...rest } = perItemAssignments;
      setPerItemAssignments(rest);
    } else {
      setPerItemAssignments({ ...perItemAssignments, [itemId]: current });
    }
  };

  const getAssignmentTotalForItem = (itemId: number) =>
    (perItemAssignments[itemId] ?? []).reduce((sum, a) => sum + a.Quantity, 0);

  const handleConvertToContract = async () => {
    if (!activeQuote) return;

    setConvertModalError(null);

    if (status !== QuoteStatus.Accepted) {
      toast.warning('Sadece kabul edilmiş teklifler sözleşmeye dönüştürülebilir.');
      return;
    }

    if (converted) {
      toast.warning('Bu teklif aktif bir sözleşmeye bağlı. Önce sözleşmeyi iptal edin veya (satış ise) teklife geri alın.');
      return;
    }
    if (quoteType === 'SALE' && decrementStock == null) {
      setConvertModalError('Lütfen stok düşüm seçimini yapın.');
      return;
    }

    const effectiveDecrementStock = quoteType === 'RENTAL' ? true : decrementStock === true;

    const hasInventoryInQuote = quoteItems.some((i) => i.kind === 'inventory');

    if (convertMode === 'perItem' && !hasInventoryInQuote) {
      setConvertModalError('Bu teklifte envanter kalemi yok. Varsayılan depo seçeneğini kullanın.');
      return;
    }

    if (convertMode === 'defaultWarehouse' && !defaultWarehouseIdForConvert) {
      if (warehouses.length === 0) {
        setConvertModalError('Sözleşmeye dönüştürmek için önce en az bir depo tanımlanmalı.');
      } else {
        setConvertModalError('Sözleşmeye dönüştürmek için bir depo seçmelisiniz (varsayılan depo).');
      }
      return;
    }

    if (quoteType === 'RENTAL') {
      if (!convertContractStartDate.trim() || !convertContractEndDate.trim()) {
        setConvertModalError(
          'Kiralama sözleşmesine dönüşüm için sözleşme başlangıcı ve planlanan bitiş tarihlerini girin.'
        );
        return;
      }
      const cs = new Date(convertContractStartDate).getTime();
      const ce = new Date(convertContractEndDate).getTime();
      if (!Number.isFinite(cs) || !Number.isFinite(ce) || ce <= cs) {
        setConvertModalError('Planlanan bitiş tarihi başlangıçtan sonra olmalıdır.');
        return;
      }
    }

    let options: { warehouseAssignments: WarehouseAssignment[] } | { defaultWarehouseId: number };

    if (convertMode === 'defaultWarehouse' && defaultWarehouseIdForConvert) {
      options = { defaultWarehouseId: Number(defaultWarehouseIdForConvert) };
    } else {
      const assignments: WarehouseAssignment[] = [];
      for (const item of quoteItems) {
        if (item.kind !== 'inventory') continue;
        const itemAssignments = perItemAssignments[item.ItemId] ?? [];
        const total = itemAssignments.reduce((s, a) => s + a.Quantity, 0);
        if (total !== item.Quantity) {
          setConvertModalError(
            `"${formatInventoryLineBilingualLabel(item.ItemName, item.ItemNameEn, item.Item)}" için atanan toplam miktar (${total}) teklif miktarı (${item.Quantity}) ile eşleşmiyor.`
          );
          return;
        }
        for (const a of itemAssignments) {
          if (a.Quantity > 0) {
            assignments.push({ ItemId: item.ItemId, WarehouseId: a.WarehouseId, Quantity: a.Quantity });
          }
        }
      }
      if (assignments.length === 0) {
        setConvertModalError(
          'Ürün bazlı modda her envanter kalemi için depo ve miktar ataması yapın; toplamlar teklif miktarlarıyla eşleşmeli.'
        );
        return;
      }
      options = { warehouseAssignments: assignments };
    }

    try {
      setIsBusy(true);
      const result = await quoteService.convertToContractAsync(activeQuote.QuoteId, {
        ...options,
        decrementStock: effectiveDecrementStock,
        ...(quoteType === 'RENTAL'
          ? {
              StartDate: new Date(convertContractStartDate).toISOString(),
              PlannedEndDate: new Date(convertContractEndDate).toISOString(),
            }
          : {}),
      });
      setConvertModalError(null);
      setShowConvertModal(false);
      if (result.warnings && result.warnings.length > 0) {
        toast.warning(result.warnings.join('\n'));
      }
      toast.success('Teklif sözleşmeye dönüştürüldü.');
      if (onConverted) {
        await onConverted(result.ContractId);
        return;
      }
      const updatedQuote = await quoteService.getByIdAsync(activeQuote.QuoteId);
      setFullQuote(updatedQuote);
      await onDataChanged?.();
      try {
        const c = await contractService.getByIdAsync(result.ContractId);
        setConvertedContract(c);
        setIsContractModalOpen(true);
      } catch (openError) {
        console.error('Open contract after convert error:', openError);
      }
    } catch (error: unknown) {
      console.error('Convert quote error:', error);
      const msg = getApiErrorMessage(error);
      const displayMsg = isStockErrorMessage(msg)
        ? msg || getUserFacingApiErrorMessage(error, 'quote-convert')
        : isArchivedInventoryApiError(error)
          ? getUserFacingApiErrorMessage(error, 'quote-convert')
          : userMessageForCustomerRelatedApiError(
              error,
              msg || 'Dönüştürme başarısız. Depolarda yeterli stok olduğundan emin olun veya farklı depo seçin.'
            );
      setConvertModalError(displayMsg);
    } finally {
      setIsBusy(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return formatMoney(amount, currency);
  };

  const handlePreviewDocument = async () => {
    if (!activeQuote || !selectedTemplateId) {
      toast.warning('Önizleme için bir şablon seçmelisiniz');
      return;
    }
    try {
      setIsBusy(true);
      const blob = await quoteService.previewDocumentAsync(activeQuote.QuoteId, Number(selectedTemplateId));
      if (blob.size === 0) {
        toast.error('Sunucu boş yanıt döndürdü (boyut: 0).');
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
      console.error('Preview document error:', error);
      toast.error(getApiErrorMessage(error) || 'Önizleme hatası');
    } finally {
      setIsBusy(false);
    }
  };

  const handleCloneQuoteClick = () => {
    if (!activeQuote?.QuoteId || isCloning || isBusy) return;
    setShowCloneConfirm(true);
  };

  const handleCloneQuoteConfirm = async () => {
    if (!activeQuote?.QuoteId || isCloning) return;
    try {
      setIsCloning(true);
      setIsBusy(true);
      const result = await quoteService.cloneQuoteAsync(activeQuote.QuoteId);
      const successMessage =
        (result.message && String(result.message).trim()) || 'Teklif kopyalandı.';
      toast.success(`${successMessage} (Yeni Teklif ID: ${result.QuoteId})`);
      setShowCloneConfirm(false);
      // Parent'a yeni teklifi bildir; verilmezse mevcut akışta listeyi yenile + kapat.
      if (onQuoteCloned) {
        onQuoteCloned(result);
      } else {
        await onDataChanged?.();
        onClose();
      }
    } catch (error) {
      console.error('Clone quote error:', error);
      toast.error(userMessageForCustomerRelatedApiError(error, getApiErrorMessage(error) || 'Teklif kopyalanamadı.'));
    } finally {
      setIsBusy(false);
      setIsCloning(false);
    }
  };

  const handleCloneQuoteCancel = () => {
    if (isCloning) return;
    setShowCloneConfirm(false);
  };

  const handleCreateFromPackage = async () => {
    const hasRentalDatePair =
      quoteType === 'RENTAL' && Boolean(startDate.trim() && plannedEndDate.trim());
    const rentalDurPkg = Math.floor(Number(rentalDurationDays));
    const hasRentalDurationPkg = quoteType === 'RENTAL' && Number.isFinite(rentalDurPkg) && rentalDurPkg >= 1;

    const validationError = firstValidationError([
      validateRequired(String(selectedPackageId || ''), 'Paket'),
      validateRequired(String(selectedCustomerId || ''), 'Müşteri'),
      ...(quoteType === 'RENTAL' && !hasRentalDatePair && !hasRentalDurationPkg
        ? [
            {
              valid: false as const,
              message:
                'Kiralama için kiralama süresi (en az 1 gün) veya başlangıç ve planlanan bitiş tarihlerini birlikte girin.',
            },
          ]
        : []),
      ...(quoteType === 'RENTAL' && hasRentalDatePair
        ? [validateDate(startDate, 'Başlangıç tarihi', true), validateDate(plannedEndDate, 'Planlanan bitiş tarihi', true)]
        : []),
      ...(quoteType === 'RENTAL' && hasRentalDurationPkg && !hasRentalDatePair
        ? [validateNumber(rentalDurPkg, 'Kiralama süresi (gün)', { min: 1, max: 36500 })]
        : []),
    ]);
    if (validationError) {
      toast.warning(validationError);
      return;
    }
    if (quoteType === 'RENTAL' && hasRentalDatePair) {
      const sd = new Date(startDate).getTime();
      const ped = new Date(plannedEndDate).getTime();
      if (!Number.isFinite(sd) || !Number.isFinite(ped) || ped <= sd) {
        toast.warning('Planlanan bitiş tarihi başlangıçtan sonra olmalıdır.');
        return;
      }
    }
    const siteValidationError = validateSiteSelection({
      sites,
      isNewSiteMode,
      selectedSiteId,
      newSiteName: newSiteForm.SiteName,
      siteRequired: quoteType === 'RENTAL' && sites.length > 0,
    });
    if (siteValidationError) {
      toast.warning(siteValidationError);
      return;
    }
    try {
      setIsBusy(true);
      const detail = await packageService.getByIdAsync(selectedPackageId);
      const packageItems = detail.items ?? detail.Items ?? [];

      if (packageItems.length === 0) {
        toast.warning('Seçili paket içinde ürün bulunamadı.');
        return;
      }

      const nextItems: QuoteLineItem[] = [];
      let missingCount = 0;

      for (const pkgItem of packageItems) {
        const rawId = pkgItem.ItemId ?? pkgItem.ProductId;
        const itemId = Number.parseInt(String(rawId ?? ''), 10);
        const quantity = Math.max(1, Number.parseInt(String(pkgItem.Quantity ?? 1), 10) || 1);

        if (!Number.isFinite(itemId) || itemId <= 0) {
          missingCount += 1;
          continue;
        }

        const inv = availableItems.find((i) => i.ItemId === itemId);
        if (!inv) {
          missingCount += 1;
          continue;
        }

        const dailyPrice = unitPriceForQuoteInventory(inv, currency, quoteType);

        const existing = nextItems.find((x) => x.kind === 'inventory' && x.ItemId === itemId);
        if (existing && existing.kind === 'inventory') {
          existing.Quantity += quantity;
        } else {
          nextItems.push({
            kind: 'inventory',
            QuoteDetailId: 0,
            ItemId: itemId,
            Quantity: quantity,
            UnitPriceSnapshot: dailyPrice,
            PriceUnit: (quoteType === 'SALE' ? 'EACH' : 'DAY') as 'EACH' | 'DAY',
            MonthlyPriceOverride: undefined,
            PriceSource: 'INVENTORY',
            OverrideUnitPrice: undefined,
            OverrideMonthlyPrice: undefined,
            Item: inv,
            ItemName: inv.ItemName,
            ItemCode: inv.ItemCode,
            ItemCodeOverride: null,
            ItemNameEn: inv.ItemNameEn ?? undefined,
          });
        }
      }

      if (nextItems.length === 0) {
        toast.error('Paketten aktarılabilecek geçerli ürün bulunamadı.');
        return;
      }

      setQuoteItems(nextItems);
      const packageDiscount = Number(detail.DefaultDiscount ?? 0) || 0;
      handleGlobalIskontoChange(Math.max(0, Math.min(100, packageDiscount)));

      const message =
        missingCount > 0
          ? `Paket uygulandı. ${missingCount} kalem envanterde bulunamadığı için atlandı.\nLütfen kontrol edip Kaydet'e basın.`
          : "Paket ürünleri eklendi. Lütfen kontrol edip Kaydet'e basın.";
      toast.info(message);
    } catch (error) {
      console.error('Apply package to quote form error:', error);
      toast.error(getUserFacingApiErrorMessage(error, 'package-save'));
    } finally {
      setIsBusy(false);
    }
  };

  const handleCreatePackageFromCurrentQuote = async () => {
    const inventoryItems = quoteItems.filter((i): i is Extract<QuoteLineItem, { kind: 'inventory' }> => i.kind === 'inventory');
    if (!normalizeText(newPackageName)) {
      toast.warning('Paket adı zorunludur.');
      return;
    }
    if (inventoryItems.length === 0) {
      toast.warning('Paket oluşturmak için teklifte en az bir envanter ürünü olmalıdır.');
      return;
    }
    try {
      setIsCreatingPackage(true);
      const response = await packageService.createAsync({
        packageName: normalizeText(newPackageName) as string,
        description: normalizeText(newPackageDescription) || undefined,
        defaultDiscount: Math.max(0, Math.min(100, Number(newPackageDiscount) || 0)),
        items: inventoryItems.map((item) => ({
          productId: item.ItemId,
          quantity: item.Quantity,
        })),
      });
      await loadPackages();
      const createdId = String((response as any).PackageId ?? (response as any).packageId ?? (response as any).id ?? '');
      if (createdId) {
        setSelectedPackageId(createdId);
      }
      setShowCreatePackageModal(false);
      setNewPackageName('');
      setNewPackageDescription('');
      setNewPackageDiscount(0);
      toast.success('Paket başarıyla oluşturuldu.');
    } catch (error) {
      console.error('Create package error:', error);
      toast.error(getUserFacingApiErrorMessage(error, 'package-save'));
    } finally {
      setIsCreatingPackage(false);
    }
  };

  const handleGenerateDocument = async (format: 'pdf' | 'docx' = 'pdf') => {
    if (!activeQuote || !selectedTemplateId) {
      toast.warning('Döküman oluşturmak için bir şablon seçmelisiniz');
      return;
    }
    try {
      setIsBusy(true);
      const blob = await quoteService.generateDocumentAsync(
        activeQuote.QuoteId,
        Number(selectedTemplateId),
        format
      );
      if (blob.size === 0) {
        toast.error('Belge oluşturulamadı (sunucu boş yanıt döndü).');
        return;
      }
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `teklif_${activeQuote.QuoteId}.${format}`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Generate document error:', error);
      toast.error(getApiErrorMessage(error) || 'Döküman oluşturma hatası');
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

  const getStatusBadge = () => {
    if (converted) {
      return (
        <span className="badge bg-indigo-800 text-indigo-100 text-[11px] px-2 py-0.5">
          Sözleşmeye dönüştü
        </span>
      );
    }
    switch (status) {
      case QuoteStatus.Draft:
        return <span className="badge bg-slate-700 text-slate-100 text-[11px] px-2 py-0.5">Taslak</span>;
      case QuoteStatus.Pending:
        return <span className="badge bg-yellow-700 text-yellow-100 text-[11px] px-2 py-0.5">Beklemede</span>;
      case QuoteStatus.Accepted:
        return <span className="badge bg-green-700 text-green-100 text-[11px] px-2 py-0.5">Kabul Edildi</span>;
      case QuoteStatus.Rejected:
        return <span className="badge bg-red-700 text-red-100 text-[11px] px-2 py-0.5">Reddedildi</span>;
      default:
        return null;
    }
  };

  const compactBtn = '!py-1.5 !px-3 text-xs';
  const fieldLabel = 'block text-[11px] font-medium text-text-secondary mb-0.5';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background-main overflow-hidden">
      <header className="shrink-0 flex items-center justify-between px-3 py-2 bg-background-panel border-b border-background-border">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-base font-semibold text-text-primary tracking-tight truncate">
            {isNew ? 'Yeni Teklif' : 'Teklif Detayı'}
          </h1>
          <span className="text-xs font-medium text-text-secondary whitespace-nowrap">
            {quoteType === 'SALE' ? 'Satış' : 'Kiralama'}
          </span>
          {!isNew && getStatusBadge()}
          {isClonedDraft && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-200"
              title="Bu teklif başka bir tekliften kopyalandı. Kaydedip kullanıcıya paylaşmadan önce gerekli alanları (teklif kodu, tarihler, fiyatlar) gözden geçirin."
            >
              <CopySimpleIcon size={12} weight="bold" aria-hidden />
              Kopya
            </span>
          )}
          <span className="hidden md:inline text-[11px] text-text-secondary truncate">
            {currentUser?.fullName || currentUser?.username || ''}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isNew && activeQuote?.QuoteId && (
            <button
              type="button"
              onClick={handleCloneQuoteClick}
              disabled={isBusy || isCloning}
              title="Bu teklifi yeni bir taslak teklif olarak kopyala"
              aria-label="Teklifi Kopyala"
              className="inline-flex items-center gap-1.5 rounded-lg border border-background-border px-2.5 py-1 text-xs font-medium text-text-primary hover:bg-background-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <CopySimpleIcon size={14} weight="regular" aria-hidden />
              {isCloning ? 'Kopyalanıyor...' : 'Kopyala'}
            </button>
          )}
          <button
            type="button"
            onClick={() => void requestClose()}
            className="p-1.5 rounded-lg text-text-secondary hover:bg-background-hover hover:text-text-primary transition-colors"
            aria-label="Kapat"
          >
            <XIcon size={20} weight="regular" />
          </button>
        </div>
      </header>

      {converted && (
        <div className="shrink-0 flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 bg-indigo-950/40 border-b border-indigo-700/50 text-xs text-indigo-100">
          <span className="font-semibold">Sözleşmeye dönüştürülmüş</span>
          <span className="text-indigo-100/80">
            İşlemler sözleşmede yürür. Salt okunur kayıt.
            {activeQuote?.ConvertedAt ? ` · ${formatShortDateTime(activeQuote.ConvertedAt)}` : ''}
          </span>
          {!canCancelContract && (
            <span className="text-amber-200">Sözleşme iptal yetkisi yok.</span>
          )}
          <button
            type="button"
            onClick={openConvertedContract}
            disabled={isBusy || isOpeningConvertedContract}
            className={`btn-primary ml-auto ${compactBtn}`}
          >
            {isOpeningConvertedContract ? 'Açılıyor...' : 'Sözleşmeye git'}
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col p-2 gap-2">
          {/* Üst: müşteri → ayarlar (sayfa kaydırması yok) */}
          <section className="shrink-0 rounded-lg border border-background-border bg-background-panel px-3 py-2">
            <div className={`grid gap-x-2.5 gap-y-1.5 ${selectedCustomerId ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-2'}`}>
              <div className="min-w-0">
                <label className={fieldLabel} htmlFor="quote-customer-search">
                  Müşteri *
                </label>
                <div className="flex items-center gap-1 min-w-0">
                  <div className="flex-1 min-w-0">
                    <CustomerSearchField
                      key={`${quote?.QuoteId ?? 'new'}-${isNew}-${selectedCustomerId || 'none'}`}
                      id="quote-customer-search"
                      customers={customers}
                      value={selectedCustomerId}
                      onChange={handleCustomerChange}
                      disabled={isReadOnly}
                    />
                  </div>
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => setShowCreateCustomerModal(true)}
                      className="btn-secondary !py-1 !px-1.5 flex-shrink-0"
                      title="Yeni müşteri ekle"
                    >
                      <Plus size={16} weight="bold" />
                    </button>
                  )}
                </div>
              </div>

              {selectedCustomerId && (
                <div className="min-w-0 overflow-hidden">
                  <label className={fieldLabel}>
                    Merkez Yetkili *
                  </label>
                  <div className="flex items-center gap-1 min-w-0">
                    {authorizedContactsLoading ? (
                      <div className="input w-full min-w-0 text-text-secondary text-sm py-1.5">Yükleniyor...</div>
                    ) : authorizedContacts.length > 0 ? (
                      <select
                        value={selectedAuthorizedContactId}
                        onChange={(e) => {
                          setSelectedAuthorizedContactId(Number(e.target.value) || '');
                          setAuthorizedContactError(null);
                        }}
                        disabled={isReadOnly}
                        className="input min-w-0 flex-1 text-sm py-1.5"
                      >
                        <option value="">Yetkili seçin</option>
                        {authorizedContacts.map((contact) => (
                          <option
                            key={contact.CustomerAuthorizedContactId}
                            value={contact.CustomerAuthorizedContactId}
                          >
                            {formatAuthorizedContactLabel(contact)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="input min-w-0 flex-1 text-red-300 bg-background-secondary text-sm py-1.5 truncate">
                        Bu müşteri için yetkili tanımlı değil
                      </div>
                    )}
                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={() => setShowCreateContactModal(true)}
                        className="btn-secondary !py-1 !px-1.5 flex-shrink-0"
                        title="Merkez Yetkilisi Ekle"
                      >
                        <Plus size={16} weight="bold" />
                      </button>
                    )}
                  </div>
                  {authorizedContactError && (
                    <p className="text-xs text-red-300 truncate">{authorizedContactError}</p>
                  )}
                </div>
              )}

              {selectedCustomerId && (
                <div className="min-w-0 overflow-hidden">
                  <SiteSelectField
                    sites={sites}
                    sitesLoading={sitesLoading}
                    selectedSiteId={selectedSiteId}
                    onSelectSite={handleSiteSelect}
                    onRequestNewSite={handleRequestNewSite}
                    required={quoteType === 'RENTAL' && sites.length > 0}
                    disabled={isReadOnly}
                    label="Şantiye"
                  />
                </div>
              )}
            </div>

            <div className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-1.5">
              <div className="min-w-[180px] flex-[1.3]">
                <div className="flex items-center justify-between gap-1">
                  <label className={fieldLabel}>Konu</label>
                  <span className={`text-[10px] ${subject.length > 255 ? 'text-red-300' : 'text-text-secondary'}`}>
                    {Math.min(subject.length, 255)}/255
                  </span>
                </div>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value.slice(0, 255))}
                  disabled={isReadOnly}
                  className="input w-full text-sm py-1.5"
                  placeholder="Teklif konusu"
                  maxLength={255}
                />
              </div>

              <div className="min-w-[120px] w-[150px]">
                <label className={fieldLabel}>Teklif Kodu</label>
                <input
                  type="text"
                  value={quoteCode}
                  onChange={(e) => setQuoteCode(e.target.value)}
                  disabled={isReadOnly}
                  className="input w-full text-sm py-1.5"
                  placeholder="Örn: TK-2026-001"
                  maxLength={50}
                />
              </div>

              <div className="min-w-[120px] w-[140px]">
                <label className={fieldLabel}>Teklif Tipi</label>
                {isNew ? (
                  lockNewQuoteType ? (
                    <div className="input w-full bg-background-secondary text-text-secondary text-sm py-1.5 px-2 rounded-lg border border-background-border">
                      {quoteType === 'SALE' ? 'Satış' : 'Kiralama'}
                    </div>
                  ) : (
                    <select
                      value={quoteType}
                      onChange={(e) => setQuoteType(e.target.value as ContractQuoteType)}
                      className="input w-full text-sm py-1.5"
                    >
                      <option value="RENTAL">Kiralama</option>
                      <option value="SALE">Satış</option>
                    </select>
                  )
                ) : (
                  <div className="input w-full bg-background-secondary text-text-secondary text-sm py-1.5 px-2 rounded-lg border border-background-border">
                    {quoteType === 'SALE' ? 'Satış' : 'Kiralama'}
                  </div>
                )}
              </div>

              {quoteType === 'RENTAL' && (
                <div className="min-w-[110px] w-[130px]">
                  <label className={fieldLabel}>Süre (gün) *</label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={rentalDurationDays}
                    onChange={(e) => {
                      const v = Math.floor(Number(e.target.value));
                      setRentalDurationDays(Number.isFinite(v) && v >= 1 ? v : 1);
                    }}
                    disabled={isReadOnly}
                    className="input w-full text-sm py-1.5"
                    title="Fiyatlandırma en az 30 gün üzerinden hesaplanır. PDF'de tarih yoksa 'Belirlenecek' görünebilir."
                  />
                </div>
              )}

              <div className="min-w-[72px] w-[88px]">
                <label className={fieldLabel} title="Tüm satırlara uygulanır; tabloda satır bazlı değiştirebilirsiniz">İskonto %</label>
                <input
                  type="number"
                  value={Number(iskonto) || 0}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    handleGlobalIskontoChange(Number.isFinite(v) ? v : 0);
                  }}
                  disabled={isReadOnly}
                  min={0}
                  max={100}
                  step={0.01}
                  className="input w-full text-sm py-1.5"
                  placeholder="0"
                  title="Tüm satırlara uygulanır; tabloda satır bazlı değiştirebilirsiniz"
                />
              </div>

              <div className="min-w-[72px] w-[88px]">
                <label className={fieldLabel}>KDV %</label>
                <input
                  type="number"
                  value={vatRate}
                  onChange={(e) => setVatRate(parseFloat(e.target.value) || 0)}
                  disabled={isReadOnly}
                  min={0}
                  max={100}
                  step={1}
                  className="input w-full text-sm py-1.5"
                  placeholder="20"
                />
              </div>

              <div className="min-w-[110px] w-[130px]">
                <label className={fieldLabel}>Para Birimi</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as 'TRY' | 'EUR' | 'USD')}
                  disabled={isReadOnly}
                  className="input w-full text-sm py-1.5"
                >
                  <option value="TRY">TRY (TL)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="USD">USD ($)</option>
                </select>
              </div>

              <div className="min-w-[100px] w-[120px]">
                <label className={fieldLabel}>Dil</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as 'TR' | 'EN')}
                  disabled={isReadOnly}
                  className="input w-full text-sm py-1.5"
                >
                  <option value="TR">Türkçe</option>
                  <option value="EN">English</option>
                </select>
              </div>

              {!isNew && !isQuoteDraftStatus(status) && (
                <div className="min-w-[130px] w-[150px]">
                  <label className={fieldLabel}>Durum</label>
                  <select
                    value={status}
                    onChange={(e) => {
                      setStatus(e.target.value as QuoteStatus);
                      if (e.target.value !== QuoteStatus.Rejected) {
                        setRejectionReasonError(null);
                      }
                    }}
                    disabled={isReadOnly || converted}
                    className="input w-full text-sm py-1.5"
                  >
                    <option value={QuoteStatus.Accepted}>Kabul Edildi</option>
                    <option value={QuoteStatus.Rejected}>Reddedildi</option>
                  </select>
                </div>
              )}

              <div className="min-w-[220px] flex-[1.3]">
                <label className={fieldLabel}>Şablon</label>
                <div className="flex gap-1">
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(Number(e.target.value) || '')}
                    className="input w-full text-sm py-1.5"
                  >
                    <option value="">Şablon seçin</option>
                    {templates.map((t) => (
                      <option key={t.TemplateId} value={t.TemplateId}>
                        {t.TemplateName} {t.IsDefault ? '(Varsayılan)' : ''}
                      </option>
                    ))}
                  </select>
                  {!isReadOnly && selectedTemplateId && (
                    <button
                      type="button"
                      onClick={async () => {
                        const template = templates.find((t) => t.TemplateId === Number(selectedTemplateId));
                        if (!template) return;
                        try {
                          setLoadingTemplate(true);
                          const fullTemplate = await quoteTemplateService.getByIdAsync(template.TemplateId);
                          setEditingTemplate(fullTemplate);
                          setIsNewTemplate(false);
                          setIsTemplateEditorOpen(true);
                        } catch (error) {
                          console.error('Şablon yükleme hatası:', error);
                          toast.error(getApiErrorMessage(error));
                        } finally {
                          setLoadingTemplate(false);
                        }
                      }}
                      disabled={loadingTemplate}
                      className={`btn-secondary shrink-0 ${compactBtn}`}
                    >
                      {loadingTemplate ? '...' : 'Düzenle'}
                    </button>
                  )}
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTemplate(null);
                        setIsNewTemplate(true);
                        setIsTemplateEditorOpen(true);
                      }}
                      className={`btn-secondary shrink-0 ${compactBtn}`}
                    >
                      Yeni
                    </button>
                  )}
                </div>
              </div>
              {isNew && !isReadOnly && (
                <div className="min-w-[220px] flex-[1.3]">
                  <label className={fieldLabel}>Hazır Paket</label>
                  {packagesLoadError && (
                    <div className="text-[10px] text-red-300">
                      Paketler yüklenemedi: {packagesLoadError}
                    </div>
                  )}
                  <div className="flex gap-1">
                    <select
                      value={selectedPackageId}
                      onChange={(e) => setSelectedPackageId(e.target.value)}
                      className="input w-full text-sm py-1.5"
                    >
                      <option value="">Paket seçin</option>
                      {packages.map((p) => (
                        <option key={p.PackageId} value={p.PackageId}>
                          {p.PackageName || `Paket #${p.PackageId}`}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleCreateFromPackage}
                      disabled={isBusy || !selectedPackageId}
                      className={`btn-secondary shrink-0 ${compactBtn}`}
                    >
                      Uygula
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCreatePackageModal(true)}
                      disabled={isBusy}
                      className={`btn-secondary shrink-0 ${compactBtn}`}
                    >
                      Yeni
                    </button>
                  </div>
                </div>
              )}

              <div className="min-w-[200px] flex-[1.4]">
                <label className={fieldLabel}>Notlar</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={isReadOnly}
                  className="input w-full text-sm py-1.5"
                  placeholder="Teklif notu..."
                />
              </div>

              {!isNew && status === QuoteStatus.Rejected && (
                <div className="w-full min-w-0">
                  <label className={fieldLabel}>
                    Red Gerekçesi {isReadOnly ? '' : '*'}
                  </label>
                  {isReadOnly ? (
                    <div className="input w-full bg-background-secondary text-text-primary text-sm py-1.5 px-2 rounded-lg border border-background-border">
                      {rejectionReason.trim() || activeQuote?.RejectionReason?.trim() || '—'}
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={rejectionReason}
                        onChange={(e) => {
                          setRejectionReason(e.target.value);
                          setRejectionReasonError(null);
                        }}
                        className="input w-full text-sm py-1.5"
                        placeholder="Red gerekçesini yazın (en az 3 karakter)"
                      />
                      {rejectionReasonError && (
                        <p className="text-xs text-red-300">{rejectionReasonError}</p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Orta: kalemler — yalnızca tablo kayar */}
          <section className="rounded-lg border border-background-border bg-background-panel flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 border-b border-background-border">
              <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                Teklif Kalemleri
                {quoteItems.length > 0 && (
                  <span className="ml-1.5 font-normal normal-case tracking-normal text-text-secondary/80">
                    ({quoteItems.length})
                  </span>
                )}
              </h3>
              <div className="flex flex-wrap items-center gap-1.5">
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => void openProductPicker()}
                    className={`btn-secondary ${compactBtn}`}
                  >
                    Ürün Ekle
                  </button>
                )}
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => setShowManualLineModal(true)}
                    className={`btn-secondary ${compactBtn}`}
                  >
                    Manuel Kalem
                  </button>
                )}
                {!isReadOnly && selectedTemplateId && quoteItems.length > 0 && (
                  <button
                    type="button"
                    onClick={async () => {
                      const template = templates.find((t) => t.TemplateId === Number(selectedTemplateId));
                      if (!template) return;
                      try {
                        setIsAddingMaterialTable(true);
                        const fullTemplate = await quoteTemplateService.getByIdAsync(template.TemplateId);
                        const content = JSON.parse(JSON.stringify(fullTemplate.Content || { type: 'doc', content: [] }));
                        if (!content.content) content.content = [];
                        const hasPlaceholder = JSON.stringify(content).includes('{{malzemeTablosu}}');
                        if (hasPlaceholder) {
                          toast.warning("Bu şablonda zaten malzeme tablosu placeholder'ı mevcut.");
                          return;
                        }
                        const placeholderNode = {
                          type: 'paragraph',
                          content: [{ type: 'text', text: '{{malzemeTablosu}}' }],
                        };
                        content.content.push(placeholderNode);
                        await quoteTemplateService.updateAsync(template.TemplateId, { Content: content });
                        await loadTemplates();
                        toast.success('Malzeme tablosu şablona eklendi!');
                      } catch (error) {
                        console.error('Add material table error:', error);
                        toast.error(getApiErrorMessage(error));
                      } finally {
                        setIsAddingMaterialTable(false);
                      }
                    }}
                    disabled={isAddingMaterialTable}
                    className={`btn-secondary ${compactBtn}`}
                    title="Seçili şablona malzeme tablosu yer tutucusu ekler"
                  >
                    <ClipboardIcon size={14} weight="regular" className="inline mr-1" aria-hidden />
                    {isAddingMaterialTable ? 'Ekleniyor...' : 'Şablona Tablo'}
                  </button>
                )}
                {!isNew && activeQuote && selectedTemplateId && (
                  <>
                    <button type="button" onClick={handlePreviewDocument} disabled={isBusy} className={`btn-primary ${compactBtn}`}>
                      {isBusy ? 'Yükleniyor...' : 'Önizle'}
                    </button>
                    <button type="button" onClick={() => handleGenerateDocument('pdf')} disabled={isBusy} className={`btn-secondary ${compactBtn}`}>
                      PDF
                    </button>
                    <button type="button" onClick={() => handleGenerateDocument('docx')} disabled={isBusy} className={`btn-secondary ${compactBtn}`}>
                      Word
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="overflow-auto flex-1 min-h-0">
              <table className="w-full text-sm border-collapse text-text-primary">
                <thead className="sticky top-0 bg-background-surface z-10 border-b border-background-border">
                  <tr>
                    <th className="text-left px-3 py-1.5 font-semibold text-text-secondary whitespace-nowrap text-xs">
                      Ürün Kodu
                    </th>
                    <th className="text-left px-3 py-1.5 font-semibold text-text-secondary text-xs">
                      Ürün Adı
                    </th>
                    <th className="text-right px-3 py-1.5 font-semibold text-text-secondary w-24 text-xs">
                      Miktar
                    </th>
                    <th className="text-right px-3 py-1.5 font-semibold text-text-secondary whitespace-nowrap text-xs">
                      {quoteType === 'SALE' ? 'Birim Fiyat' : 'Aylık Fiyat'}
                    </th>
                    <th className="text-right px-3 py-1.5 font-semibold text-text-secondary w-20 text-xs">
                      İskonto (%)
                    </th>
                    <th className="text-right px-3 py-1.5 font-semibold text-text-secondary whitespace-nowrap text-xs">
                      Toplam
                    </th>
                    <th className="text-center px-2 py-1.5 font-semibold text-text-secondary w-16 text-xs">
                      İşlem
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {quoteItems.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-3 py-6 text-center text-sm text-text-secondary"
                      >
                        Henüz kalem yok. Yukarıdaki Ürün Ekle veya Manuel Kalem ile ekleyin.
                      </td>
                    </tr>
                  ) : (
                    quoteItems.map((item, rowIndex) => {
                      const invItem = item.kind === 'inventory' ? availableItems.find((i) => i.ItemId === item.ItemId) : null;
                      const originalItemCode = invItem?.ItemCode ?? '';
                      const displayItemCode =
                        item.kind === 'inventory'
                          ? (item.ItemCode ?? item.ItemCodeOverride ?? originalItemCode) || '—'
                          : '—';
                      const hasCodeOverride =
                        item.kind === 'inventory' &&
                        item.ItemCodeOverride != null &&
                        String(item.ItemCodeOverride).trim() !== '';
                      const itemEnName = invItem?.ItemNameEn;
                      const canonicalItemName =
                        invItem?.ItemName ?? (item.kind === 'inventory' ? item.ItemName : '');
                      const lineTotal = getLineTotal(item);
                      const justAdded =
                        item.kind === 'inventory' ? lastAddedItemIds.includes(item.ItemId) : false;
                      const isRowActive = activeQuoteGridCell?.row === rowIndex;
                      return (
                        <tr
                          key={item.kind === 'inventory' ? `inv-${item.ItemId}` : `man-${item.ClientId}`}
                          className={`border-b border-background-border bg-background-surface hover:bg-background-hover transition-colors duration-300 ${
                            justAdded ? 'bg-green-500/20' : ''
                          } ${isRowActive ? 'ring-2 ring-inset ring-primary/60 bg-primary/15' : ''}`}
                        >
                          <td className="px-3 py-1 text-text-secondary">
                            {item.kind === 'inventory' ? (
                              isReadOnly ? (
                                <span className="inline-flex items-center gap-1.5 flex-wrap">
                                  <span className="font-mono">{displayItemCode}</span>
                                  {hasCodeOverride && (
                                    <span
                                      className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300"
                                      title="Bu belge için özel ürün kodu tanımlı"
                                    >
                                      Özel kod
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <div className="flex items-center gap-2 min-w-[160px]">
                                  <input
                                    type="text"
                                    value={item.ItemCodeOverride ?? originalItemCode}
                                    onChange={(e) => {
                                      const v = e.target.value.slice(0, 50);
                                      setQuoteItems((prev) =>
                                        prev.map((x) =>
                                          x.kind === 'inventory' && x.ItemId === item.ItemId
                                            ? { ...x, ItemCodeOverride: v }
                                            : x
                                        )
                                      );
                                    }}
                                    className="input w-full py-1 text-sm font-mono"
                                    aria-label="Ürün Kodu Override"
                                    placeholder="Boş bırakılırsa orijinal ürün kodu kullanılır"
                                    maxLength={50}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setQuoteItems((prev) =>
                                        prev.map((x) =>
                                          x.kind === 'inventory' && x.ItemId === item.ItemId
                                            ? { ...x, ItemCodeOverride: null }
                                            : x
                                        )
                                      );
                                    }}
                                    className="btn-secondary !py-0.5 !px-2 text-xs whitespace-nowrap"
                                    disabled={isBusy}
                                    title="Varsayılana dön"
                                  >
                                    Reset
                                  </button>
                                </div>
                              )
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-3 py-1 font-medium">
                            {item.kind === 'inventory' ? (
                              isReadOnly ? (
                                language === 'EN' ? (
                                  itemEnName ? (
                                    item.ItemNameOverride ?? itemEnName
                                  ) : (
                                    <span>
                                      {item.ItemNameOverride ?? canonicalItemName}{' '}
                                      <span className="text-yellow-500 text-xs">(Bu ürünün İngilizce adı yoktur)</span>
                                    </span>
                                  )
                                ) : (
                                  item.ItemNameOverride ?? canonicalItemName
                                )
                              ) : (
                                <div className="flex items-center gap-2 min-w-[280px]">
                                  <div className="flex-1 relative">
                                    <input
                                      type="text"
                                      value={
                                        item.ItemNameOverride ??
                                        (language === 'EN'
                                          ? itemEnName || canonicalItemName
                                          : canonicalItemName)
                                      }
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        setQuoteItems((prev) =>
                                          prev.map((x) =>
                                            x.kind === 'inventory' && x.ItemId === item.ItemId
                                              ? { ...x, ItemNameOverride: v }
                                              : x
                                          )
                                        );
                                      }}
                                      className="input w-full py-1 text-sm"
                                      aria-label="Ürün Adı"
                                      placeholder={canonicalItemName}
                                    />
                                    {language === 'EN' && !itemEnName && (
                                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-yellow-500 text-xs pointer-events-none">
                                        (İngilizce adı yoktur)
                                      </span>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setQuoteItems((prev) =>
                                        prev.map((x) =>
                                          x.kind === 'inventory' && x.ItemId === item.ItemId
                                            ? { ...x, ItemNameOverride: null }
                                            : x
                                        )
                                      );
                                    }}
                                    className="btn-secondary !py-0.5 !px-2 text-xs whitespace-nowrap"
                                    disabled={isBusy}
                                    title="Varsayılana dön"
                                  >
                                    Reset
                                  </button>
                                </div>
                              )
                            ) : (
                              item.Description
                            )}
                          </td>
                          <td className="px-3 py-1 text-right">
                            {isReadOnly ? (
                              item.Quantity
                            ) : (
                              <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9.]*"
                                value={item.Quantity === 0 ? '' : formatThousandsTR(String(item.Quantity))}
                                ref={(el) => {
                                  const key = `${rowIndex}-2`;
                                  if (el) quoteGridRefs.current.set(key, el);
                                  else quoteGridRefs.current.delete(key);
                                }}
                                onFocus={(e) => {
                                  setActiveQuoteGridCell({ row: rowIndex, col: 2 });
                                  e.currentTarget.select();
                                }}
                                onBlur={() => {
                                  if (item.Quantity === 0) {
                                    if (item.kind === 'inventory') {
                                      updateQuoteItemQuantity(item.ItemId, 1);
                                    } else {
                                      setQuoteItems((prev) =>
                                        prev.map((x) =>
                                          x.kind === 'manual' && x.ClientId === item.ClientId
                                            ? { ...x, Quantity: 1 }
                                            : x
                                        )
                                      );
                                    }
                                  }
                                }}
                                onKeyDown={(e) => handleQuoteGridKeyDown(e, rowIndex, 2)}
                                onChange={(e) => {
                                  const { numeric } = normalizeMaskedIntegerTR(e.target.value, { maxDigits: 9, min: 0 });
                                  const v = numeric;
                                  if (item.kind === 'inventory') {
                                    updateQuoteItemQuantity(item.ItemId, v);
                                  } else {
                                    setQuoteItems((prev) =>
                                      prev.map((x) =>
                                        x.kind === 'manual' && x.ClientId === item.ClientId
                                          ? { ...x, Quantity: Math.max(0, Math.floor(v)) }
                                          : x
                                      )
                                    );
                                  }
                                }}
                                className="input w-28 text-right py-1 text-sm"
                                aria-label="Miktar"
                              />
                            )}
                          </td>
                          <td className="px-3 py-1 text-right text-text-secondary">
                            {item.kind === 'manual' ? (
                              quoteType === 'SALE' ? (
                                formatCurrency(item.UnitPriceSnapshot)
                              ) : (
                                `${formatCurrency(item.UnitPriceSnapshot)}/gün`
                              )
                            ) : isReadOnly ? (
                              quoteType === 'SALE' ? (
                                formatCurrency(item.OverrideUnitPrice ?? item.UnitPriceSnapshot)
                              ) : (
                                <div className="font-medium">
                                  {formatCurrency(
                                    item.OverrideMonthlyPrice ??
                                    (item.MonthlyPriceOverride ?? item.UnitPriceSnapshot * 30)
                                  )}
                                </div>
                              )
                            ) : quoteType === 'SALE' ? (
                              <input
                                type="text"
                                inputMode="decimal"
                                value={
                                  priceOverrideInputs[item.ItemId] ??
                                  formatPriceInput(item.OverrideUnitPrice ?? item.UnitPriceSnapshot)
                                }
                                ref={(el) => {
                                  const key = `${rowIndex}-3`;
                                  if (el) quoteGridRefs.current.set(key, el);
                                  else quoteGridRefs.current.delete(key);
                                }}
                                onFocus={(e) => {
                                  setActiveQuoteGridCell({ row: rowIndex, col: 3 });
                                  e.currentTarget.select();
                                }}
                                onKeyDown={(e) => handleQuoteGridKeyDown(e, rowIndex, 3)}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  const { masked, numeric } = normalizeMaskedDecimalTR(raw, { maxIntDigits: 9, maxFracDigits: 2 });
                                  setPriceOverrideInputs((prev) => ({ ...prev, [item.ItemId]: masked }));
                                  if (numeric === null) return;
                                  setQuoteItems((prev) =>
                                    prev.map((x) =>
                                      x.kind === 'inventory' && x.ItemId === item.ItemId
                                        ? { ...x, OverrideUnitPrice: numeric }
                                        : x
                                    )
                                  );
                                }}
                                onBlur={() => {
                                  const raw = priceOverrideInputs[item.ItemId] ?? '';
                                  const { masked, numeric } = normalizeMaskedDecimalTR(raw, { maxIntDigits: 9, maxFracDigits: 2 });
                                  if (numeric === null) {
                                    toast.warning('Birim fiyat negatif olamaz ve sayı olmalıdır.');
                                    setPriceOverrideInputs((prev) => ({ ...prev, [item.ItemId]: '' }));
                                    setQuoteItems((prev) =>
                                      prev.map((x) =>
                                        x.kind === 'inventory' && x.ItemId === item.ItemId
                                          ? { ...x, OverrideUnitPrice: undefined }
                                          : x
                                      )
                                    );
                                    return;
                                  }
                                  setPriceOverrideInputs((prev) => ({ ...prev, [item.ItemId]: masked }));
                                }}
                                className="input w-36 text-right py-1 text-sm"
                                placeholder={formatCurrency(item.UnitPriceSnapshot)}
                                aria-label="Birim Fiyat"
                              />
                            ) : (
                              <input
                                type="text"
                                inputMode="decimal"
                                value={
                                  priceOverrideInputs[item.ItemId] ??
                                  formatPriceInput(
                                    item.OverrideMonthlyPrice ??
                                    (item.MonthlyPriceOverride ?? item.UnitPriceSnapshot * 30)
                                  )
                                }
                                ref={(el) => {
                                  const key = `${rowIndex}-3`;
                                  if (el) quoteGridRefs.current.set(key, el);
                                  else quoteGridRefs.current.delete(key);
                                }}
                                onFocus={(e) => {
                                  setActiveQuoteGridCell({ row: rowIndex, col: 3 });
                                  e.currentTarget.select();
                                }}
                                onKeyDown={(e) => handleQuoteGridKeyDown(e, rowIndex, 3)}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  const { masked, numeric } = normalizeMaskedDecimalTR(raw, { maxIntDigits: 9, maxFracDigits: 2 });
                                  setPriceOverrideInputs((prev) => ({ ...prev, [item.ItemId]: masked }));
                                  if (numeric === null) return;
                                  setQuoteItems((prev) =>
                                    prev.map((x) =>
                                      x.kind === 'inventory' && x.ItemId === item.ItemId
                                        ? { ...x, OverrideMonthlyPrice: numeric }
                                        : x
                                    )
                                  );
                                }}
                                onBlur={() => {
                                  const raw = priceOverrideInputs[item.ItemId] ?? '';
                                  const { masked, numeric } = normalizeMaskedDecimalTR(raw, { maxIntDigits: 9, maxFracDigits: 2 });
                                  if (numeric === null) {
                                    toast.warning('Aylık fiyat negatif olamaz ve sayı olmalıdır.');
                                    setPriceOverrideInputs((prev) => ({ ...prev, [item.ItemId]: '' }));
                                    setQuoteItems((prev) =>
                                      prev.map((x) =>
                                        x.kind === 'inventory' && x.ItemId === item.ItemId
                                          ? { ...x, OverrideMonthlyPrice: undefined }
                                          : x
                                      )
                                    );
                                    return;
                                  }
                                  setPriceOverrideInputs((prev) => ({ ...prev, [item.ItemId]: masked }));
                                }}
                                className="input w-36 text-right py-1 text-sm"
                                placeholder={formatCurrency(item.UnitPriceSnapshot * 30)}
                                aria-label="Aylık Fiyat"
                              />
                            )}
                          </td>
                          <td className="px-3 py-1 text-right">
                            {isReadOnly ? (
                              Number(item.kind === 'inventory' ? getItemIskonto(item.ItemId) : iskonto) || 0
                            ) : (
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step={0.01}
                                value={Number(item.kind === 'inventory' ? getItemIskonto(item.ItemId) : iskonto) || 0}
                                ref={(el) => {
                                  const key = `${rowIndex}-4`;
                                  if (el) quoteGridRefs.current.set(key, el);
                                  else quoteGridRefs.current.delete(key);
                                }}
                                onFocus={(e) => {
                                  setActiveQuoteGridCell({ row: rowIndex, col: 4 });
                                  e.currentTarget.select();
                                }}
                                onKeyDown={(e) => handleQuoteGridKeyDown(e, rowIndex, 4)}
                                onChange={(e) => {
                                  const v = parseFloat(e.target.value);
                                  if (item.kind === 'inventory') {
                                    updateQuoteItemIskonto(item.ItemId, Number.isFinite(v) ? v : 0);
                                  } else {
                                    setIskonto(Number.isFinite(v) ? v : 0);
                                  }
                                }}
                                className="input w-24 text-right py-1 text-sm"
                                aria-label="İskonto %"
                              />
                            )}
                          </td>
                          <td className="px-3 py-1 text-right font-medium text-green-500">
                            {formatCurrency(lineTotal)}
                          </td>
                          <td className="px-2 py-1 text-center">
                            {!isReadOnly && (
                              <button
                                type="button"
                                ref={(el) => {
                                  const key = `${rowIndex}-6`;
                                  if (el) quoteGridRefs.current.set(key, el);
                                  else quoteGridRefs.current.delete(key);
                                }}
                                onFocus={() => setActiveQuoteGridCell({ row: rowIndex, col: 6 })}
                                onKeyDown={(e) => handleQuoteGridKeyDown(e, rowIndex, 6)}
                                onClick={() =>
                                  item.kind === 'inventory'
                                    ? handleRemoveItem(item.ItemId)
                                    : handleRemoveManualItem(item.ClientId)
                                }
                                className="text-error hover:text-red-700 inline-flex p-1"
                                aria-label="Kaldır"
                              >
                                <XIcon size={18} weight="regular" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Alt: toplam + kaydet — her zaman görünür */}
          <section className="shrink-0 rounded-lg border border-background-border bg-background-panel px-3 py-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm min-w-0">
              <div>
                <span className="text-[11px] text-text-secondary mr-1.5">Ara Toplam</span>
                <span className="font-semibold text-text-primary">{formatCurrency(subtotal)}</span>
              </div>
              <div>
                <span className="text-[11px] text-text-secondary mr-1.5">İskonto</span>
                <span className="font-semibold text-red-300">-{formatCurrency(discountAmount)}</span>
              </div>
              <div>
                <span className="text-[11px] text-text-secondary mr-1.5">İskontolu</span>
                <span className="font-semibold text-text-primary">{formatCurrency(discountedTotal)}</span>
              </div>
              <div>
                <span className="text-[11px] text-text-secondary mr-1.5">KDV ({vatRate || 0}%)</span>
                <span className="font-semibold text-yellow-300">{formatCurrency(vatAmount)}</span>
              </div>
              <div>
                <span className="text-[11px] text-text-secondary mr-1.5">Genel Toplam</span>
                <span className="text-lg font-bold text-green-400">{formatCurrency(grandTotal)}</span>
              </div>
              {quoteType === 'RENTAL' && (
                <span className="text-[11px] text-text-secondary">
                  {plannedDays} gün · fatura min 30 → {billedDays} gün
                </span>
              )}
              {quoteType === 'SALE' && (
                <span className="text-[11px] text-text-secondary">Satış: birim fiyat, süre çarpanı yok</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              {!isNew && isReadOnly && (
                <>
                  {converted && (
                    <button
                      type="button"
                      onClick={openConvertedContract}
                      disabled={isBusy || isOpeningConvertedContract}
                      className={`btn-primary ${compactBtn}`}
                    >
                      {isOpeningConvertedContract ? 'Açılıyor...' : 'Sözleşmeye git'}
                    </button>
                  )}
                  {!converted && canUpdateQuote && (
                    <button
                      type="button"
                      onClick={() => setIsReadOnly(false)}
                      className={`btn-primary ${compactBtn}`}
                    >
                      Düzenle
                    </button>
                  )}
                  {status === QuoteStatus.Pending && !converted && canUpdateQuote && (
                    <>
                      <button type="button" onClick={handleAccept} disabled={isBusy} className={`btn-success ${compactBtn}`}>
                        Kabul Et
                      </button>
                      <button type="button" onClick={handleRejectClick} disabled={isBusy} className={`btn-danger ${compactBtn}`}>
                        Reddet
                      </button>
                    </>
                  )}
                  {status === QuoteStatus.Accepted && !converted && canUpdateQuote && (
                    <button type="button" onClick={handleRejectClick} disabled={isBusy} className={`btn-danger ${compactBtn}`}>
                      Reddet
                    </button>
                  )}
                  {status === QuoteStatus.Rejected && !converted && canUpdateQuote && (
                    <button type="button" onClick={handleAccept} disabled={isBusy} className={`btn-success ${compactBtn}`}>
                      Kabul Et
                    </button>
                  )}
                  {status === QuoteStatus.Accepted && !converted && (
                    <button
                      type="button"
                      onClick={openConvertModal}
                      disabled={isBusy}
                      className={`btn-success ${compactBtn}`}
                    >
                      Sözleşmeye Dönüştür
                    </button>
                  )}
                </>
              )}
              {!isReadOnly && (
                <>
                  {!isNew && activeQuote && !converted && canDeleteQuote && (
                    <button
                      type="button"
                      onClick={handleDeleteClick}
                      disabled={isBusy}
                      className={`btn-danger ${compactBtn}`}
                    >
                      Sil
                    </button>
                  )}
                  <button type="button" onClick={() => void requestClose()} className={`btn-secondary ${compactBtn}`}>
                    İptal
                  </button>
                  {isNew && (
                    <button
                      type="button"
                      onClick={() => void handleSaveAsDraft()}
                      disabled={isBusy}
                      className={`btn-secondary ${compactBtn}`}
                      title="Eksik kalsa da taslak olarak kaydeder; listeden devam edebilirsiniz"
                    >
                      Taslak olarak kaydet
                    </button>
                  )}
                  {!isNew && isQuoteDraftStatus(status) && (
                    <button
                      type="button"
                      onClick={() => void handleSave(QuoteStatus.Pending)}
                      disabled={isBusy || isSaveBlockedByNewSite(isNewSiteMode, newSiteForm.SiteName)}
                      className={`btn-success ${compactBtn}`}
                    >
                      {isBusy ? 'Kaydediliyor...' : 'Teklifi oluştur'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={isBusy || isSaveBlockedByNewSite(isNewSiteMode, newSiteForm.SiteName)}
                    className={`btn-primary ${compactBtn}`}
                  >
                    {isBusy ? 'Kaydediliyor...' : isQuoteDraftStatus(status) ? 'Taslağı kaydet' : 'Kaydet'}
                  </button>
                </>
              )}
              {isReadOnly && (
                <button type="button" onClick={() => void requestClose()} className={`btn-secondary ${compactBtn}`}>
                  Kapat
                </button>
              )}
            </div>
          </section>
      </div>
      {showDeleteReasonModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-background-panel rounded-panel w-full max-w-md p-6 max-h-[90vh] overflow-y-auto shadow-xl">
            <h3 className="text-xl font-bold mb-2">Silme Gerekçesi (Opsiyonel)</h3>
            <p className="text-sm text-text-secondary mb-4">
              İsterseniz silme gerekçesi ekleyebilirsiniz.
            </p>
            <textarea
              value={deleteReason}
              onChange={(e) => {
                setDeleteReason(e.target.value);
                setDeleteReasonError(null);
              }}
              className="input w-full h-24 resize-none py-2 px-3 text-sm"
              placeholder="Örn: Yanlış kayıt"
            />
            {deleteReasonError && (
              <div className="mt-2 text-xs text-red-400 border border-red-700 rounded-md px-2 py-1">
                {deleteReasonError}
              </div>
            )}
            <div className="flex gap-3 justify-end mt-4">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteReasonModal(false);
                  setDeleteReason('');
                  setDeleteReasonError(null);
                }}
                disabled={isBusy}
                className="btn-secondary flex-1"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleDeleteReasonContinue}
                disabled={isBusy}
                className="btn-primary flex-1"
              >
                Devam
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={showDeleteConfirm}
        title="Teklifi sil"
        message={
          deleteReason.trim()
            ? `Bu teklifi silmek istediğinizden emin misiniz?\n\nGerekçe: ${deleteReason.trim()}`
            : 'Bu teklifi silmek istediğinizden emin misiniz?'
        }
        variant="danger"
        loading={isBusy}
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setDeleteReason('');
          setDeleteReasonError(null);
        }}
      />

      {showRejectReasonModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-background-panel rounded-panel w-full max-w-md p-6 max-h-[90vh] overflow-y-auto shadow-xl">
            <h3 className="text-xl font-bold mb-2">Red Gerekçesi</h3>
            <p className="text-sm text-text-secondary mb-4">
              Teklifi reddetmek için gerekçe belirtin.
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => {
                setRejectionReason(e.target.value);
                setRejectionReasonError(null);
              }}
              className="input w-full h-24 resize-none py-2 px-3 text-sm"
              placeholder="Örn: Fiyat uygun değil"
            />
            {rejectionReasonError && (
              <div className="mt-2 text-xs text-red-400 border border-red-700 rounded-md px-2 py-1">
                {rejectionReasonError}
              </div>
            )}
            <div className="flex gap-3 justify-end mt-4">
              <button
                type="button"
                onClick={() => {
                  setShowRejectReasonModal(false);
                  setRejectionReason('');
                  setRejectionReasonError(null);
                }}
                disabled={isBusy}
                className="btn-secondary flex-1"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleRejectReasonContinue}
                disabled={isBusy}
                className="btn-primary flex-1"
              >
                Devam
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={showRejectConfirm}
        title="Teklifi reddet"
        message={`Aşağıdaki teklifi reddedeceksiniz.\n\nTeklif: #${activeQuote?.QuoteId ?? '-'}\nRed Gerekçesi: ${rejectionReason.trim()}`}
        confirmLabel="Reddet"
        cancelLabel="Vazgeç"
        variant="danger"
        loading={isBusy}
        onConfirm={() => void handleRejectConfirm()}
        onCancel={() => {
          setShowRejectConfirm(false);
          setRejectionReason('');
          setRejectionReasonError(null);
        }}
      />

      <ConfirmModal
        open={showCloneConfirm}
        title="Teklifi Kopyala"
        message={
          activeQuote?.QuoteCode
            ? `"${activeQuote.QuoteCode}" teklifini yeni bir taslak teklif olarak kopyalamak istiyor musunuz?\n\nYeni teklifin durumu "Taslak" olur, teklif kodu boş gelir; tüm fiyatlar ve kalemler aynen kopyalanır.`
            : 'Bu teklifi yeni bir taslak teklif olarak kopyalamak istiyor musunuz?\n\nYeni teklifin durumu "Taslak" olur, teklif kodu boş gelir; tüm fiyatlar ve kalemler aynen kopyalanır.'
        }
        confirmLabel="Kopyala"
        cancelLabel="Vazgeç"
        loading={isCloning}
        onConfirm={handleCloneQuoteConfirm}
        onCancel={handleCloneQuoteCancel}
      />

      <ConfirmModal
        open={showUnsavedConfirm}
        title="Kaydedilmemiş değişiklikler"
        message={
          'Resmi teklifteki değişiklikler sayfa değişince taslak olarak saklanmaz.\nKaydetmek için geri dönüp Kaydet’e basın, veya değişiklikleri atın.'
        }
        confirmLabel="Kaydetmeden kapat"
        cancelLabel="Geri dön"
        variant="danger"
        onConfirm={() => {
          setShowUnsavedConfirm(false);
          setIsDirty(false);
          onClose();
        }}
        onCancel={() => setShowUnsavedConfirm(false)}
      />

      {/* Sözleşmeye Dönüştür - Depo Atama Modal */}
      {showConvertModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60]">
          <div className="bg-background-panel rounded-panel w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">Sözleşmeye Dönüştür – Stok / Depo</h3>
            <p className="text-sm text-text-secondary mb-4">
              {quoteType === 'SALE'
                ? 'Satış teklifinde envanter çıkışı seçtiğiniz depodan düşülür. Tüm kalemler için tek depo seçin veya ürün bazlı depo/miktar dağıtımı yapın.'
                : 'Kiralama sözleşmesine dönüşümde stok depodan rezerve edilir. Tek depo (varsayılan) veya ürün bazlı atama zorunludur; global envanter seçeneği kullanılmaz.'}
            </p>

            {convertModalError && (
              <StockErrorPanel
                message={convertModalError}
                onRetry={handleConvertToContract}
                onReduceQuantity={convertMode === 'perItem' ? handleReduceConvertQuantity : undefined}
                onDismiss={() => setConvertModalError(null)}
              />
            )}

            {convertStocksLoading && (
              <p className="text-xs text-text-secondary mb-3">Depo stok bilgileri yükleniyor...</p>
            )}

            {quoteType === 'RENTAL' && (
              <div className="rounded-lg border border-amber-600/40 bg-amber-950/25 p-3 space-y-2 mb-4">
                <div className="text-sm font-medium text-text-primary">Sözleşme tarihleri (kiralama zorunlu)</div>
                <p className="text-xs text-text-secondary">
                  Teklifte tarih olmasa bile dönüşümde sözleşme başlangıcı ve planlanan bitiş ISO tarih olarak
                  gönderilmelidir.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-0.5">
                    <label className="block text-xs font-medium text-text-primary">Sözleşme başlangıcı *</label>
                    <input
                      type="date"
                      value={convertContractStartDate}
                      onChange={(e) => setConvertContractStartDate(e.target.value)}
                      className="input w-full text-sm py-1.5"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <label className="block text-xs font-medium text-text-primary">Planlanan bitiş *</label>
                    <input
                      type="date"
                      value={convertContractEndDate}
                      onChange={(e) => setConvertContractEndDate(e.target.value)}
                      className="input w-full text-sm py-1.5"
                    />
                  </div>
                </div>
              </div>
            )}

            {quoteType === 'SALE' && (
              <div className="space-y-3 mb-4">
                <div className="rounded-lg border border-background-border p-3 space-y-2">
                  <div className="text-sm font-medium text-text-primary">Stok düşümü *</div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="decrementStock"
                      checked={decrementStock === true}
                      onChange={() => {
                        setDecrementStock(true);
                        setConvertModalError(null);
                      }}
                      className="rounded-full"
                      disabled={isBusy}
                    />
                    <span className="text-sm">Stok düşülsün</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="decrementStock"
                      checked={decrementStock === false}
                      onChange={() => {
                        setDecrementStock(false);
                        setConvertModalError(null);
                      }}
                      className="rounded-full"
                      disabled={isBusy}
                    />
                    <span className="text-sm">Stok düşülmesin</span>
                  </label>
                </div>
              </div>
            )}

            {quoteType === 'RENTAL' && (
              <p className="text-xs text-text-secondary mb-4">
                Kiralama dönüşümünde stok seçilen depodan otomatik düşülür.
              </p>
            )}

            <div className="space-y-3 mb-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="convertMode"
                  checked={convertMode === 'defaultWarehouse'}
                  onChange={() => {
                    setConvertModalError(null);
                    setConvertMode('defaultWarehouse');
                  }}
                  className="rounded-full"
                  disabled={isBusy}
                />
                <span className="text-sm">Tüm kalemler tek depodan çıksın (varsayılan depo)</span>
              </label>
              {convertMode === 'defaultWarehouse' && (
                <div className="ml-6 space-y-2">
                  <select
                    value={defaultWarehouseIdForConvert}
                    onChange={(e) => {
                      setDefaultWarehouseIdForConvert(Number(e.target.value) || '');
                      setConvertModalError(null);
                    }}
                    className="input w-full max-w-xs"
                    disabled={isBusy}
                  >
                    <option value="">Depo seçin</option>
                    {warehouses.map((wh) => (
                      <option key={wh.WarehouseId} value={wh.WarehouseId}>
                        {wh.WarehouseName}
                      </option>
                    ))}
                  </select>
                  {defaultWarehouseIdForConvert &&
                    quoteItems
                      .filter((i) => i.kind === 'inventory')
                      .map((item) => {
                        const stock = getConvertStockForWarehouse(
                          item.ItemId,
                          Number(defaultWarehouseIdForConvert)
                        );
                        if (stock == null) return null;
                        const label = formatInventoryLineBilingualLabel(
                          item.ItemName,
                          item.ItemNameEn,
                          item.Item
                        );
                        const insufficient = item.Quantity > stock;
                        return (
                          <p
                            key={item.ItemId}
                            className={`text-xs ${insufficient ? 'text-amber-400' : 'text-text-secondary'}`}
                          >
                            {label}: seçili depoda {stock} adet
                            {insufficient ? ` — talep ${item.Quantity} adet (yetersiz)` : ''}
                          </p>
                        );
                      })}
                </div>
              )}
              {quoteItems.some((i) => i.kind === 'inventory') && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="convertMode"
                    checked={convertMode === 'perItem'}
                    onChange={() => {
                      setConvertModalError(null);
                      setConvertMode('perItem');
                    }}
                    className="rounded-full"
                    disabled={isBusy}
                  />
                  <span className="text-sm">Ürün bazlı depo ataması yap</span>
                </label>
              )}
            </div>

            {convertMode === 'perItem' && (
              <div className="space-y-4 mb-6">
                {quoteItems.filter((i) => i.kind === 'inventory').map((item) => {
                  const assignments = perItemAssignments[item.ItemId] ?? [];
                  const total = getAssignmentTotalForItem(item.ItemId);
                  const isValid = total === item.Quantity;
                  const itemStocks = convertItemStocks[item.ItemId] ?? [];

                  return (
                    <div key={item.ItemId} className="card p-4">
                      <div className="font-medium mb-2">
                        {formatInventoryLineBilingualLabel(item.ItemName, item.ItemNameEn, item.Item)} — Toplam:{' '}
                        {item.Quantity} adet
                        {assignments.length > 0 && (
                          <span
                            className={`ml-2 text-sm ${isValid ? 'text-green-400' : 'text-red-400'}`}
                          >
                            (Atanan: {total} {!isValid && '— eşleşmiyor!'})
                          </span>
                        )}
                      </div>
                      {itemStocks.length > 0 && (
                        <details className="text-xs text-text-secondary mb-2">
                          <summary className="cursor-pointer text-primary-400 hover:underline">
                            Stok dağılımı
                          </summary>
                          <span className="ml-1">
                            {itemStocks
                              .map((s) => {
                                const wh = warehouses.find((w) => w.WarehouseId === s.WarehouseId);
                                return `${wh?.WarehouseName ?? s.WarehouseId}: ${s.Quantity} adet`;
                              })
                              .join(' · ')}
                          </span>
                        </details>
                      )}
                      <div className="space-y-2">
                        {assignments.map((a, idx) => {
                          const rowStock = getConvertStockForWarehouse(item.ItemId, a.WarehouseId);
                          const rowInsufficient =
                            rowStock != null && a.Quantity > 0 && a.Quantity > rowStock;
                          return (
                          <div key={idx} className="space-y-1">
                            <div className="flex gap-2 items-center">
                              <select
                                value={a.WarehouseId}
                                onChange={(e) => {
                                  updateWarehouseAssignment(
                                    item.ItemId,
                                    idx,
                                    'WarehouseId',
                                    Number(e.target.value)
                                  );
                                  setConvertModalError(null);
                                }}
                                className="input flex-1"
                                disabled={isBusy}
                              >
                                {warehouses.map((wh) => (
                                  <option key={wh.WarehouseId} value={wh.WarehouseId}>
                                    {formatWarehouseOptionLabel(wh, item.ItemId)}
                                  </option>
                                ))}
                              </select>
                              <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={a.Quantity === 0 ? '' : a.Quantity}
                                onChange={(e) => {
                                  const raw = e.target.value.replace(/[^0-9]/g, '');
                                  const num = raw === '' ? 0 : Math.max(0, parseInt(raw, 10));
                                  updateWarehouseAssignment(item.ItemId, idx, 'Quantity', num);
                                  setConvertModalError(null);
                                }}
                                className="input w-24"
                                placeholder="Adet"
                                disabled={isBusy}
                              />
                              <button
                                type="button"
                                onClick={() => removeWarehouseAssignment(item.ItemId, idx)}
                                className="text-error hover:text-red-700 text-xl px-1 inline-flex items-center justify-center"
                                disabled={isBusy}
                              >
                                <XIcon size={18} weight="regular" aria-hidden />
                              </button>
                            </div>
                            {rowStock != null && (
                              <p className={`text-[11px] pl-0.5 ${rowInsufficient ? 'text-amber-400' : 'text-text-secondary'}`}>
                                Bu depoda müsait: {rowStock} adet
                                {rowInsufficient ? ' — miktar depo stokunu aşıyor' : ''}
                              </p>
                            )}
                          </div>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => addWarehouseAssignment(item.ItemId)}
                          className="btn-secondary text-sm px-3 py-1"
                          disabled={isBusy}
                        >
                          + Depo ekle
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setConvertModalError(null);
                  setShowConvertModal(false);
                }}
                className="btn-secondary flex-1"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleConvertToContract}
                disabled={
                  isBusy ||
                  (quoteType === 'SALE' && decrementStock == null) ||
                  (convertMode === 'defaultWarehouse' && !defaultWarehouseIdForConvert) ||
                  (convertMode === 'perItem' &&
                    quoteItems
                      .filter((q) => q.kind === 'inventory')
                      .some((q) => getAssignmentTotalForItem(q.ItemId) !== q.Quantity)) ||
                  (quoteType === 'RENTAL' &&
                    (!convertContractStartDate.trim() ||
                      !convertContractEndDate.trim() ||
                      new Date(convertContractEndDate).getTime() <=
                        new Date(convertContractStartDate).getTime()))
                }
                className="btn-success flex-1"
              >
                {isBusy ? 'Dönüştürülüyor...' : 'Dönüştür'}
              </button>
            </div>
          </div>
        </div>
      )}
      <ProductPickerModal
        open={showProductPickerModal}
        onClose={() => setShowProductPickerModal(false)}
        items={availableItems}
        onItemSelect={toggleItemFromPicker}
        displayMode="quote"
        quotePricing={quoteType === 'SALE' ? 'sale' : 'rental'}
        currency={currency}
        pickedItemIds={pickerPickedItemIds}
      />
      <ManualLineItemModal
        open={showManualLineModal}
        mode="quote"
        currency={currency}
        onClose={() => setShowManualLineModal(false)}
        onAdd={(data) => {
          setQuoteItems((prev) => [
            ...prev,
            {
              kind: 'manual',
              ClientId: `manual-${crypto.randomUUID()}`,
              is_manual: true,
              Description: data.Description,
              Quantity: data.Quantity,
              UnitPriceSnapshot: data.DailyPrice,
              PriceUnit: (quoteType === 'SALE' ? 'EACH' : 'DAY') as 'EACH' | 'DAY',
              PriceSource: 'MANUAL',
            },
          ]);
        }}
      />
      {showCreateContactModal &&
        createPortal(
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[9999] p-4 backdrop-blur-sm">
            <div className="bg-background-panel rounded-panel shadow-xl w-full max-w-md border border-background-border">
              <div className="flex items-center justify-between p-4 border-b border-background-border">
                <h3 className="text-sm font-medium text-text-primary">Yeni Merkez Yetkilisi Ekle</h3>
                <button
                  type="button"
                  onClick={() => setShowCreateContactModal(false)}
                  className="text-text-secondary hover:text-text-primary"
                >
                  <XIcon size={16} />
                </button>
              </div>
              <div className="p-4 space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-text-primary">Ad Soyad *</label>
                  <input
                    type="text"
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    className="input w-full text-sm py-1.5"
                    placeholder="Ad Soyad"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-text-primary">Telefon</label>
                  <input
                    type="text"
                    value={newContactPhone}
                    onChange={(e) => setNewContactPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                    className="input w-full text-sm py-1.5"
                    placeholder="Telefon"
                    maxLength={11}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-text-primary">E-posta</label>
                  <input
                    type="email"
                    value={newContactEmail}
                    onChange={(e) => setNewContactEmail(e.target.value)}
                    className="input w-full text-sm py-1.5"
                    placeholder="E-posta"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-text-primary">Ünvan</label>
                  <input
                    type="text"
                    value={newContactTitle}
                    onChange={(e) => setNewContactTitle(e.target.value)}
                    className="input w-full text-sm py-1.5"
                    placeholder="Ünvan"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 p-4 border-t border-background-border">
                <button
                  type="button"
                  onClick={() => setShowCreateContactModal(false)}
                  className="btn-secondary text-sm"
                  disabled={isCreatingContact}
                >
                  İptal
                </button>
                <button
                  type="button"
                  onClick={handleCreateContact}
                  className="btn-primary text-sm"
                  disabled={isCreatingContact || !newContactName.trim()}
                >
                  {isCreatingContact ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
      {showCreateCustomerModal &&
        createPortal(
          <CustomerDetailModal
            customer={null}
            isNew
            overlayClassName="z-[80]"
            onSaved={handleCustomerSaved}
            onClose={() => setShowCreateCustomerModal(false)}
          />,
          document.body
        )}
      {showCreateSiteModal && selectedCustomerId && (
        <SiteCreateModal
          customerId={Number(selectedCustomerId)}
          customerName={customers.find((c) => c.CustomerId === Number(selectedCustomerId))?.Name}
          onCreated={handleSiteCreated}
          onClose={() => setShowCreateSiteModal(false)}
        />
      )}
      {isTemplateEditorOpen &&
        createPortal(
          <QuoteTemplateEditorModal
            template={editingTemplate}
            isNew={isNewTemplate}
            onClose={() => {
              setIsTemplateEditorOpen(false);
              setEditingTemplate(null);
              loadTemplates();
            }}
            onSave={(templateId) => {
              setSelectedTemplateId(templateId);
              setIsTemplateEditorOpen(false);
              setEditingTemplate(null);
              loadTemplates();
            }}
          />,
          document.body
        )}
      <PdfPreviewModal
        open={showPdfPreview}
        pdfUrl={pdfPreviewUrl}
        title="Teklif Önizleme"
        downloadFileName={`teklif_${activeQuote?.QuoteId ?? ''}.pdf`}
        onClose={closePdfPreview}
      />
      {isContractModalOpen && (
        <ContractDetailModal
          key={`converted-contract-${convertedContract?.ContractId ?? 'x'}`}
          contract={convertedContract}
          isNew={false}
          stackAboveParent
          onDataChanged={refreshQuoteDetail}
          onClose={async () => {
            setIsContractModalOpen(false);
            setConvertedContract(null);
            await refreshQuoteDetail();
          }}
        />
      )}
      {showCreatePackageModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[70]">
          <div className="bg-background-panel rounded-panel w-full max-w-lg p-6">
            <h3 className="text-lg font-semibold mb-3">Tekliften Yeni Paket Oluştur</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-text-primary mb-1">Paket Adı *</label>
                <input
                  type="text"
                  className="input w-full"
                  value={newPackageName}
                  onChange={(e) => setNewPackageName(e.target.value)}
                  placeholder="Örn: 500m2 Standart Paket"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-primary mb-1">Açıklama</label>
                <input
                  type="text"
                  className="input w-full"
                  value={newPackageDescription}
                  onChange={(e) => setNewPackageDescription(e.target.value)}
                  placeholder="Opsiyonel açıklama"
                />
              </div>
              <div>
                <label htmlFor="new-package-discount" className="block text-xs font-medium text-text-primary mb-1">
                  Varsayılan iskonto (%)
                </label>
                <div className="relative">
                  <input
                    id="new-package-discount"
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    className="input w-full pr-8"
                    placeholder="0"
                    title="Bu paket bir teklife uygulandığında genel iskonto olarak yazılır"
                    value={newPackageDiscount}
                    onChange={(e) => setNewPackageDiscount(Number(e.target.value) || 0)}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-text-secondary">
                    %
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-text-secondary">
                  Paketi sonraki tekliflere uygularken bu yüzde otomatik iskonto olarak gelir. İndirim yoksa 0 bırakın.
                </p>
              </div>
              <p className="text-xs text-text-secondary">
                Not: Sadece envanter ürünleri pakete eklenir, manuel kalemler eklenmez.
              </p>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                type="button"
                className="btn-secondary flex-1"
                onClick={() => setShowCreatePackageModal(false)}
                disabled={isCreatingPackage}
              >
                İptal
              </button>
              <button
                type="button"
                className="btn-primary flex-1"
                onClick={handleCreatePackageFromCurrentQuote}
                disabled={isCreatingPackage}
              >
                {isCreatingPackage ? 'Oluşturuluyor...' : 'Oluştur'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
