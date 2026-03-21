import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuthStore } from '../../store/authStore';
import { CheckIcon, ClipboardIcon, XIcon } from '@phosphor-icons/react';
import {
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
import { quoteTemplateService } from '../../services/quoteTemplateService';
import { customerService } from '../../services/customerService';
import { getApiErrorMessage } from '../../utils/apiError';
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

interface QuoteDetailModalProps {
  quote: Quote | null;
  isNew: boolean;
  onClose: () => void;
}

export default function QuoteDetailModal({ quote, isNew, onClose }: QuoteDetailModalProps) {
  const [isReadOnly, setIsReadOnly] = useState(!isNew);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [availableItems, setAvailableItems] = useState<Inventory[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | ''>('');
  const [sites, setSites] = useState<ConstructionSite[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<number | ''>('');
  const [sitesLoading, setSitesLoading] = useState(false);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [plannedEndDate, setPlannedEndDate] = useState(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [quoteItems, setQuoteItems] = useState<QuoteLineItem[]>([]);
  const [status, setStatus] = useState<QuoteStatus>(QuoteStatus.Pending);
  const [notes, setNotes] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  // Sözleşmeye dönüştürme - depo atama: 'global' | 'defaultWarehouse' | 'perItem'
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [convertMode, setConvertMode] = useState<'global' | 'defaultWarehouse' | 'perItem'>('global');
  const [defaultWarehouseIdForConvert, setDefaultWarehouseIdForConvert] = useState<number | ''>('');
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
  const [currency, setCurrency] = useState<'TRY' | 'EUR'>('TRY');

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

  useEffect(() => {
    loadData();
    loadTemplates();
    loadPackages();
  }, []);

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
      setSelectedSiteId(source.SiteId || '');
      setStartDate(source.StartDate.split('T')[0]);
      setPlannedEndDate(source.PlannedEndDate.split('T')[0]);
      setStatus(source.Status);
      setNotes(source.Notes || '');
      setIskonto(Number.isFinite(parsedIskonto) ? parsedIskonto : 0);
      setVatRate(Number.isFinite(parsedVatRate) ? parsedVatRate : 20);
      setQuoteCode(source.QuoteCode ?? '');
      setCurrency(source.Currency === 'EUR' ? 'EUR' : 'TRY');

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
              DailyPrice: Number(detail.DailyPrice ?? 0) || 0,
            };
          }
          return {
            kind: 'inventory',
            QuoteDetailId: detail.QuoteDetailId,
            ItemId: detail.ItemId,
            Quantity: detail.Quantity,
            DailyPrice: detail.DailyPrice,
            Item: undefined,
            ItemName: detail.ItemName || '',
          };
        });
        setQuoteItems(items);
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
  }, [quote, fullQuote]);

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

  const plannedDays = Math.ceil(
    (new Date(plannedEndDate).getTime() - new Date(startDate).getTime()) /
      (1000 * 60 * 60 * 24)
  );

  const getLineTotal = (item: QuoteLineItem) => {
    if (item.kind === 'manual') return item.DailyPrice * item.Quantity;
    return item.DailyPrice * item.Quantity * plannedDays;
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
      const dailyPrice =
        currency === 'EUR'
          ? (item.MonthlyListPriceEur ?? 0) / 30
          : (item.MonthlyListPrice || 0) / 30;
      setQuoteItems([
        ...quoteItems,
        {
          kind: 'inventory',
          QuoteDetailId: 0,
          ItemId: item.ItemId,
          Quantity: qty,
          DailyPrice: dailyPrice,
          Item: item,
          ItemName: item.ItemName,
        },
      ]);
      setItemIskonto((prev) => ({ ...prev, [item.ItemId]: iskonto }));
    }
    setLastAddedItemIds((prev) => [...prev.filter((id) => id !== item.ItemId), item.ItemId]);
  };

  useEffect(() => {
    if (lastAddedItemIds.length === 0) return;
    const t = setTimeout(() => setLastAddedItemIds([]), 1600);
    return () => clearTimeout(t);
  }, [lastAddedItemIds]);

  const handleRemoveItem = (itemId: number) => {
    setQuoteItems(quoteItems.filter((i) => !(i.kind === 'inventory' && i.ItemId === itemId)));
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
    const validationError = firstValidationError([
      validateRequired(String(selectedCustomerId || ''), 'Müşteri'),
      validateDate(startDate, 'Başlangıç tarihi', true),
      validateDate(plannedEndDate, 'Planlanan bitiş tarihi', true),
      validateNumber(iskonto, 'İskonto', { min: 0, max: 100 }),
      validateNumber(vatRate, 'KDV', { min: 0, max: 100 }),
    ]);
    if (validationError) {
      alert(validationError);
      return;
    }
    if (quoteItems.length === 0) {
      alert('En az bir malzeme veya manuel kalem eklemelisiniz.');
      return;
    }

    if (sites.length > 0 && !selectedSiteId) {
      alert('Bu müşterinin şantiyeleri bulunuyor. Lütfen bir şantiye seçin.');
      return;
    }

    try {
      setIsBusy(true);
      const details = quoteItems.map((item) => {
        if (item.kind === 'manual') {
          return {
            is_manual: true,
            Description: item.Description,
            Quantity: item.Quantity,
            DailyPrice: item.DailyPrice,
          };
        }
        return {
          ItemId: item.ItemId,
          Quantity: item.Quantity,
        };
      });

      const requestBody: Record<string, unknown> = {
        CustomerId: Number(selectedCustomerId),
        StartDate: new Date(startDate).toISOString(),
        PlannedEndDate: new Date(plannedEndDate).toISOString(),
        Status: status,
        Notes: normalizeText(notes) || undefined,
        Iskonto: iskonto,
        VatRate: vatRate,
        Currency: currency,
        details,
      };

      if (selectedSiteId) {
        requestBody.SiteId = Number(selectedSiteId);
      }
      if (normalizeText(quoteCode)) {
        requestBody.QuoteCode = normalizeText(quoteCode);
      }

      if (isNew) {
        const result = await quoteService.createAsync(requestBody as any);
        alert(`Teklif başarıyla oluşturuldu! (ID: ${result.QuoteId})`);
      } else if (quote) {
        const updateBody: Record<string, unknown> = {
          Status: status,
          Iskonto: iskonto,
          VatRate: vatRate,
          Currency: currency,
        };
        if (selectedSiteId) {
          updateBody.SiteId = Number(selectedSiteId);
        }
        if (normalizeText(quoteCode)) {
          updateBody.QuoteCode = normalizeText(quoteCode);
        }
        await quoteService.updateAsync(quote.QuoteId, updateBody as any);
        alert('Teklif başarıyla güncellendi!');
      }
      onClose();
    } catch (error) {
      console.error('Save quote error:', error);
      alert(getApiErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteClick = () => {
    if (!quote) return;
    if (quote.ConvertedContractId) {
      alert('Sözleşmeye dönüştürülmüş teklifler silinemez.');
      return;
    }
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!quote) return;
    try {
      setIsBusy(true);
      await quoteService.deleteAsync(quote.QuoteId);
      setShowDeleteConfirm(false);
      onClose();
    } catch (error) {
      console.error('Delete quote error:', error);
      alert(getApiErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleAccept = async () => {
    if (!quote) return;

    try {
      setIsBusy(true);
      await quoteService.acceptQuoteAsync(quote.QuoteId);
      setStatus(QuoteStatus.Accepted);
      alert('Teklif kabul edildi!');
      onClose();
    } catch (error) {
      console.error('Accept quote error:', error);
      alert(getApiErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleReject = async () => {
    if (!quote) return;

    try {
      setIsBusy(true);
      await quoteService.rejectQuoteAsync(quote.QuoteId);
      setStatus(QuoteStatus.Rejected);
      alert('Teklif reddedildi.');
      onClose();
    } catch (error) {
      console.error('Reject quote error:', error);
      alert(getApiErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const openConvertModal = () => {
    if (!quote || quote.Status !== QuoteStatus.Accepted || quote.ConvertedContractId) return;
    setShowConvertModal(true);
    setPerItemAssignments({});
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
    if (!quote) return;

    if (quote.Status !== QuoteStatus.Accepted) {
      alert('Sadece kabul edilmiş teklifler sözleşmeye dönüştürülebilir.');
      return;
    }

    if (quote.ConvertedContractId) {
      alert('Bu teklif zaten sözleşmeye dönüştürülmüş.');
      return;
    }

    if (convertMode === 'defaultWarehouse' && !defaultWarehouseIdForConvert) {
      alert('Tüm kalemler tek depodan çıkacaksa lütfen bir depo seçin.');
      return;
    }

    let options: { warehouseAssignments?: WarehouseAssignment[]; defaultWarehouseId?: number } | undefined;

    if (convertMode === 'defaultWarehouse' && defaultWarehouseIdForConvert) {
      options = { defaultWarehouseId: Number(defaultWarehouseIdForConvert) };
    } else if (convertMode === 'perItem') {
      const assignments: WarehouseAssignment[] = [];
      for (const item of quoteItems) {
        if (item.kind !== 'inventory') continue;
        const itemAssignments = perItemAssignments[item.ItemId] ?? [];
        const total = itemAssignments.reduce((s, a) => s + a.Quantity, 0);
        if (total !== item.Quantity) {
          alert(
            `"${item.ItemName}" için atanan toplam miktar (${total}) teklif miktarı (${item.Quantity}) ile eşleşmiyor.`
          );
          return;
        }
        for (const a of itemAssignments) {
          if (a.Quantity > 0) {
            assignments.push({ ItemId: item.ItemId, WarehouseId: a.WarehouseId, Quantity: a.Quantity });
          }
        }
      }
      options = assignments.length > 0 ? { warehouseAssignments: assignments } : undefined;
    }
    // convertMode === 'global' => options undefined (boş body)

    try {
      setIsBusy(true);
      const result = await quoteService.convertToContractAsync(quote.QuoteId, options);
      setShowConvertModal(false);
      alert(`Teklif başarıyla sözleşmeye dönüştürüldü!\nSözleşme ID: ${result.ContractId}`);
      onClose();
    } catch (error: unknown) {
      console.error('Convert quote error:', error);
      const msg = getApiErrorMessage(error);
      alert(msg || 'Dönüştürme hatası. Envanterde yeterli stok olduğundan emin olun.');
    } finally {
      setIsBusy(false);
    }
  };

  const formatCurrency = (amount: number) => {
    const formatted = amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return currency === 'EUR' ? `€${formatted}` : `₺${formatted}`;
  };

  const handlePreviewDocument = async () => {
    if (!quote || !selectedTemplateId) {
      alert('Önizleme için bir şablon seçmelisiniz');
      return;
    }
    try {
      setIsBusy(true);
      const blob = await quoteService.previewDocumentAsync(quote.QuoteId, Number(selectedTemplateId));
      if (blob.size === 0) {
        alert('Sunucu boş yanıt döndürdü (boyut: 0).');
        return;
      }
      const isPdf = blob.type === 'application/pdf' || blob.type === '';
      if (!isPdf && blob.size < 10000) {
        const text = await blob.text();
        try {
          const j = JSON.parse(text);
          alert('Önizleme hatası: ' + (j.message || text.slice(0, 200)));
        } catch {
          alert('Sunucu PDF döndürmedi. Content-Type: ' + (blob.type || '(boş)'));
        }
        return;
      }
      const url = window.URL.createObjectURL(blob);
      setPdfPreviewUrl(url);
      setShowPdfPreview(true);
    } catch (error) {
      console.error('Preview document error:', error);
      alert(getApiErrorMessage(error) || 'Önizleme hatası');
    } finally {
      setIsBusy(false);
    }
  };

  const handleCloneQuote = async () => {
    if (!quote?.QuoteId) return;
    try {
      setIsBusy(true);
      const result = await quoteService.cloneQuoteAsync(quote.QuoteId);
      alert(`${result.message || 'Teklif başarıyla kopyalandı.'}\nYeni Teklif ID: ${result.QuoteId}`);
      onClose();
    } catch (error) {
      console.error('Clone quote error:', error);
      alert(getApiErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleCreateFromPackage = async () => {
    const validationError = firstValidationError([
      validateRequired(String(selectedPackageId || ''), 'Paket'),
      validateRequired(String(selectedCustomerId || ''), 'Müşteri'),
      validateDate(startDate, 'Başlangıç tarihi', true),
      validateDate(plannedEndDate, 'Planlanan bitiş tarihi', true),
    ]);
    if (validationError) {
      alert(validationError);
      return;
    }
    if (sites.length > 0 && !selectedSiteId) {
      alert('Bu müşterinin şantiyeleri bulunuyor. Lütfen bir şantiye seçin.');
      return;
    }
    try {
      setIsBusy(true);
      const detail = await packageService.getByIdAsync(selectedPackageId);
      const packageItems = detail.items ?? detail.Items ?? [];

      if (packageItems.length === 0) {
        alert('Seçili paket içinde ürün bulunamadı.');
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

        const dailyPrice =
          currency === 'EUR'
            ? (inv.MonthlyListPriceEur ?? 0) / 30
            : (inv.MonthlyListPrice || 0) / 30;

        const existing = nextItems.find((x) => x.kind === 'inventory' && x.ItemId === itemId);
        if (existing && existing.kind === 'inventory') {
          existing.Quantity += quantity;
        } else {
          nextItems.push({
            kind: 'inventory',
            QuoteDetailId: 0,
            ItemId: itemId,
            Quantity: quantity,
            DailyPrice: dailyPrice,
            Item: inv,
            ItemName: inv.ItemName,
          });
        }
      }

      if (nextItems.length === 0) {
        alert('Paketten aktarılabilecek geçerli ürün bulunamadı.');
        return;
      }

      setQuoteItems(nextItems);
      const packageDiscount = Number(detail.DefaultDiscount ?? 0) || 0;
      handleGlobalIskontoChange(Math.max(0, Math.min(100, packageDiscount)));

      const message =
        missingCount > 0
          ? `Paket uygulandı. ${missingCount} kalem envanterde bulunamadığı için atlandı.\nLütfen kontrol edip Kaydet'e basın.`
          : "Paket ürünleri eklendi. Lütfen kontrol edip Kaydet'e basın.";
      alert(message);
    } catch (error) {
      console.error('Apply package to quote form error:', error);
      alert(getApiErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleCreatePackageFromCurrentQuote = async () => {
    const inventoryItems = quoteItems.filter((i): i is Extract<QuoteLineItem, { kind: 'inventory' }> => i.kind === 'inventory');
    if (!normalizeText(newPackageName)) {
      alert('Paket adı zorunludur.');
      return;
    }
    if (inventoryItems.length === 0) {
      alert('Paket oluşturmak için teklifte en az bir envanter ürünü olmalıdır.');
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
      alert('Paket başarıyla oluşturuldu.');
    } catch (error) {
      console.error('Create package error:', error);
      alert(getApiErrorMessage(error));
    } finally {
      setIsCreatingPackage(false);
    }
  };

  const handleGenerateDocument = async (format: 'pdf' | 'docx' = 'pdf') => {
    if (!quote || !selectedTemplateId) {
      alert('Döküman oluşturmak için bir şablon seçmelisiniz');
      return;
    }
    try {
      setIsBusy(true);
      const blob = await quoteService.generateDocumentAsync(
        quote.QuoteId,
        Number(selectedTemplateId),
        format
      );
      if (blob.size === 0) {
        alert('Belge oluşturulamadı (sunucu boş yanıt döndü).');
        return;
      }
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `teklif_${quote.QuoteId}.${format}`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Generate document error:', error);
      alert(getApiErrorMessage(error) || 'Döküman oluşturma hatası');
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
      <header className="shrink-0 flex items-center justify-between px-6 py-4 bg-background-panel border-b border-background-border shadow-sm">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-text-primary tracking-tight">
            {isNew ? 'Yeni Teklif' : 'Teklif Detayı'}
          </h1>
          {!isNew && getStatusBadge()}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-lg text-text-secondary hover:bg-background-hover hover:text-text-primary transition-colors"
          aria-label="Kapat"
        >
          <XIcon size={22} weight="regular" />
        </button>
      </header>

      <div className="flex-1 overflow-auto">
        <div className="w-full max-w-6xl mx-auto p-6 space-y-4">
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
                <label className="block text-xs font-medium text-text-primary">Müşteri Seçimi *</label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(Number(e.target.value) || '')}
                  disabled={isReadOnly}
                  className="input w-full text-sm py-1.5"
                  required
                >
                  <option value="">Müşteri seçin</option>
                  {customers.map((customer) => (
                    <option key={customer.CustomerId} value={customer.CustomerId}>
                      {customer.Name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedCustomerId && (
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
                      required={sites.length > 0}
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

              <div className="space-y-0.5">
                <label className="block text-xs font-medium text-text-primary">Başlangıç Tarihi</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={isReadOnly}
                  className="input w-full text-sm py-1.5"
                />
              </div>

              <div className="space-y-0.5">
                <label className="block text-xs font-medium text-text-primary">Planlanan Bitiş</label>
                <input
                  type="date"
                  value={plannedEndDate}
                  onChange={(e) => setPlannedEndDate(e.target.value)}
                  disabled={isReadOnly}
                  className="input w-full text-sm py-1.5"
                />
              </div>

              <div className="space-y-0.5">
                <label className="block text-xs font-medium text-text-primary">Teklif Sahibi</label>
                <div className="input w-full bg-background-secondary text-text-secondary py-1.5 px-2 text-xs rounded-lg border border-background-border">
                  {currentUser?.FullName || currentUser?.Username || '—'}
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
                  onChange={(e) => setCurrency(e.target.value as 'TRY' | 'EUR')}
                  disabled={isReadOnly}
                  className="input w-full text-sm py-1.5"
                >
                  <option value="TRY">TRY (TL)</option>
                  <option value="EUR">EUR (€)</option>
                </select>
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

              {!isReadOnly && (
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
                    {selectedTemplateId && (
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
                            alert(getApiErrorMessage(error));
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
                  </div>
                </div>
              )}
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
                <span>
                  <span className="font-medium text-text-primary">Planlanan Süre:</span> {plannedDays} gün
                </span>
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
                          alert('Bu şablonda zaten malzeme tablosu placeholder\'ı mevcut.');
                          return;
                        }
                        const placeholderNode = {
                          type: 'paragraph',
                          content: [{ type: 'text', text: '{{malzemeTablosu}}' }],
                        };
                        content.content.push(placeholderNode);
                        await quoteTemplateService.updateAsync(template.TemplateId, { Content: content });
                        await loadTemplates();
                        alert('Malzeme tablosu şablona eklendi!');
                      } catch (error) {
                        console.error('Add material table error:', error);
                        alert(getApiErrorMessage(error));
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
                {!isNew && quote && selectedTemplateId && (
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
                    {!quote?.ConvertedContractId && (
                      <button onClick={handleCloneQuote} disabled={isBusy} className="btn-secondary">
                        Teklifi Kopyala
                      </button>
                    )}
                    {status === QuoteStatus.Pending && !quote?.ConvertedContractId && (
                      <button
                        onClick={() => setIsReadOnly(false)}
                        className="btn-primary"
                      >
                        Düzenle
                      </button>
                    )}
                    {status === QuoteStatus.Pending && !quote?.ConvertedContractId && (
                      <>
                        <button
                          onClick={handleAccept}
                          disabled={isBusy}
                          className="btn-success"
                        >
                          Kabul Et
                        </button>
                        <button
                          onClick={handleReject}
                          disabled={isBusy}
                          className="btn-danger"
                        >
                          Reddet
                        </button>
                      </>
                    )}
                    {status === QuoteStatus.Accepted && !quote?.ConvertedContractId && (
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
                    {!isNew && quote && status === QuoteStatus.Pending && (
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
          {quote?.ConvertedContractId && (
            <section className="rounded-xl border border-background-border bg-green-900/30 p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="text-green-300 shrink-0">
                  <CheckIcon size={20} weight="bold" aria-hidden />
                </span>
                <span>
                  Bu teklif sözleşmeye dönüştürüldü (Sözleşme #{quote.ConvertedContractId})
                </span>
              </div>
            </section>
          )}

          {/* Orta kısım: ürün tablosu */}
          <section className="rounded-xl border border-background-border bg-background-panel shadow-sm flex-1 min-h-[260px] flex flex-col overflow-hidden">
            <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider px-4 pt-4 pb-2 border-b border-background-border shrink-0">
              Teklif Kalemleri
            </h3>
            <div className="border-0 rounded-b-xl overflow-auto flex-1 min-h-0">
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 bg-background-secondary z-10 border-b border-background-border">
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
                      Birim Fiyat
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
                    quoteItems.map((item) => {
                      const itemCode =
                        item.kind === 'inventory'
                          ? availableItems.find((i) => i.ItemId === item.ItemId)?.ItemCode ?? '—'
                          : '—';
                      const lineTotal = getLineTotal(item);
                      const justAdded =
                        item.kind === 'inventory' ? lastAddedItemIds.includes(item.ItemId) : false;
                      return (
                        <tr
                          key={item.kind === 'inventory' ? `inv-${item.ItemId}` : `man-${item.ClientId}`}
                          className={`border-b border-background-border hover:bg-background-hover/50 transition-colors duration-300 ${
                            justAdded ? 'bg-green-500/20' : ''
                          }`}
                        >
                          <td className="px-3 py-2 text-text-secondary">{itemCode}</td>
                          <td className="px-3 py-2 font-medium">
                            {item.kind === 'inventory' ? item.ItemName : item.Description}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {isReadOnly ? (
                              item.Quantity
                            ) : (
                              <input
                                type="number"
                                min={1}
                                value={item.Quantity}
                                onChange={(e) => {
                                  const v = Number(e.target.value) || 1;
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
                                className="input w-16 text-right py-1 text-sm"
                                aria-label="Miktar"
                              />
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-text-secondary">
                            {formatCurrency(item.DailyPrice)}/gün
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
                                onChange={(e) => {
                                  const v = parseFloat(e.target.value);
                                  if (item.kind === 'inventory') {
                                    updateQuoteItemIskonto(item.ItemId, Number.isFinite(v) ? v : 0);
                                  } else {
                                    setIskonto(Number.isFinite(v) ? v : 0);
                                  }
                                }}
                                className="input w-16 text-right py-1 text-sm"
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
            <div className="mt-2 text-xs text-text-secondary">
              ({plannedDays} gün üzerinden hesaplanmıştır)
            </div>
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
      {/* Sözleşmeye Dönüştür - Depo Atama Modal */}
      {showConvertModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60]">
          <div className="bg-background-panel rounded-panel w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">Sözleşmeye Dönüştür – Stok / Depo</h3>
            <p className="text-sm text-text-secondary mb-4">
              Stok güncellemesi nasıl yapılsın? Sadece global envanter, tümü tek depodan veya ürün bazlı depo ataması seçebilirsiniz.
            </p>

            <div className="space-y-3 mb-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="convertMode"
                  checked={convertMode === 'global'}
                  onChange={() => setConvertMode('global')}
                  className="rounded-full"
                />
                <span className="text-sm">Sadece global envanter güncellensin (depo stoğu değişmesin)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="convertMode"
                  checked={convertMode === 'defaultWarehouse'}
                  onChange={() => setConvertMode('defaultWarehouse')}
                  className="rounded-full"
                />
                <span className="text-sm">Tüm kalemler tek depodan çıksın</span>
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
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="convertMode"
                  checked={convertMode === 'perItem'}
                  onChange={() => setConvertMode('perItem')}
                  className="rounded-full"
                />
                <span className="text-sm">Ürün bazlı depo ataması yap</span>
              </label>
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
                        {item.ItemName} — Toplam: {item.Quantity} adet
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
                onClick={() => setShowConvertModal(false)}
                className="btn-secondary flex-1"
              >
                İptal
              </button>
              <button
                onClick={handleConvertToContract}
                disabled={
                  isBusy ||
                  (convertMode === 'defaultWarehouse' && !defaultWarehouseIdForConvert) ||
                  (convertMode === 'perItem' &&
                    quoteItems
                      .filter((q) => q.kind === 'inventory')
                      .some((q) => getAssignmentTotalForItem(q.ItemId) !== q.Quantity))
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
        onItemSelect={addItemFromPicker}
        displayMode="quote"
        currency={currency}
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
              DailyPrice: data.DailyPrice,
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
        downloadFileName={`teklif_${quote?.QuoteId ?? ''}.pdf`}
        onClose={closePdfPreview}
      />
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
