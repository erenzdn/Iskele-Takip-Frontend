import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuthStore } from '../../store/authStore';
import { CheckIcon, ClipboardIcon, CopySimpleIcon, XIcon } from '@phosphor-icons/react';
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
} from '../../models';
import { quoteService, WarehouseAssignment } from '../../services/quoteService';
import { contractService } from '../../services/contractService';
import { quoteTemplateService } from '../../services/quoteTemplateService';
import { customerService } from '../../services/customerService';
import { getApiErrorMessage, getApiFieldErrors, userMessageForCustomerRelatedApiError } from '../../utils/apiError';
import { formatInventoryLineBilingualLabel, formatMoney, formatShortDateTime } from '../../utils/formatters';
import { toast } from '../../hooks/useToast';
import { firstValidationError, normalizeText, validateDate, validateNumber, validateRequired } from '../../utils/validation';
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
import ContractDetailModal from './ContractDetailModal';

interface QuoteDetailModalProps {
  quote: Quote | null;
  isNew: boolean;
  onClose: () => void;
  onDataChanged?: () => void | Promise<void>;
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
  const [startDate, setStartDate] = useState('');
  const [plannedEndDate, setPlannedEndDate] = useState('');
  /** RENTAL: kiralama süresi (gün), min 1 */
  const [rentalDurationDays, setRentalDurationDays] = useState(30);
  const [quoteItems, setQuoteItems] = useState<QuoteLineItem[]>([]);
  const [status, setStatus] = useState<QuoteStatus>(QuoteStatus.Pending);
  const [subject, setSubject] = useState('');
  const [notes, setNotes] = useState('');
  const [isBusy, setIsBusy] = useState(false);

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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showProductPickerModal, setShowProductPickerModal] = useState(false);
  const [lastAddedItemIds, setLastAddedItemIds] = useState<number[]>([]);
  const [iskonto, setIskonto] = useState<number>(0);
  /** Satır bazlı iskonto (%) - key: ItemId. Üstteki iskonto değişince tüm satırlara yansır; satırda tek tek de düzenlenebilir. */
  const [itemIskonto, setItemIskonto] = useState<Record<number, number>>({});
  const [vatRate, setVatRate] = useState<number>(20);
  const [quoteCode, setQuoteCode] = useState<string>('');
  const [currency, setCurrency] = useState<'TRY' | 'EUR' | 'USD'>('TRY');
  const [quoteType, setQuoteType] = useState<ContractQuoteType>(() => defaultTypeForNew ?? 'RENTAL');

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

  const handleCustomerChange = (value: number | '') => {
    setSelectedCustomerId(value);
    setSelectedAuthorizedContactId('');
    setAuthorizedContactError(null);
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
      setSelectedCustomerId(source.CustomerId);
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
      setSubject(String((source as any).Subject ?? (source as any).subject ?? '').trim());
      setNotes(source.Notes || '');
      setIskonto(Number.isFinite(parsedIskonto) ? parsedIskonto : 0);
      setVatRate(Number.isFinite(parsedVatRate) ? parsedVatRate : 20);
      setQuoteCode(source.QuoteCode ?? '');
      setCurrency(source.Currency === 'EUR' ? 'EUR' : source.Currency === 'USD' ? 'USD' : 'TRY');
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
            ItemName: detail.ItemName || '',
            ItemNameOverride:
              (detail.ItemNameOverride ??
                detail.itemNameOverride ??
                detail.ItemName_Override ??
                detail.item_name_override ??
                null) as any,
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
                const { masked } = normalizeMaskedDecimalTR(String(candidate).replace('.', ','), {
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

  const normalizeMaskedDecimalTR = (
    raw: string,
    opts?: { maxIntDigits?: number; maxFracDigits?: number }
  ): { masked: string; numeric: number | undefined | null } => {
    const maxIntDigits = opts?.maxIntDigits ?? 9;
    const maxFracDigits = opts?.maxFracDigits ?? 2;
    const s = String(raw ?? '').trim();
    if (!s) return { masked: '', numeric: undefined };

    // TR gösterimde '.' binlik, ',' ondalık olsun.
    // ÖNEMLİ: Biz zaten yazarken '.' eklediğimiz için '.'ı ondalık kabul edersek
    // 3+ haneli sayılarda yanlış split olur (9 hane yazılamaz). Bu yüzden ondalık sadece ','.
    const decimalSep = s.includes(',') ? ',' : null;

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
    const masked = fracDigits ? `${maskedInt},${fracDigits}` : maskedInt;

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
      setSelectedSiteId('');
    } else {
      setSites([]);
      setSelectedSiteId('');
    }
  }, [selectedCustomerId]);

  useEffect(() => {
    if (quoteType === 'SALE' && selectedSiteId) {
      setSelectedSiteId('');
    }
    // SALE seçilince PlannedEndDate backend tarafından yok sayılıyor (null).
    // Kullanıcı "kaydedilmedi mi?" yanılgısı yaşamaması için state'i temizle.
    if (quoteType === 'SALE') {
      setPlannedEndDate('');
    }
  }, [quoteType, selectedSiteId]);

  const loadSites = async (customerId: number) => {
    try {
      setSitesLoading(true);
      const data = await siteService.getByCustomerAsync(customerId);
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
          if (item.ItemName) return item;
          try {
            const inventoryItem = await inventoryService.getByIdAsync(item.ItemId);
            return {
              ...item,
              Item: inventoryItem,
              ItemName: inventoryItem.ItemName,
              ItemNameEn: inventoryItem.ItemNameEn ?? undefined,
            };
          } catch {
            return { ...item, ItemName: 'Bilinmiyor' };
          }
        })
      );
      setQuoteItems(itemsWithNames);
    };

    if (quoteItems.length > 0 && quoteItems.some((i) => i.kind === 'inventory' && !i.ItemName)) {
      loadItemNames();
    }
  }, [quoteItems.length]);

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
          if (item.Item && item.ItemNameEn !== undefined) return item;
          changed = true;
          return {
            ...item,
            Item: item.Item ?? inv,
            ItemNameEn: item.ItemNameEn ?? inv.ItemNameEn ?? undefined,
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
        inventoryService.getAllAsync(),
        warehouseService.getAllAsync(),
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
    const qty = Math.max(1, Math.floor(newQty));
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

  const handleSave = async () => {

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

    if (quoteType === 'RENTAL' && sites.length > 0 && !selectedSiteId) {
      toast.warning('Bu müşterinin şantiyeleri bulunuyor. Lütfen bir şantiye seçin.');
      return;
    }

    try {
      setIsBusy(true);
      const normalizeItemNameOverride = (raw: unknown): string | null => {
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
          ItemNameOverride: normalizeItemNameOverride(item.ItemNameOverride),
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

      if (quoteType === 'RENTAL' && selectedSiteId) {
        requestBody.SiteId = Number(selectedSiteId);
      }
      if (normalizeText(quoteCode)) {
        requestBody.QuoteCode = normalizeText(quoteCode);
      }

      if (isNew) {
        requestBody.Type = quoteType;
        const result = await quoteService.createAsync(requestBody as any);
        toast.success(`Teklif başarıyla oluşturuldu! (ID: ${result.QuoteId})`);
        await onDataChanged?.();
        onClose();
        return;
      } else if (quote) {
        const updateBody: Record<string, unknown> = {
          Status: status,
          Iskonto: iskonto,
          VatRate: vatRate,
          Currency: currency,
          Subject: normalizeText(subject) ? normalizeText(subject) : null,
          Notes: normalizeText(notes) || undefined,
          // Kalem değişiklikleri (override fiyatlar dahil) PATCH ile de gitsin; aksi halde fiyat yeniden hesaplanmaz.
          details,
        };
        if ((quote as { CustomerAuthorizedContactId?: number | null }).CustomerAuthorizedContactId !== Number(selectedAuthorizedContactId)) {
          updateBody.CustomerAuthorizedContactId = Number(selectedAuthorizedContactId);
        }
        if (quoteType === 'RENTAL') {
          const useDatePair = Boolean(startDate.trim() && plannedEndDate.trim());
          if (useDatePair) {
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
        if (quoteType === 'RENTAL' && selectedSiteId) {
          updateBody.SiteId = Number(selectedSiteId);
        }
        if (normalizeText(quoteCode)) {
          updateBody.QuoteCode = normalizeText(quoteCode);
        }
        await quoteService.updateAsync(quote.QuoteId, updateBody as any);
        toast.success('Teklif başarıyla güncellendi!');
        await onDataChanged?.();
        onClose();
        return;
      }
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
      toast.error(userMessageForCustomerRelatedApiError(error, rawMessage || 'Kaydetme hatası'));
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteClick = () => {
    if (!activeQuote) return;
    if (activeQuote.ConvertedContractId) {
      toast.warning('Sözleşmeye dönüştürülmüş teklifler silinemez.');
      return;
    }
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!activeQuote) return;
    try {
      setIsBusy(true);
      await quoteService.deleteAsync(activeQuote.QuoteId);
      setShowDeleteConfirm(false);
      await onDataChanged?.();
      onClose();
    } catch (error) {
      console.error('Delete quote error:', error);
      setShowDeleteConfirm(false);
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleAccept = async () => {
    if (!activeQuote || activeQuote.ConvertedContractId) return;
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

  const handleReject = async () => {
    if (!activeQuote || activeQuote.ConvertedContractId) return;
    try {
      setIsBusy(true);
      await quoteService.rejectQuoteAsync(activeQuote.QuoteId);
      setStatus(QuoteStatus.Rejected);
      await onDataChanged?.();
      toast.success('Teklif reddedildi.');
      onClose();
    } catch (error) {
      console.error('Reject quote error:', error);
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const openConvertModal = () => {
    if (!activeQuote || status !== QuoteStatus.Accepted || activeQuote.ConvertedContractId) return;
    setConvertModalError(null);
    setConvertMode('defaultWarehouse');
    setDefaultWarehouseIdForConvert(warehouses[0]?.WarehouseId ?? '');
    setShowConvertModal(true);
    setPerItemAssignments({});
    setDecrementStock(null);
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

    if (activeQuote.ConvertedContractId) {
      toast.warning('Bu teklif zaten sözleşmeye dönüştürülmüş.');
      return;
    }
    if (decrementStock == null) {
      setConvertModalError('Lutfen stok dusum secimini yapin.');
      return;
    }

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
        decrementStock,
        ...(quoteType === 'RENTAL'
          ? {
              StartDate: new Date(convertContractStartDate).toISOString(),
              PlannedEndDate: new Date(convertContractEndDate).toISOString(),
            }
          : {}),
      });
      setConvertModalError(null);
      setShowConvertModal(false);
      if (!decrementStock && result.warnings && result.warnings.length > 0) {
        toast.info(result.warnings.join('\n'));
      }
      const updatedQuote = await quoteService.getByIdAsync(activeQuote.QuoteId);
      setFullQuote(updatedQuote);
      await onDataChanged?.();
      toast.success(`Teklif başarıyla sözleşmeye dönüştürüldü!\nSözleşme ID: ${result.ContractId}`);
    } catch (error: unknown) {
      console.error('Convert quote error:', error);
      const msg = getApiErrorMessage(error);
      setConvertModalError(
        userMessageForCustomerRelatedApiError(
          error,
          msg || 'Dönüştürme başarısız. Depolarda yeterli stok olduğundan emin olun veya farklı depo seçin.'
        )
      );
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
    if (quoteType === 'RENTAL' && sites.length > 0 && !selectedSiteId) {
      toast.warning('Bu müşterinin şantiyeleri bulunuyor. Lütfen bir şantiye seçin.');
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
      toast.error(getApiErrorMessage(error));
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
      toast.error(getApiErrorMessage(error));
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
    switch (status) {
      case QuoteStatus.Pending:
        return <span className="badge bg-yellow-700 text-yellow-100 text-lg px-4 py-1">Beklemede</span>;
      case QuoteStatus.Accepted:
        return <span className="badge bg-green-700 text-green-100 text-lg px-4 py-1">Kabul Edildi</span>;
      case QuoteStatus.Rejected:
        return <span className="badge bg-red-700 text-red-100 text-lg px-4 py-1">Reddedildi</span>;
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background-main">
      <header className="shrink-0 flex items-center justify-between px-4 py-3 bg-background-panel border-b border-background-border shadow-sm">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-text-primary tracking-tight">
            {isNew ? 'Yeni Teklif' : 'Teklif Detayı'}
          </h1>
          <span className="text-sm font-medium text-text-secondary">
            {quoteType === 'SALE' ? 'Satış Teklifi' : 'Kiralama Teklifi'}
          </span>
          {!isNew && getStatusBadge()}
          {isClonedDraft && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-200"
              title="Bu teklif başka bir tekliften kopyalandı. Kaydedip kullanıcıya paylaşmadan önce gerekli alanları (teklif kodu, tarihler, fiyatlar) gözden geçirin."
            >
              <CopySimpleIcon size={12} weight="bold" aria-hidden />
              Taslak (kopya)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isNew && activeQuote?.QuoteId && (
            <button
              type="button"
              onClick={handleCloneQuoteClick}
              disabled={isBusy || isCloning}
              title="Bu teklifi yeni bir taslak teklif olarak kopyala"
              aria-label="Teklifi Kopyala"
              className="inline-flex items-center gap-1.5 rounded-lg border border-background-border px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-background-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <CopySimpleIcon size={16} weight="regular" aria-hidden />
              {isCloning ? 'Kopyalanıyor...' : 'Teklifi Kopyala'}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-text-secondary hover:bg-background-hover hover:text-text-primary transition-colors"
            aria-label="Kapat"
          >
            <XIcon size={22} weight="regular" />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        <div className="w-full p-3 md:p-4 space-y-4">
          {/* Üst kısım: yatay bilgi alanları (kompakt) */}
          <section className="rounded-xl border border-background-border bg-background-panel p-3 shadow-sm">
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2 pb-1.5 border-b border-background-border">
              Genel Bilgiler
            </h3>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-0.5">
                <label className="block text-xs font-medium text-text-primary">Teklif Kodu (Opsiyonel)</label>
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

              <div className="space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="block text-xs font-medium text-text-primary">Konu</label>
                  <span className={`text-[11px] ${subject.length > 255 ? 'text-red-300' : 'text-text-secondary'}`}>
                    {Math.min(subject.length, 255)}/255
                  </span>
                </div>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value.slice(0, 255))}
                  disabled={isReadOnly}
                  className="input w-full text-sm py-1.5"
                  placeholder="Teklif konusu giriniz"
                  maxLength={255}
                />
              </div>

              <div className="space-y-0.5">
                <label className="block text-xs font-medium text-text-primary" htmlFor="quote-customer-search">
                  Müşteri Seçimi *
                </label>
                <CustomerSearchField
                  key={`${quote?.QuoteId ?? 'new'}-${isNew}`}
                  id="quote-customer-search"
                  customers={customers}
                  value={selectedCustomerId}
                  onChange={handleCustomerChange}
                  disabled={isReadOnly}
                />
              </div>

              {selectedCustomerId && (
                <div className="space-y-0.5">
                  <label className="block text-xs font-medium text-text-primary">
                    Merkez Yetkili *
                  </label>
                  {authorizedContactsLoading ? (
                    <div className="input w-full text-text-secondary text-sm py-2">Yükleniyor...</div>
                  ) : authorizedContacts.length > 0 ? (
                    <select
                      value={selectedAuthorizedContactId}
                      onChange={(e) => {
                        setSelectedAuthorizedContactId(Number(e.target.value) || '');
                        setAuthorizedContactError(null);
                      }}
                      disabled={isReadOnly}
                      className="input w-full text-sm py-1.5"
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
                    <div className="input w-full text-red-300 bg-background-secondary text-sm py-2">
                      Bu müşteri için yetkili tanımlı değil
                    </div>
                  )}
                  {authorizedContactError && (
                    <p className="text-xs text-red-300">{authorizedContactError}</p>
                  )}
                </div>
              )}

              {selectedCustomerId && quoteType === 'RENTAL' && (
                <div className="space-y-0.5">
                  <label className="block text-xs font-medium text-text-primary">
                    Şantiye Seçimi {sites.length > 0 ? '*' : '(Opsiyonel)'}
                  </label>
                  {sitesLoading ? (
                    <div className="input w-full text-text-secondary text-sm py-2">Yükleniyor...</div>
                  ) : sites.length > 0 ? (
                    <select
                      value={selectedSiteId}
                      onChange={(e) => setSelectedSiteId(Number(e.target.value) || '')}
                      disabled={isReadOnly}
                      className="input w-full"
                      required={quoteType === 'RENTAL' && sites.length > 0}
                    >
                      <option value="">Şantiye seçin</option>
                      {sites.map((site) => (
                        <option key={site.SiteId} value={site.SiteId}>
                          {site.SiteName}
                          {site.SiteAddress && ` - ${site.SiteAddress}`}
                          {site.ResponsiblePerson && ` (Sorumlu: ${site.ResponsiblePerson})`}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="input w-full text-text-secondary bg-background-secondary text-sm py-2">
                      Bu müşterinin şantiyesi bulunmuyor
                    </div>
                  )}
                </div>
              )}

              {quoteType === 'RENTAL' && (
                <div className="space-y-0.5">
                  <label className="block text-xs font-medium text-text-primary">
                    Kiralama süresi (gün) *
                  </label>
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
                    className="input w-full text-sm py-1.5 max-w-[140px]"
                  />
                  <p className="text-[11px] text-text-secondary leading-snug">
                    Fiyatlandırma sunucuda en az 30 günlük hesaplanır (ör. 10 gün girseniz bile ücret tabanı 30 gündür).
                    PDF/önizlemede tarih yoksa şablonda &quot;Belirlenecek&quot; görünebilir.
                  </p>
                </div>
              )}



              {quoteType === 'RENTAL' && !isNew && (
                <div className="text-[11px] text-text-secondary space-y-0.5 rounded border border-background-border/60 p-2">
                  <div>
                    <span className="font-medium text-text-primary">Kayıtlı süre:</span>{' '}
                    {(activeQuote as Quote)?.RentalDurationDays != null &&
                    Number((activeQuote as Quote).RentalDurationDays) >= 1
                      ? `${Number((activeQuote as Quote).RentalDurationDays)} gün`
                      : '—'}
                  </div>
                  <div>
                    <span className="font-medium text-text-primary">Planlanan bitiş (API):</span>{' '}
                    {(activeQuote as Quote)?.PlannedEndDate != null &&
                    String((activeQuote as Quote).PlannedEndDate).trim()
                      ? new Date(String((activeQuote as Quote).PlannedEndDate)).toLocaleDateString('tr-TR')
                      : 'Sözleşmede belirlenecek'}
                  </div>
                </div>
              )}

              <div className="space-y-0.5">
                <label className="block text-xs font-medium text-text-primary">Teklif Sahibi</label>
                <div className="input w-full bg-background-secondary text-text-secondary py-1.5 px-2 text-xs rounded-lg border border-background-border">
                  {currentUser?.fullName || currentUser?.username || '—'}
                </div>
              </div>

              <div className="space-y-0.5">
                <label className="block text-xs font-medium text-text-primary">İskonto (%)</label>
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
                  className="input w-20 text-sm py-1.5"
                  placeholder="0"
                  title="Tüm satırlara uygulanır; tabloda satır bazlı değiştirebilirsiniz"
                />
              </div>

              <div className="space-y-0.5">
                <label className="block text-xs font-medium text-text-primary">KDV (%)</label>
                <input
                  type="number"
                  value={vatRate}
                  onChange={(e) => setVatRate(parseFloat(e.target.value) || 0)}
                  disabled={isReadOnly}
                  min={0}
                  max={100}
                  step={1}
                  className="input w-20 text-sm py-1.5"
                  placeholder="20"
                />
              </div>

              <div className="space-y-0.5">
                <label className="block text-xs font-medium text-text-primary">Para Birimi</label>
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

              {!isNew && (
                <div className="space-y-0.5">
                  <label className="block text-xs font-medium text-text-primary">Durum</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as QuoteStatus)}
                    disabled={isReadOnly}
                    className="input w-full text-sm py-1.5"
                  >
                    <option value={QuoteStatus.Accepted}>Kabul Edildi</option>
                    <option value={QuoteStatus.Rejected}>Reddedildi</option>
                  </select>
                </div>
              )}

              <div className="space-y-0.5">
                <label className="block text-xs font-medium text-text-primary">Teklif Tipi</label>
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

              <div className="space-y-0.5 md:col-span-2 lg:col-span-3">
                <label className="block text-xs font-medium text-text-primary">Notlar</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={isReadOnly}
                  className="input w-full h-14 resize-none text-sm"
                  placeholder="Teklif ile ilgili notlar..."
                />
              </div>

              <div className="space-y-0.5 md:col-span-2 lg:col-span-3">
                <label className="block text-xs font-medium text-text-primary">Teklif Şablonu (Opsiyonel)</label>
                <div className="flex gap-2">
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
                      className="btn-secondary text-sm shrink-0"
                    >
                      {loadingTemplate ? 'Yükleniyor...' : 'Düzenle'}
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
                      className="btn-secondary text-sm shrink-0"
                    >
                      Yeni
                    </button>
                  )}
                </div>
              </div>
              {isNew && !isReadOnly && (
                <div className="space-y-0.5 md:col-span-2 lg:col-span-3">
                  <label className="block text-xs font-medium text-text-primary">Hazır Paket (Opsiyonel)</label>
                  {packagesLoadError && (
                    <div className="text-xs text-red-300 mb-1">
                      Paketler yüklenemedi: {packagesLoadError}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <select
                      value={selectedPackageId}
                      onChange={(e) => setSelectedPackageId(e.target.value)}
                      className="input w-full text-sm py-1.5"
                    >
                      <option value="">Paketten oluşturmak için paket seçin</option>
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
                      className="btn-secondary text-sm shrink-0"
                    >
                      Paketten Oluştur
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCreatePackageModal(true)}
                      disabled={isBusy}
                      className="btn-secondary text-sm shrink-0"
                    >
                      Yeni
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-background-border pt-2">
              <div className="flex flex-wrap items-center gap-4 text-xs text-text-secondary">
                {quoteType === 'RENTAL' && (
                  <span>
                    <span className="font-medium text-text-primary">Planlanan Süre:</span> {plannedDays} gün
                    <span className="ml-2 text-text-secondary/90">(Faturalama: min 30 → {billedDays} gün)</span>
                  </span>
                )}
                {quoteType === 'SALE' && (
                  <span className="text-text-secondary/90">Satış teklifinde fiyatlar birim satış fiyatıdır; süre çarpanı uygulanmaz.</span>
                )}
                <span>
                  <span className="font-medium text-text-primary">Durum:</span>{' '}
                  {status === QuoteStatus.Pending && 'Beklemede'}
                  {status === QuoteStatus.Accepted && 'Kabul Edildi'}
                  {status === QuoteStatus.Rejected && 'Reddedildi'}
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => setShowProductPickerModal(true)}
                    className="btn-secondary"
                  >
                    Ürün Ekle
                  </button>
                )}
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => setShowManualLineModal(true)}
                    className="btn-secondary"
                  >
                    Manuel Kalem Ekle
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
                    className="btn-secondary text-sm"
                  >
                    <ClipboardIcon size={16} weight="regular" className="inline mr-1" aria-hidden />
                    {isAddingMaterialTable ? 'Ekleniyor...' : 'Tabloyu Şablona Ekle'}
                  </button>
                )}
                {!isNew && activeQuote && selectedTemplateId && (
                  <>
                    <button type="button" onClick={handlePreviewDocument} disabled={isBusy} className="btn-primary text-sm">
                      {isBusy ? 'Yükleniyor...' : 'Önizle'}
                    </button>
                    <button type="button" onClick={() => handleGenerateDocument('pdf')} disabled={isBusy} className="btn-secondary text-sm">
                      PDF İndir
                    </button>
                    <button type="button" onClick={() => handleGenerateDocument('docx')} disabled={isBusy} className="btn-secondary text-sm">
                      Word İndir
                    </button>
                  </>
                )}
                {!isNew && isReadOnly && (
                  <>
                    {activeQuote?.ConvertedContractId && (
                      <button
                        type="button"
                        onClick={openConvertedContract}
                        disabled={isBusy || isOpeningConvertedContract}
                        className="btn-primary"
                      >
                        {isOpeningConvertedContract
                          ? 'Sözleşme Açılıyor...'
                          : `Sözleşmeyi Aç (#${activeQuote.ConvertedContractId})`}
                      </button>
                    )}
                    {!activeQuote?.ConvertedContractId && (
                      <button
                        onClick={() => setIsReadOnly(false)}
                        className="btn-primary"
                      >
                        Düzenle
                      </button>
                    )}
                    {status === QuoteStatus.Pending && !activeQuote?.ConvertedContractId && (
                      <>
                        <button onClick={handleAccept} disabled={isBusy} className="btn-success">
                          Kabul Et
                        </button>
                        <button onClick={handleReject} disabled={isBusy} className="btn-danger">
                          Reddet
                        </button>
                      </>
                    )}
                    {status === QuoteStatus.Accepted && !activeQuote?.ConvertedContractId && (
                      <button onClick={handleReject} disabled={isBusy} className="btn-danger">
                        Reddet
                      </button>
                    )}
                    {status === QuoteStatus.Rejected && !activeQuote?.ConvertedContractId && (
                      <button onClick={handleAccept} disabled={isBusy} className="btn-success">
                        Kabul Et
                      </button>
                    )}
                    {status === QuoteStatus.Accepted && !activeQuote?.ConvertedContractId && (
                      <button
                        onClick={openConvertModal}
                        disabled={isBusy}
                        className="btn-success"
                      >
                        Sözleşmeye Dönüştür
                      </button>
                    )}
                  </>
                )}
                {!isReadOnly && (
                  <>
                    {!isNew && activeQuote && !activeQuote.ConvertedContractId && (
                      <button
                        onClick={handleDeleteClick}
                        disabled={isBusy}
                        className="btn-danger"
                      >
                        Sil
                      </button>
                    )}
                    <button onClick={onClose} className="btn-secondary">
                      İptal
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={isBusy}
                      className="btn-primary"
                    >
                      {isBusy ? 'Kaydediliyor...' : 'Kaydet'}
                    </button>
                  </>
                )}
                {isReadOnly && (
                  <button onClick={onClose} className="btn-secondary">
                    Kapat
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Sözleşmeye dönüştürüldü bilgisi */}
          {activeQuote?.ConvertedContractId && (
            <section className="rounded-xl border border-background-border bg-green-900/30 p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="text-green-300 shrink-0">
                  <CheckIcon size={20} weight="bold" aria-hidden />
                </span>
                <span>
                  Bu teklif sözleşmeye dönüştürüldü (Sözleşme #{activeQuote.ConvertedContractId})
                </span>
              </div>
              <div className="mt-2 text-sm text-green-200">
                Dönüştürülme Tarihi:{' '}
                {formatShortDateTime(activeQuote.ConvertedAt)}
              </div>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={openConvertedContract}
                  disabled={isBusy || isOpeningConvertedContract}
                  className="btn-secondary text-sm"
                >
                  {isOpeningConvertedContract ? 'Açılıyor...' : 'Sözleşmeyi Aç'}
                </button>
              </div>
            </section>
          )}

          {/* Orta kısım: ürün tablosu */}
          <section className="rounded-xl border border-background-border bg-background-panel shadow-sm flex-1 min-h-[260px] flex flex-col overflow-hidden">
            <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider px-4 pt-4 pb-2 border-b border-background-border shrink-0">
              Teklif Kalemleri
            </h3>
            <div className="border-0 rounded-b-xl overflow-auto flex-1 min-h-0">
              <table className="w-full text-sm border-collapse text-text-primary">
                <thead className="sticky top-0 bg-background-surface z-10 border-b border-background-border">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-text-secondary whitespace-nowrap">
                      Ürün Kodu
                    </th>
                    <th className="text-left px-3 py-2 font-semibold text-text-secondary">
                      Ürün Adı
                    </th>
                    <th className="text-right px-3 py-2 font-semibold text-text-secondary w-24">
                      Miktar
                    </th>
                    <th className="text-right px-3 py-2 font-semibold text-text-secondary whitespace-nowrap">
                      {quoteType === 'SALE' ? 'Birim Fiyat' : 'Aylık Fiyat'}
                    </th>
                    <th className="text-right px-3 py-2 font-semibold text-text-secondary w-20">
                      İskonto (%)
                    </th>
                    <th className="text-right px-3 py-2 font-semibold text-text-secondary whitespace-nowrap">
                      Toplam
                    </th>
                    <th className="text-center px-2 py-2 font-semibold text-text-secondary w-20">
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
                        Henüz ürün eklenmedi. Üst kısımdan "Ürün Ekle" butonu ile ürün
                        seçebilirsiniz.
                      </td>
                    </tr>
                  ) : (
                    quoteItems.map((item, rowIndex) => {
                      const itemCode =
                        item.kind === 'inventory'
                          ? availableItems.find((i) => i.ItemId === item.ItemId)?.ItemCode ?? '—'
                          : '—';
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
                          <td className="px-3 py-2 text-text-secondary">{itemCode}</td>
                          <td className="px-3 py-2 font-medium">
                            {item.kind === 'inventory' ? (
                              isReadOnly ? (
                                formatInventoryLineBilingualLabel(
                                  item.ItemNameOverride ?? item.ItemName,
                                  item.ItemNameEn,
                                  item.Item
                                )
                              ) : (
                                <div className="flex items-center gap-2 min-w-[280px]">
                                  <input
                                    type="text"
                                    value={item.ItemNameOverride ?? item.ItemName}
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
                                    placeholder={item.ItemName}
                                  />
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
                                    className="btn-secondary text-xs whitespace-nowrap"
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
                          <td className="px-3 py-2 text-right">
                            {isReadOnly ? (
                              item.Quantity
                            ) : (
                              <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9.]*"
                                value={formatThousandsTR(String(item.Quantity))}
                                ref={(el) => {
                                  const key = `${rowIndex}-2`;
                                  if (el) quoteGridRefs.current.set(key, el);
                                  else quoteGridRefs.current.delete(key);
                                }}
                                onFocus={(e) => {
                                  setActiveQuoteGridCell({ row: rowIndex, col: 2 });
                                  e.currentTarget.select();
                                }}
                                onKeyDown={(e) => handleQuoteGridKeyDown(e, rowIndex, 2)}
                                onChange={(e) => {
                                  const { numeric } = normalizeMaskedIntegerTR(e.target.value, { maxDigits: 9, min: 1 });
                                  const v = numeric;
                                  if (item.kind === 'inventory') {
                                    updateQuoteItemQuantity(item.ItemId, v);
                                  } else {
                                    setQuoteItems((prev) =>
                                      prev.map((x) =>
                                        x.kind === 'manual' && x.ClientId === item.ClientId
                                          ? { ...x, Quantity: Math.max(1, Math.floor(v)) }
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
                          <td className="px-3 py-2 text-right text-text-secondary">
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
                          <td className="px-3 py-2 text-right">
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
                          <td className="px-3 py-2 text-right font-medium text-green-500">
                            {formatCurrency(lineTotal)}
                          </td>
                          <td className="px-2 py-2 text-center">
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

          {/* Alt kısım: finansal özet */}
          <section className="rounded-xl border border-background-border bg-background-panel p-4 shadow-sm shrink-0">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5 text-sm">
              <div>
                <div className="text-text-secondary mb-1">Ara Toplam</div>
                <div className="font-semibold text-text-primary">
                  {formatCurrency(subtotal)}
                </div>
              </div>
              <div>
                <div className="text-text-secondary mb-1">
                  Toplam İskonto
                </div>
                <div className="font-semibold text-red-300">
                  -{formatCurrency(discountAmount)}
                </div>
              </div>
              <div>
                <div className="text-text-secondary mb-1">İskontolu Toplam</div>
                <div className="font-semibold text-text-primary">
                  {formatCurrency(discountedTotal)}
                </div>
              </div>
              <div>
                <div className="text-text-secondary mb-1">
                  KDV Toplam ({vatRate || 0}%)
                </div>
                <div className="font-semibold text-yellow-300">
                  {formatCurrency(vatAmount)}
                </div>
              </div>
              <div>
                <div className="text-text-secondary mb-1">Genel Toplam</div>
                <div className="text-2xl font-bold text-green-400">
                  {formatCurrency(grandTotal)}
                </div>
              </div>
            </div>
            {quoteType === 'RENTAL' && (
              <div className="mt-2 text-xs text-text-secondary">
                ({billedDays} gün üzerinden hesaplanmıştır)
              </div>
            )}
          </section>
        </div>
      </div>
      <ConfirmModal
        open={showDeleteConfirm}
        title="Onaylıyor musunuz?"
        message="Bu teklifi silmek istediğinizden emin misiniz?"
        variant="danger"
        loading={isBusy}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      <ConfirmModal
        open={showCloneConfirm}
        title="Teklifi Kopyala"
        message={
          activeQuote?.QuoteCode
            ? `"${activeQuote.QuoteCode}" teklifini yeni bir taslak teklif olarak kopyalamak istiyor musunuz?\n\nYeni teklifin durumu "Beklemede" olur, teklif kodu boş gelir; tüm fiyatlar ve kalemler aynen kopyalanır.`
            : 'Bu teklifi yeni bir taslak teklif olarak kopyalamak istiyor musunuz?\n\nYeni teklifin durumu "Beklemede" olur, teklif kodu boş gelir; tüm fiyatlar ve kalemler aynen kopyalanır.'
        }
        confirmLabel="Kopyala"
        cancelLabel="Vazgeç"
        loading={isCloning}
        onConfirm={handleCloneQuoteConfirm}
        onCancel={handleCloneQuoteCancel}
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
              <div
                role="alert"
                className="mb-4 rounded-lg border border-red-600/60 bg-red-950/45 p-3 text-sm text-red-100 whitespace-pre-wrap"
              >
                {convertModalError}
              </div>
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

            <div className="space-y-3 mb-4">
              <div className="rounded-lg border border-background-border p-3 space-y-2">
                <div className="text-sm font-medium text-text-primary">Stok dusumu</div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="decrementStock"
                    checked={decrementStock === true}
                    onChange={() => setDecrementStock(true)}
                    className="rounded-full"
                  />
                  <span className="text-sm">Stok dusulsun</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="decrementStock"
                    checked={decrementStock === false}
                    onChange={() => setDecrementStock(false)}
                    className="rounded-full"
                  />
                  <span className="text-sm">Stok dusulmesin</span>
                </label>
              </div>

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
                />
                <span className="text-sm">Tüm kalemler tek depodan çıksın (varsayılan depo)</span>
              </label>
              {convertMode === 'defaultWarehouse' && (
                <div className="ml-6">
                  <select
                    value={defaultWarehouseIdForConvert}
                    onChange={(e) => setDefaultWarehouseIdForConvert(Number(e.target.value) || '')}
                    className="input w-full max-w-xs"
                  >
                    <option value="">Depo seçin</option>
                    {warehouses.map((wh) => (
                      <option key={wh.WarehouseId} value={wh.WarehouseId}>
                        {wh.WarehouseName}
                      </option>
                    ))}
                  </select>
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
                      <div className="space-y-2">
                        {assignments.map((a, idx) => (
                          <div key={idx} className="flex gap-2 items-center">
                            <select
                              value={a.WarehouseId}
                              onChange={(e) =>
                                updateWarehouseAssignment(
                                  item.ItemId,
                                  idx,
                                  'WarehouseId',
                                  Number(e.target.value)
                                )
                              }
                              className="input flex-1"
                            >
                              {warehouses.map((wh) => (
                                <option key={wh.WarehouseId} value={wh.WarehouseId}>
                                  {wh.WarehouseName}
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
                              }}
                              className="input w-24"
                              placeholder="Adet"
                            />
                            <button
                              onClick={() => removeWarehouseAssignment(item.ItemId, idx)}
                              className="text-error hover:text-red-700 text-xl px-1 inline-flex items-center justify-center"
                            >
                              <XIcon size={18} weight="regular" aria-hidden />
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => addWarehouseAssignment(item.ItemId)}
                          className="btn-secondary text-sm px-3 py-1"
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
                  decrementStock == null ||
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
          onClose={async () => {
            setIsContractModalOpen(false);
            setConvertedContract(null);
            await onDataChanged?.();
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
                <label className="block text-xs font-medium text-text-primary mb-1">Varsayılan İskonto (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className="input w-full"
                  value={newPackageDiscount}
                  onChange={(e) => setNewPackageDiscount(Number(e.target.value) || 0)}
                />
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
