import { useState, useEffect, useMemo, Fragment, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CheckIcon, ClipboardIcon, DotsSixVerticalIcon, XIcon } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';
import {
  AuditLog,
  Contract,
  ContractQuoteType,
  Customer,
  Inventory,
  MaterialCategory,
  ContractLineItem,
  InventoryContractLineItem,
  ConstructionSite,
  ReturnItemResponse,
  ContractReturn,
  ContractPriceCalculation,
  ContractTemplate,
  Warehouse,
  resolveContractQuoteType,
  isContractActive,
  isContractCancelled,
  isContractCompleted,
  isContractArchived,
  isContractArchivable,
  pickContractArchivedAt,
} from '../../models';
import { contractService } from '../../services/contractService';
import { customerService } from '../../services/customerService';
import { inventoryService } from '../../services/inventoryService';
import { warehouseService } from '../../services/warehouseService';
import { siteService } from '../../services/siteService';
import { contractTemplateService } from '../../services/contractTemplateService';
import ContractTemplateEditorModal from './ContractTemplateEditorModal';
import PdfPreviewModal from './PdfPreviewModal';
import AuditLogTimeline from '../AuditLogTimeline';
import ConfirmModal from './ConfirmModal';
import ProductPickerModal from './ProductPickerModal';
import { getApiErrorMessage, getApiFieldErrors, getUserFacingApiErrorMessage, isArchivedInventoryApiError, userMessageForCustomerRelatedApiError } from '../../utils/apiError';
import { formatInventoryLineBilingualLabel, formatMoney, formatShortDateTime } from '../../utils/formatters';
import { discountPercentFromNet, lineDiscountAmount, lineNetFromGross } from '../../utils/lineDiscount';
import { toast } from '../../hooks/useToast';
import { firstValidationError, normalizeText, validateDate, validateNumber, validateRequired } from '../../utils/validation';
import { extractFirstQuotedName, isStockErrorMessage } from '../../utils/parseStockError';
import StockErrorPanel from '../StockErrorPanel';
import { useAuthStore } from '../../store/authStore';
import ManualLineItemModal from './ManualLineItemModal';
import CustomerSearchField from '../CustomerSearchField';
import SiteSelectField from '../SiteSelectField';
import SettleNonReturnModal from './SettleNonReturnModal';
import InventoryDetailModal from './InventoryDetailModal';
import ContractAddendaPanel from '../contracts/ContractAddendaPanel';
import { addendumService } from '../../services/addendumService';
import { buildContractItemDisplayEntries, type AddendumLineSource } from '../../utils/addendum';
import {
  filterContractTemplatesByKind,
  partitionContractTemplates,
  pickDefaultTemplateId,
  type ContractDocumentKind,
} from '../../utils/documentTemplates';
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
import { LINE_ITEM_COL, LINE_ITEM_COL_SPAN } from '../../constants/lineItemTableColumns';

interface ContractDetailModalProps {
  contract: Contract | null;
  isNew: boolean;
  onClose: () => void;
  initialTab?: 'info' | 'return' | 'returns' | 'history' | 'addenda';
  /** Yeni sözleşme: menüden gelen varsayılan tip (kiralama / satış sayfası) */
  defaultTypeForNew?: ContractQuoteType;
  /** true ise yeni kayıtta tip seçilemez (ayrı menü sayfaları) */
  lockNewContractType?: boolean;
  initiallyFullScreen?: boolean;
  onDataChanged?: (hint?: { quoteReleased?: boolean }) => void | Promise<void>;
  /** Teklif modalı üzerinden açıldığında üst katmanda göster */
  stackAboveParent?: boolean;
  /** Kaynak teklife git — parent doğrudan teklif modalını açar */
  onOpenSourceQuote?: (quoteId: number) => void | Promise<void>;
}

function unitPriceForContractInventory(
  inv: Inventory,
  cur: 'TRY' | 'EUR' | 'USD',
  cType: ContractQuoteType
): number {
  if (cType === 'SALE') {
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

export default function ContractDetailModal({
  contract,
  isNew,
  onClose,
  initialTab = 'info',
  defaultTypeForNew,
  lockNewContractType,
  initiallyFullScreen,
  onDataChanged,
  stackAboveParent = false,
  onOpenSourceQuote,
}: ContractDetailModalProps) {
  const navigate = useNavigate();
  const [isFullScreen] = useState(Boolean(initiallyFullScreen));
  void isFullScreen; // tam ekran düğmesi kaldırıldı; prop uyumluluğu için state korunuyor
  const [isReadOnly, setIsReadOnly] = useState(!isNew);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [availableItems, setAvailableItems] = useState<Inventory[]>([]);
  const [inventoryCategories, setInventoryCategories] = useState<MaterialCategory[]>([]);
  const [selectedInventoryForDetail, setSelectedInventoryForDetail] = useState<Inventory | null>(null);
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
  const [startDate, setStartDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [plannedEndDate, setPlannedEndDate] = useState(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [actualEndDate, setActualEndDate] = useState<string>('');
  const [contractItems, setContractItems] = useState<ContractLineItem[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | ''>('');
  const [isBusy, setIsBusy] = useState(false);

  // İade işlemi state'leri - returnDetailKey: "itemId-warehouseId" formatında
  const [returnDetailKey, setReturnDetailKey] = useState<string | null>(null);
  const [returnWarehouseId, setReturnWarehouseId] = useState<number | ''>('');
  /** İade miktarı inputu – sadece rakam */
  const [returnQuantityStr, setReturnQuantityStr] = useState<string>('1');
  const [returnDate, setReturnDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [isReturning, setIsReturning] = useState(false);

  // Sanal İade İşlemi state'leri
  const [settleItem, setSettleItem] = useState<{ item: InventoryContractLineItem, remainingOnRent: number } | null>(null);

  // İade geçmişi state'leri
  const [contractReturns, setContractReturns] = useState<ContractReturn[]>([]);
  const [returnsLoading, setReturnsLoading] = useState(false);

  // Fiyat hesaplama state'leri
  const [priceCalculation, setPriceCalculation] = useState<ContractPriceCalculation | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  // Şablon yönetimi state'leri
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [documentKind, setDocumentKind] = useState<ContractDocumentKind>('contract');
  const [selectedContractTemplateId, setSelectedContractTemplateId] = useState<number | ''>('');
  const [selectedExtreTemplateId, setSelectedExtreTemplateId] = useState<number | ''>('');
  const [isTemplateEditorOpen, setIsTemplateEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ContractTemplate | null>(null);
  const [isNewTemplate, setIsNewTemplate] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'return' | 'returns' | 'history' | 'addenda'>(
    initialTab
  );
  const [pendingOpenAddendumCreate, setPendingOpenAddendumCreate] = useState(false);
  const [contractLogs, setContractLogs] = useState<AuditLog[]>([]);
  const [contractLogsLoading, setContractLogsLoading] = useState(false);
  const [fullContract, setFullContract] = useState<Contract | null>(null);
  const [showCancelReasonModal, setShowCancelReasonModal] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelReasonError, setCancelReasonError] = useState<string | null>(null);
  const [showReturnConfirm, setShowReturnConfirm] = useState(false);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [showRevertConfirm, setShowRevertConfirm] = useState(false);
  const [showRevertRetryConfirm, setShowRevertRetryConfirm] = useState(false);
  const [revertRetryMessage, setRevertRetryMessage] = useState<string>('');
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archiveReason, setArchiveReason] = useState('');
  const [archiveReasonError, setArchiveReasonError] = useState<string | null>(null);
  const [showUnarchiveConfirm, setShowUnarchiveConfirm] = useState(false);
  const [iskonto, setIskonto] = useState<number>(0);
  /** Satır bazlı iskonto (%) - key: "ItemId-WarehouseId". Üstteki iskonto değişince tüm satırlara yansır; satırda tek tek de düzenlenebilir. */
  const [itemIskonto, setItemIskonto] = useState<Record<string, number>>({});
  /** İskontolu satır tutarı taslağı. key: "ItemId-WarehouseId" | `man-${ClientId}` */
  const [lineNetInputs, setLineNetInputs] = useState<Record<string, string>>({});
  const [vatRate, setVatRate] = useState<number>(20);
  const [contractCode, setContractCode] = useState<string>('');
  const [currency, setCurrency] = useState<'TRY' | 'EUR' | 'USD'>('TRY');
  const [contractType, setContractType] = useState<ContractQuoteType>(() => defaultTypeForNew ?? 'RENTAL');
  const [language, setLanguage] = useState<'TR' | 'EN'>('TR');
  const isRentalContract = contractType === 'RENTAL';

  const { extreTemplates } = useMemo(() => partitionContractTemplates(templates), [templates]);

  const visibleTemplates = useMemo(
    () => filterContractTemplatesByKind(templates, documentKind),
    [documentKind, templates]
  );

  const activeTemplateId = documentKind === 'extre' ? selectedExtreTemplateId : selectedContractTemplateId;

  const setActiveTemplateId = (templateId: number | '') => {
    if (documentKind === 'extre') {
      setSelectedExtreTemplateId(templateId);
      return;
    }
    setSelectedContractTemplateId(templateId);
  };

  const [showProductPickerModal, setShowProductPickerModal] = useState(false);
  const [lastAddedKeys, setLastAddedKeys] = useState<string[]>([]);
  const [priceOverrideInputs, setPriceOverrideInputs] = useState<Record<string, string>>({});
  const [dragItemIndex, setDragItemIndex] = useState<number | null>(null);
  const [dragOverItemIndex, setDragOverItemIndex] = useState<number | null>(null);
  const dragItemIndexRef = useRef<number | null>(null);
  const [activeItemsGridCell, setActiveItemsGridCell] = useState<{ row: number; col: 3 | 4 | 5 | 6 | 7 } | null>(null);
  const itemsGridRefs = useRef<Map<string, HTMLElement>>(new Map());
  /** Depo stok cache: key = "itemId-warehouseId", value = müsait stok miktarı */
  const [warehouseStockCache, setWarehouseStockCache] = useState<Record<string, number>>({});
  const [saveStockError, setSaveStockError] = useState<string | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [isEnsuringExtresiTemplate, setIsEnsuringExtresiTemplate] = useState(false);
  const [isAddingMaterialTable, setIsAddingMaterialTable] = useState(false);
  const [addendumLineSources, setAddendumLineSources] = useState<Map<number, AddendumLineSource>>(
    () => new Map()
  );
  const [showManualLineModal, setShowManualLineModal] = useState(false);
  const currentUser = useAuthStore((s) => s.user);
  const canViewContracts = Boolean(currentUser?.permissions?.includes('contracts_view'));
  const canUpdateContracts = Boolean(currentUser?.permissions?.includes('contracts_update'));
  const canRevertToQuote = Boolean(currentUser?.permissions?.includes('contracts_delete'));
  const canCancelContract = Boolean(currentUser?.permissions?.includes('contracts_delete'));
  const canDeleteContracts = Boolean(currentUser?.permissions?.includes('contracts_delete'));
  const canArchiveContract = Boolean(
    currentUser?.permissions?.includes('contracts_archive') ||
    currentUser?.permissions?.includes('contracts_delete')
  );

  const effectiveContract = fullContract ?? contract;
  const sourceQuoteId = (() => {
    const raw = effectiveContract?.SourceQuoteId ?? (effectiveContract as { sourceQuoteId?: number | null } | null)?.sourceQuoteId;
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  })();
  const sourceQuoteCode = (() => {
    const raw =
      effectiveContract?.SourceQuoteCode ??
      (effectiveContract as { sourceQuoteCode?: string | null } | null)?.sourceQuoteCode;
    if (raw == null) return null;
    const s = String(raw).trim();
    return s || null;
  })();
  const hasSourceQuote = sourceQuoteId != null;
  const archived = Boolean(effectiveContract && !isNew && isContractArchived(effectiveContract));
  const archivedAtLabel = (() => {
    const raw = effectiveContract ? pickContractArchivedAt(effectiveContract) : undefined;
    if (!raw) return '';
    try {
      return formatShortDateTime(raw);
    } catch {
      return '';
    }
  })();
  const cancelled = Boolean(effectiveContract && isContractCancelled(effectiveContract));
  const active = Boolean(effectiveContract && isContractActive(effectiveContract));
  const completed = Boolean(effectiveContract && isContractCompleted(effectiveContract));
  const archivable = Boolean(effectiveContract && !isNew && isContractArchivable(effectiveContract));

  const formatAuthorizedContactLabel = (contact: NonNullable<Customer['AuthorizedContacts']>[number]) => {
    const titlePart = contact.Title ? ` - ${contact.Title}` : '';
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

  const handleNewSiteFormChange = (field: keyof NewSiteFormState, value: string) => {
    setNewSiteForm((prev) => ({ ...prev, [field]: value }));
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



  useEffect(() => {
    loadData();
    loadTemplates();
  }, []);

  useEffect(() => {
    if (isNew) {
      setContractType(defaultTypeForNew ?? 'RENTAL');
    }
  }, [isNew, defaultTypeForNew]);

  useEffect(() => {
    // SALE sözleşmelerinde PlannedEndDate backend tarafından null yazılıyor.
    // Kullanıcı tarih seçip sonra boş görünce "kaydedilmedi" sanmasın diye state'i temizle.
    if (contractType === 'SALE') {
      setPlannedEndDate('');
    }
  }, [contractType]);

  // Mevcut sözleşme açıldığında tam detayı yükle (ContractDetails liste API'sinde gelmez)
  useEffect(() => {
    if (contract?.ContractId && !isNew) {
      let cancelled = false;
      const loadFullContract = async () => {
        try {
          const full = await contractService.getByIdAsync(contract.ContractId);
          if (!cancelled) setFullContract(full);
        } catch (err) {
          console.error('Load contract details error:', err);
          if (!cancelled) setFullContract(contract);
        }
      };
      loadFullContract();
      return () => { cancelled = true; };
    } else {
      setFullContract(null);
    }
  }, [contract?.ContractId, isNew]);

  useEffect(() => {
    if (cancelled || archived || completed) {
      setIsReadOnly(true);
    }
  }, [cancelled, archived, completed]);

  useEffect(() => {
    setShowArchiveModal(false);
    setArchiveReason('');
    setArchiveReasonError(null);
    setShowUnarchiveConfirm(false);
  }, [contract?.ContractId, isNew]);

  const refreshContract = async () => {
    if (!contract?.ContractId) return;
    const full = await contractService.getByIdAsync(contract.ContractId);
    setFullContract(full);
    await loadAddendumLineSources(contract.ContractId);
  };

  const loadAddendumLineSources = async (contractId?: number) => {
    const id = contractId ?? contract?.ContractId;
    if (!id || isNew || !canViewContracts) {
      setAddendumLineSources(new Map());
      return;
    }
    try {
      const sources = await addendumService.loadAddedLineSourcesAsync(id);
      setAddendumLineSources(sources);
    } catch (error) {
      console.error('Load addendum line sources error:', error);
      setAddendumLineSources(new Map());
    }
  };

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab, contract?.ContractId, isNew]);

  const loadContractLogs = async () => {
    if (!contract?.ContractId) return;
    try {
      setContractLogsLoading(true);
      const data = await contractService.getAuditLogsByContractAsync(contract.ContractId);
      setContractLogs(data ?? []);
    } catch (error) {
      console.error('Load contract audit logs error:', error);
      setContractLogs([]);
    } finally {
      setContractLogsLoading(false);
    }
  };

  const loadContractReturns = async () => {
    if (!isRentalContract) {
      setContractReturns([]);
      return;
    }
    if (!contract?.ContractId) return;
    try {
      setReturnsLoading(true);
      const data = await contractService.getReturnsAsync(contract.ContractId);
      setContractReturns(data ?? []);
    } catch (error) {
      console.error('Load contract returns error:', error);
      setContractReturns([]);
    } finally {
      setReturnsLoading(false);
    }
  };

  const handleCalculatePrice = async () => {
    if (!contract?.ContractId) return;
    try {
      setIsCalculating(true);
      const result = await contractService.calculatePriceAsync(contract.ContractId);
      setPriceCalculation(result);
    } catch (error) {
      console.error('Calculate price error:', error);
      toast.error(getApiErrorMessage(error) || 'Fiyat hesaplama hatası');
    } finally {
      setIsCalculating(false);
    }
  };

  useEffect(() => {
    if (contract?.ContractId && !isNew) {
      loadContractLogs();
      loadContractReturns();
      void loadAddendumLineSources(contract.ContractId);
    } else {
      setContractLogs([]);
      setContractReturns([]);
      setAddendumLineSources(new Map());
    }
  }, [contract?.ContractId, isNew, isRentalContract, canViewContracts]);

  const loadTemplates = async () => {
    try {
      const templateList = await contractTemplateService.getAllAsync();
      setTemplates(templateList);
      const partitioned = partitionContractTemplates(templateList);
      setSelectedContractTemplateId((prev) => prev || pickDefaultTemplateId(partitioned.contractTemplates));
      setSelectedExtreTemplateId((prev) => prev || pickDefaultTemplateId(partitioned.extreTemplates));
    } catch (error) {
      console.error('Load templates error:', error);
    }
  };

  const handleDocumentKindChange = async (nextKind: ContractDocumentKind) => {
    setDocumentKind(nextKind);
    if (nextKind !== 'extre') return;

    const partitioned = partitionContractTemplates(templates);
    if (partitioned.extreTemplates.length > 0) {
      if (!selectedExtreTemplateId) {
        setSelectedExtreTemplateId(pickDefaultTemplateId(partitioned.extreTemplates));
      }
      return;
    }

    try {
      setIsEnsuringExtresiTemplate(true);
      const template = await contractTemplateService.ensureKullanimExtresiTemplateAsync();
      await loadTemplates();
      setSelectedExtreTemplateId(template.TemplateId);
    } catch (error) {
      console.error('Kullanım Extresi şablon hatası:', error);
      toast.error(getApiErrorMessage(error) || 'Kullanım Extresi şablonu oluşturulamadı');
      setDocumentKind('contract');
    } finally {
      setIsEnsuringExtresiTemplate(false);
    }
  };

  useEffect(() => {
    const source = fullContract ?? contract;
    if (source) {
      setSelectedCustomerId(source.CustomerId);
      setSelectedAuthorizedContactId((source as { CustomerAuthorizedContactId?: number | null }).CustomerAuthorizedContactId ?? '');
      setSelectedSiteId(source.SiteId || '');
      setStartDate(source.StartDate ? source.StartDate.split('T')[0] : '');
      {
        const ped = source.PlannedEndDate;
        if (ped != null && String(ped).trim()) {
          setPlannedEndDate(String(ped).split('T')[0]);
        } else {
          setPlannedEndDate('');
        }
      }
      if (source.ActualEndDate) {
        setActualEndDate(source.ActualEndDate.split('T')[0]);
      }
      setIskonto((source as { Iskonto?: number }).Iskonto ?? 0);
      setVatRate((source as { VatRate?: number }).VatRate ?? 20);
      setContractCode((source as { ContractCode?: string }).ContractCode ?? '');
      setCurrency((source as { Currency?: string }).Currency === 'EUR' ? 'EUR' : (source as { Currency?: string }).Currency === 'USD' ? 'USD' : 'TRY');
      setLanguage((source as any).Language === 'EN' ? 'EN' : 'TR');
      if (!isNew) {
        setContractType(resolveContractQuoteType(source as Contract));
      }
      // Backend GET /contracts/:id "details" döndürür, ContractDetails değil
      const details = (source as any).details ?? source.ContractDetails ?? [];
      if (details.length > 0) {
        const items: ContractLineItem[] = details.map((detail: any) => {
          const isManual = detail.IsManual === true || detail.is_manual === true || detail.IsManual === 1 || detail.is_manual === 1;
          if (isManual) {
            return {
              kind: 'manual',
              ClientId: `manual-${detail.DetailId ?? crypto.randomUUID()}`,
              DetailId: detail.DetailId,
              SourceAddendumId:
                (detail.AddendumId ??
                  detail.addendumId ??
                  detail.SourceAddendumId ??
                  detail.sourceAddendumId ??
                  null) as number | null,
              SourceAddendumNo:
                (detail.AddendumNo ??
                  detail.addendumNo ??
                  detail.SourceAddendumNo ??
                  detail.sourceAddendumNo ??
                  null) as number | null,
              IsManual: true,
              Description: String(detail.Description ?? detail.description ?? '').trim() || 'Manuel Kalem',
              RentedQuantity: Number(detail.RentedQuantity ?? 1) || 1,
              UnitPriceSnapshot: Number(detail.UnitPriceSnapshot ?? detail.unitPriceSnapshot ?? 0) || 0,
              PriceUnit: (detail.PriceUnit ?? detail.priceUnit ?? (resolveContractQuoteType(source as Contract) === 'SALE' ? 'EACH' : 'DAY')) as any,
              PriceSource: (detail.PriceSource ?? detail.priceSource ?? 'MANUAL') as any,
            };
          }
          const wh = warehouses.find((w) => w.WarehouseId === detail.WarehouseId);
          return {
            kind: 'inventory',
            DetailId: detail.DetailId,
            ItemId: detail.ItemId,
            WarehouseId: detail.WarehouseId ?? 0,
            WarehouseName: wh?.WarehouseName ?? detail.WarehouseName ?? '',
            RentedQuantity: detail.RentedQuantity,
            ReturnedQuantity: detail.ReturnedQuantity,
            UnitPriceSnapshot: Number(detail.UnitPriceSnapshot ?? detail.unitPriceSnapshot ?? 0) || 0,
            PriceUnit: (detail.PriceUnit ?? detail.priceUnit ?? (resolveContractQuoteType(source as Contract) === 'SALE' ? 'EACH' : 'DAY')) as any,
            MonthlyPriceOverride:
              detail.MonthlyPriceOverride != null && Number.isFinite(Number(detail.MonthlyPriceOverride))
                ? Number(detail.MonthlyPriceOverride)
                : undefined,
            PriceSource: (detail.PriceSource ?? detail.priceSource ?? 'INVENTORY') as any,
            EffectiveStartDate: detail.EffectiveStartDate ?? detail.effectiveStartDate ?? undefined,
            SourceAddendumId:
              (detail.AddendumId ??
                detail.addendumId ??
                detail.SourceAddendumId ??
                detail.sourceAddendumId ??
                null) as number | null,
            SourceAddendumNo:
              (detail.AddendumNo ??
                detail.addendumNo ??
                detail.SourceAddendumNo ??
                detail.sourceAddendumNo ??
                null) as number | null,
            Item: undefined,
            ItemName: detail.ItemName ?? '',
            ItemNameEn: detail.ItemNameEn ?? detail.itemNameEn ?? undefined,
            ItemCode: detail.ItemCode ?? detail.itemCode ?? undefined,
            ItemCodeOverride:
              (detail.ItemCodeOverride ??
                detail.itemCodeOverride ??
                detail.ItemCode_Override ??
                detail.item_code_override ??
                null) as string | null,
            ItemNameOverride:
              (detail.ItemNameOverride ??
                detail.itemNameOverride ??
                null) as string | null,
            OverrideUnitPrice: undefined,
            OverrideMonthlyPrice:
              detail.MonthlyPriceOverride != null && Number.isFinite(Number(detail.MonthlyPriceOverride))
                ? Number(detail.MonthlyPriceOverride)
                : undefined,
          };
        });
        setContractItems(items);
        const globalIsk = (source as { Iskonto?: number }).Iskonto ?? 0;
        setItemIskonto((prev) => {
          const next = { ...prev };
          items.forEach((i) => {
            if (i.kind === 'inventory') next[`${i.ItemId}-${i.WarehouseId}`] = globalIsk;
          });
          return next;
        });
      } else {
        setContractItems([]);
      }
      // Şantiyeleri yükle
      if (source.CustomerId) {
        loadSites(source.CustomerId);
      }
    }
  }, [contract, fullContract, warehouses, isNew]);

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
    // Ürün adlarını /inventory/:id ile tek tek çekmek yerine,
    // zaten yüklenmiş olan /inventory listesinden (availableItems) eşle.
    // Böylece backend'de GET /inventory/:id olmasa bile isimler görünür.
    if (availableItems.length === 0 || contractItems.length === 0) return;

    const inventoryMap = new Map<number, Inventory>();
    for (const inv of availableItems) {
      inventoryMap.set(inv.ItemId, inv);
    }

    setContractItems((prev) => {
      let changed = false;
      const next = prev.map((item) => {
        if (item.kind === 'manual') return item;
        const inv = inventoryMap.get(item.ItemId);
        if (!inv) return item;
        const nextName =
          item.ItemName && item.ItemName !== 'Bilinmiyor' ? item.ItemName : inv.ItemName;
        const nextEn =
          item.ItemNameEn !== undefined && item.ItemNameEn !== null
            ? item.ItemNameEn
            : (inv.ItemNameEn ?? undefined);
        if (
          item.Item === inv &&
          item.ItemName === nextName &&
          (item.ItemNameEn ?? '') === (nextEn ?? '')
        ) {
          return item;
        }
        changed = true;
        return {
          ...item,
          Item: inv,
          ItemName: nextName,
          ItemNameEn: nextEn,
        };
      });
      return changed ? next : prev;
    });
  }, [availableItems, contractItems.length]);

  useEffect(() => {
    setContractItems((prev) => {
      if (prev.length === 0) return prev;
      let changed = false;
      const next = prev.map((item) => {
        if (item.kind !== 'inventory') return item;
        const inv = item.Item ?? availableItems.find((i) => i.ItemId === item.ItemId);
        if (!inv) return item;
        const dp = unitPriceForContractInventory(inv, currency, contractType);
        // Mevcut (server'dan gelen) kalemlerde snapshot'a dokunma; sadece yeni eklenenlerde senkronize et.
        const isExistingDetail = item.DetailId != null && item.DetailId > 0;
        if (isExistingDetail) {
          if (item.Item && item.ItemNameEn !== undefined) return item;
          changed = true;
          return {
            ...item,
            Item: item.Item ?? inv,
            ItemNameEn: item.ItemNameEn ?? inv.ItemNameEn ?? undefined,
          };
        }
        if (item.UnitPriceSnapshot === dp && item.Item) return item;
        changed = true;
        return {
          ...item,
          UnitPriceSnapshot: dp,
          PriceUnit: (contractType === 'SALE' ? 'EACH' : 'DAY') as 'EACH' | 'DAY',
          Item: item.Item ?? inv,
          ItemNameEn: item.ItemNameEn ?? inv.ItemNameEn ?? undefined,
        };
      });
      return changed ? next : prev;
    });
  }, [contractType, currency, availableItems]);

  const loadData = async () => {
    try {
      const [custData, invData, whData, catData] = await Promise.all([
        customerService.getAllAsync(),
        inventoryService.getAllAsync(),
        warehouseService.getActiveAsync(),
        inventoryService.getAllCategoriesAsync(),
      ]);
      setCustomers(custData);
      setAvailableItems(invData);
      setWarehouses(whData);
      setInventoryCategories(catData);
    } catch (error) {
      console.error('Load data error:', error);
    }
  };

  const plannedDays = Math.ceil(
    (new Date(plannedEndDate).getTime() - new Date(startDate).getTime()) /
      (1000 * 60 * 60 * 24)
  );

  const billedDays = contractType === 'RENTAL' ? Math.max(30, Number.isFinite(plannedDays) ? plannedDays : 0) : 0;

  const actualDays = actualEndDate
    ? Math.ceil(
        (new Date(actualEndDate).getTime() - new Date(startDate).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : 0;

  const formatPriceInput = (value: number | undefined): string => {
    if (value == null || !Number.isFinite(value)) return '';
    return String(value).replace('.', ',');
  };

  const formatThousandsTR = (digits: string): string => {
    const d = (digits ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
    if (!d) return '';
    return d.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };

  const coerceDecimalDotToComma = (raw: string): string => {
    const s = String(raw ?? '').trim();
    if (!s || s.includes(',')) return s;
    const compact = s.replace(/\s+/g, '');
    const dotCount = (compact.match(/\./g) ?? []).length;
    if (dotCount === 0) return s;
    if (dotCount > 1 || /^\d{1,3}(\.\d{3})+$/.test(compact)) return s;
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
    const intDigits = intPart.replace(/\D/g, '').slice(0, maxIntDigits);
    const fracDigits = fracPart.replace(/\D/g, '').slice(0, maxFracDigits);
    const maskedInt = formatThousandsTR(intDigits);
    const masked = fracDigits || hasTrailingDecimalSep ? `${maskedInt},${fracDigits}` : maskedInt;
    if (!intDigits && !fracDigits && !hasTrailingDecimalSep) return { masked: '', numeric: undefined };
    const normalized = `${intDigits || '0'}.${fracDigits || '0'}`;
    const v = Number(normalized);
    if (!Number.isFinite(v) || v < 0) return { masked, numeric: null };
    return { masked, numeric: v };
  };

  const normalizeMaskedIntegerTR = (
    raw: string,
    opts?: { maxDigits?: number; min?: number }
  ): { masked: string; numeric: number } => {
    const maxDigits = opts?.maxDigits ?? 9;
    const min = opts?.min ?? 0;
    const digits = String(raw ?? '').replace(/\D/g, '').slice(0, maxDigits);
    const masked = formatThousandsTR(digits);
    const numeric = Math.max(min, digits ? Number(digits) : 0);
    return { masked, numeric };
  };

  const priceOverrideKey = (item: ContractLineItem) =>
    item.kind === 'inventory' ? `${item.ItemId}-${item.WarehouseId}` : `man-${item.ClientId}`;

  const effectiveDailyPrice = (item: ContractLineItem): number => {
    if (item.kind === 'manual') return item.UnitPriceSnapshot;
    if (contractType === 'SALE') {
      return item.OverrideUnitPrice != null ? item.OverrideUnitPrice : item.UnitPriceSnapshot;
    }
    if (item.OverrideMonthlyPrice != null) return item.OverrideMonthlyPrice / 30;
    if (item.MonthlyPriceOverride != null) return item.MonthlyPriceOverride / 30;
    return item.UnitPriceSnapshot;
  };

  const getLineTotal = (item: ContractLineItem) => {
    const daily = effectiveDailyPrice(item);
    if (item.kind === 'manual') return daily * item.RentedQuantity;
    if (contractType === 'SALE') return daily * item.RentedQuantity;
    return daily * item.RentedQuantity * billedDays;
  };

  const initialTotalPrice = contractItems.reduce((sum, item) => sum + getLineTotal(item), 0);

  const contractItemDisplayEntries = useMemo(
    () =>
      buildContractItemDisplayEntries(
        contractItems,
        addendumLineSources,
        !isNew && canViewContracts
      ),
    [contractItems, addendumLineSources, isNew, canViewContracts]
  );

  const addendumItemCount = useMemo(
    () => contractItemDisplayEntries.filter((entry) => entry.kind === 'row' && entry.isAddendumRow).length,
    [contractItemDisplayEntries]
  );

  const baseContractItemCount = contractItems.length - addendumItemCount;

  /** Satır için iskonto oranı: satıra özel yoksa üstteki global iskonto. */
  const getItemIskonto = (itemId: number, warehouseId: number) =>
    itemIskonto[`${itemId}-${warehouseId}`] ?? iskonto;

  const getRowDiscountPercent = (item: ContractLineItem) =>
    item.kind === 'inventory' ? getItemIskonto(item.ItemId, item.WarehouseId) : iskonto;

  const getLineNetTotal = (item: ContractLineItem) =>
    lineNetFromGross(getLineTotal(item), getRowDiscountPercent(item));

  const lineNetInputKey = (item: ContractLineItem) =>
    item.kind === 'inventory' ? `${item.ItemId}-${item.WarehouseId}` : `man-${item.ClientId}`;

  // Toplam tutar kırılımları (satır bazlı iskonto)
  const subtotal = initialTotalPrice;
  const discountAmount = contractItems.reduce((sum, item) => {
    return sum + lineDiscountAmount(getLineTotal(item), getRowDiscountPercent(item));
  }, 0);

  const totalSettlementCharge = contractReturns.reduce((sum, ret) => {
    return sum + (ret.IsNonPhysicalSettlement ? (ret.SettlementCharge || 0) : 0);
  }, 0);

  const discountedTotal = subtotal - discountAmount;
  const vatAmount = discountedTotal * (vatRate / 100);
  const grandTotal = discountedTotal + vatAmount;

  /** Panelden ürün + miktar ile listeye ekler. */
  const addItemFromPicker = async (item: Inventory, quantity: number) => {
    if (!selectedWarehouseId) {
      toast.warning('Depo seçimi zorunludur. Lütfen varsayılan depo seçin.');
      return false;
    }
    const qty = Math.max(1, quantity);
    const whId = Number(selectedWarehouseId);
    const itemId = item.ItemId;

    let warehouseStock = 0;
    try {
      const whStocks = await inventoryService.getWarehousesByItemAsync(itemId);
      const whStock = whStocks.find((ws) => ws.WarehouseId === whId);
      warehouseStock = whStock?.Quantity ?? 0;
      setWarehouseStockCache((prev) => ({ ...prev, [`${itemId}-${whId}`]: warehouseStock }));
    } catch {
      warehouseStock = item.TotalStock - item.OnRent;
    }

    const existingDetail = contractItems.find(
      (i) => i.kind === 'inventory' && i.ItemId === itemId && i.WarehouseId === whId
    );
    const alreadyInContract = existingDetail?.RentedQuantity ?? 0;
    const effectiveAvailable = warehouseStock + (isNew ? 0 : alreadyInContract);
    const newTotalQuantity = existingDetail ? existingDetail.RentedQuantity + qty : qty;

    if (newTotalQuantity > effectiveAvailable) {
      const wh = warehouses.find((w) => w.WarehouseId === whId);
      toast.error(
        `Yetersiz depo stoku! "${formatInventoryLineBilingualLabel(item.ItemName, item.ItemNameEn, item)}" için ${wh?.WarehouseName ?? 'seçili depoda'} müsait: ${effectiveAvailable}, istenen: ${newTotalQuantity}`
      );
      return false;
    }

    const wh = warehouses.find((w) => w.WarehouseId === whId);
    if (existingDetail) {
      setContractItems(
        contractItems.map((i) =>
          i.kind === 'inventory' && i.ItemId === itemId && i.WarehouseId === whId
            ? { ...i, RentedQuantity: i.RentedQuantity + qty }
            : i
        )
      );
    } else {
      const dailyPriceAtRent = unitPriceForContractInventory(item, currency, contractType);
      setContractItems([
        ...contractItems,
        {
          kind: 'inventory',
          DetailId: 0,
          ItemId: itemId,
          WarehouseId: whId,
          WarehouseName: wh?.WarehouseName ?? '',
          RentedQuantity: qty,
          ReturnedQuantity: 0,
          UnitPriceSnapshot: dailyPriceAtRent,
          PriceUnit: (contractType === 'SALE' ? 'EACH' : 'DAY') as 'EACH' | 'DAY',
          MonthlyPriceOverride: undefined,
          PriceSource: 'INVENTORY',
          Item: item,
          ItemName: item.ItemName,
          ItemCode: item.ItemCode,
          ItemCodeOverride: null,
          ItemNameOverride: null,
          ItemNameEn: item.ItemNameEn ?? undefined,
          OverrideUnitPrice: undefined,
          OverrideMonthlyPrice: undefined,
        },
      ]);
      setItemIskonto((prev) => ({ ...prev, [`${itemId}-${whId}`]: iskonto }));
    }
    const key = `${itemId}-${whId}`;
    setLastAddedKeys((prev) => [...prev.filter((k) => k !== key), key]);
    return true;
  };

  useEffect(() => {
    if (lastAddedKeys.length === 0) return;
    const t = setTimeout(() => setLastAddedKeys([]), 1600);
    return () => clearTimeout(t);
  }, [lastAddedKeys]);

  useEffect(() => {
    if (isReadOnly || contractItems.length === 0) {
      setActiveItemsGridCell(null);
      return;
    }
    setActiveItemsGridCell((prev) => {
      if (!prev) return { row: 0, col: 3 };
      const nextRow = Math.min(prev.row, contractItems.length - 1);
      if (nextRow === prev.row) return prev;
      return { row: nextRow, col: prev.col };
    });
  }, [isReadOnly, contractItems]);

  useEffect(() => {
    if (!activeItemsGridCell) return;
    const target = itemsGridRefs.current.get(`${activeItemsGridCell.row}-${activeItemsGridCell.col}`);
    target?.focus();
    if (target instanceof HTMLInputElement) {
      target.select();
    }
  }, [activeItemsGridCell]);

  const handleContractItemDragStart = (e: React.DragEvent, index: number) => {
    dragItemIndexRef.current = index;
    setDragItemIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleContractItemDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragItemIndexRef.current !== null && dragItemIndexRef.current !== index) {
      setDragOverItemIndex(index);
    }
  };

  const handleContractItemDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    const fromIndex = dragItemIndexRef.current;
    setDragItemIndex(null);
    setDragOverItemIndex(null);
    dragItemIndexRef.current = null;
    if (fromIndex == null || fromIndex === toIndex) return;
    setContractItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const handleContractItemDragEnd = () => {
    setDragItemIndex(null);
    setDragOverItemIndex(null);
    dragItemIndexRef.current = null;
  };

  const handleItemsGridKeyDown = (
    e: React.KeyboardEvent<HTMLElement>,
    row: number,
    col: 3 | 4 | 5 | 6 | 7
  ) => {
    const colOrder: Array<3 | 4 | 5 | 6 | 7> = [3, 4, 5, 6, 7];
    const colIndex = colOrder.indexOf(col);
    if (colIndex < 0 || contractItems.length === 0) return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
    } else {
      return;
    }

    let nextRow = row;
    let nextColIndex = colIndex;

    if (e.key === 'ArrowDown') nextRow = Math.min(contractItems.length - 1, row + 1);
    if (e.key === 'ArrowUp') nextRow = Math.max(0, row - 1);
    if (e.key === 'ArrowRight') nextColIndex = Math.min(colOrder.length - 1, colIndex + 1);
    if (e.key === 'ArrowLeft') nextColIndex = Math.max(0, colIndex - 1);

    const stepRow = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    const stepCol = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;

    let probeRow = nextRow;
    let probeColIndex = nextColIndex;
    const maxProbe = contractItems.length * colOrder.length;
    for (let i = 0; i < maxProbe; i++) {
      const key = `${probeRow}-${colOrder[probeColIndex]}`;
      if (itemsGridRefs.current.get(key)) {
        setActiveItemsGridCell({ row: probeRow, col: colOrder[probeColIndex] });
        return;
      }
      probeColIndex += stepCol;
      if (probeColIndex < 0 || probeColIndex >= colOrder.length) {
        probeColIndex = Math.max(0, Math.min(colOrder.length - 1, probeColIndex));
        probeRow = Math.min(contractItems.length - 1, Math.max(0, probeRow + stepRow));
        if (probeRow === 0 || probeRow === contractItems.length - 1) break;
      }
    }
  };

  useEffect(() => {
    if (!isNew || contractItems.length === 0) return;
    const loadMissingStocks = async () => {
      for (const item of contractItems) {
        if (item.kind !== 'inventory') continue;
        const cacheKey = `${item.ItemId}-${item.WarehouseId}`;
        if (warehouseStockCache[cacheKey] === undefined && item.WarehouseId) {
          try {
            const whStocks = await inventoryService.getWarehousesByItemAsync(item.ItemId);
            const whStock = whStocks.find((ws) => ws.WarehouseId === item.WarehouseId);
            setWarehouseStockCache((prev) => ({ ...prev, [cacheKey]: whStock?.Quantity ?? 0 }));
          } catch { /* ignore */ }
        }
      }
    };
    loadMissingStocks();
  }, [contractItems, isNew]);

  const handleRemoveItem = (itemId: number, warehouseId: number) => {
    setContractItems(
      contractItems.filter((i) => !(i.kind === 'inventory' && i.ItemId === itemId && i.WarehouseId === warehouseId))
    );
  };

  const pickerPickedItemIds = useMemo(() => {
    const whId = Number(selectedWarehouseId);
    if (!selectedWarehouseId) return new Set<number>();
    return new Set(
      contractItems
        .filter((i): i is InventoryContractLineItem => i.kind === 'inventory' && i.WarehouseId === whId)
        .map((i) => i.ItemId)
    );
  }, [contractItems, selectedWarehouseId]);

  const toggleItemFromPicker = async (item: Inventory, quantity: number) => {
    const whId = Number(selectedWarehouseId);
    if (!selectedWarehouseId) {
      return addItemFromPicker(item, quantity);
    }
    const existing = contractItems.find(
      (i) => i.kind === 'inventory' && i.ItemId === item.ItemId && i.WarehouseId === whId
    );
    if (existing) {
      handleRemoveItem(item.ItemId, whId);
      return 'removed' as const;
    }
    return addItemFromPicker(item, quantity);
  };

  const handleRemoveManualItem = (clientId: string) => {
    setContractItems(contractItems.filter((i) => !(i.kind === 'manual' && i.ClientId === clientId)));
  };

  const fetchWarehouseStock = async (itemId: number, warehouseId: number): Promise<number> => {
    const cacheKey = `${itemId}-${warehouseId}`;
    if (warehouseStockCache[cacheKey] !== undefined) return warehouseStockCache[cacheKey];
    try {
      const whStocks = await inventoryService.getWarehousesByItemAsync(itemId);
      const whStock = whStocks.find((ws) => ws.WarehouseId === warehouseId);
      const qty = whStock?.Quantity ?? 0;
      setWarehouseStockCache((prev) => ({ ...prev, [cacheKey]: qty }));
      return qty;
    } catch {
      return Infinity;
    }
  };

  const updateItemQuantity = async (itemId: number, warehouseId: number, newQty: number) => {
    const qty = Math.max(1, Math.floor(newQty));

    if (isNew) {
      const stock = await fetchWarehouseStock(itemId, warehouseId);
      if (stock !== Infinity && qty > stock) {
        const wh = warehouses.find((w) => w.WarehouseId === warehouseId);
        const item = availableItems.find((i) => i.ItemId === itemId);
        const label = item
          ? formatInventoryLineBilingualLabel(item.ItemName, item.ItemNameEn, item)
          : 'Ürün';
        toast.error(`Yetersiz depo stoku! "${label}" için ${wh?.WarehouseName ?? 'seçili depoda'} müsait: ${stock}, istenen: ${qty}`);
        return;
      }
    }

    setContractItems((prev) =>
      prev.map((i) =>
        i.kind === 'inventory' && i.ItemId === itemId && i.WarehouseId === warehouseId
          ? { ...i, RentedQuantity: qty }
          : i
      )
    );
    setLineNetInputs((prev) => {
      const key = `${itemId}-${warehouseId}`;
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const updateContractItemIskonto = (itemId: number, warehouseId: number, value: number) => {
    const pct = Math.max(0, Math.min(100, value));
    setItemIskonto((prev) => ({ ...prev, [`${itemId}-${warehouseId}`]: pct }));
  };

  /** Yeşil Toplam (net) → iskonto % ters hesabı. */
  const applyLineNetTarget = (item: ContractLineItem, targetNet: number) => {
    const result = discountPercentFromNet(getLineTotal(item), targetNet);
    if (item.kind === 'inventory') {
      updateContractItemIskonto(item.ItemId, item.WarehouseId, result.discountPercent);
    } else {
      setIskonto(result.discountPercent);
    }
    return result;
  };

  /** Üstteki iskonto değişince tüm satırlara uygula */
  const handleGlobalIskontoChange = (value: number) => {
    setIskonto(value);
    setItemIskonto((prev) => {
      const next = { ...prev };
      contractItems.forEach((i) => {
        if (i.kind === 'inventory') next[`${i.ItemId}-${i.WarehouseId}`] = value;
      });
      return next;
    });
    setLineNetInputs({});
  };

  const handleSave = async () => {
    const source = fullContract ?? contract;
    const validationError = firstValidationError([
      validateRequired(String(selectedCustomerId || ''), 'Müşteri'),
      validateRequired(String(selectedAuthorizedContactId || ''), 'Merkez yetkili'),
      validateDate(startDate, 'Başlangıç tarihi', true),
      validateDate(plannedEndDate, 'Planlanan bitiş tarihi', true),
      validateNumber(iskonto, 'İskonto', { min: 0, max: 100 }),
      validateNumber(vatRate, 'KDV', { min: 0, max: 100 }),
    ]);
    if (validationError) {
      toast.warning(validationError);
      return;
    }

    // Backend kuralı: RENTAL ise ve PlannedEndDate varsa StartDate < PlannedEndDate olmalı (eşitlik de geçersiz)
    if (isRentalContract && plannedEndDate) {
      const sd = new Date(startDate);
      const ped = new Date(plannedEndDate);
      if (!isNaN(sd.getTime()) && !isNaN(ped.getTime()) && sd.getTime() >= ped.getTime()) {
        toast.warning('Başlangıç tarihi, planlanan bitiş tarihinden önce olmalıdır.');
        return;
      }
    }
    if (contractItems.length === 0) {
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
      siteRequired: sites.length > 0,
    });
    if (siteValidationError) {
      toast.warning(siteValidationError);
      return;
    }

    // Depo zorunluluğu yalnızca envanter kalemleri için geçerli (manuel kalemler stok etkilemez)
    if (isNew) {
      const invItems = contractItems.filter((i) => i.kind === 'inventory');
      const withoutWarehouse = invItems.filter((i) => !i.WarehouseId || i.WarehouseId === 0);
      if (withoutWarehouse.length > 0) {
        toast.warning('Depo stoğundan düşüm için envanter kalemlerinde depo seçilmesi zorunludur. Lütfen tüm envanter kalemlerine depo atayın.');
        return;
      }
    }

    try {
      setIsBusy(true);
      setSaveStockError(null);

      const normalizeOptionalOverride = (raw: unknown): string | null => {
        const s = typeof raw === 'string' ? raw.trim() : '';
        return s ? s : null;
      };

      if (isNew) {
        const details = contractItems.map((item) => {
          if (item.kind === 'manual') {
            return {
              IsManual: true,
              Description: item.Description,
              RentedQuantity: item.RentedQuantity,
              UnitPriceSnapshot: item.UnitPriceSnapshot,
            };
          }
          return {
            ItemId: item.ItemId,
            WarehouseId: item.WarehouseId,
            RentedQuantity: item.RentedQuantity,
            ItemCodeOverride: normalizeOptionalOverride(item.ItemCodeOverride),
          };
        });

        const requestBody: Record<string, unknown> = {
          CustomerId: Number(selectedCustomerId),
          CustomerAuthorizedContactId: Number(selectedAuthorizedContactId),
          StartDate: new Date(startDate).toISOString(),
          InitialTotalPrice: initialTotalPrice,
          IsCompleted: false,
          Iskonto: iskonto,
          VatRate: vatRate,
          Currency: currency,
          Type: contractType,
          Language: language,
          details,
        };

        if (isRentalContract && plannedEndDate) {
          requestBody.PlannedEndDate = new Date(plannedEndDate).toISOString();
        }

        const siteFields = buildSiteRequestFields(isNewSiteMode, newSiteForm, selectedSiteId);
        Object.assign(requestBody, siteFields);
        if (normalizeText(contractCode)) {
          requestBody.ContractCode = normalizeText(contractCode);
        }

        if (contractItems.length > 0) {
          const inv = contractItems.filter((i) => i.kind === 'inventory');
          const firstWh = inv[0]?.WarehouseId;
          if (firstWh && inv.length > 0 && inv.every((i) => i.WarehouseId === firstWh)) {
            requestBody.defaultWarehouseId = firstWh;
          }
        }

        const result = await contractService.createAsync(requestBody as any);
        if (result.warnings && result.warnings.length > 0) {
          toast.warning(result.warnings.join('\n'));
        }
        if (result.CreatedSiteId && selectedCustomerId) {
          await applyCreatedSiteId({
            customerId: Number(selectedCustomerId),
            createdSiteId: result.CreatedSiteId,
            setSites,
            setSelectedSiteId,
            resetNewSiteMode,
          });
        }
        toast.success(`Sözleşme başarıyla oluşturuldu! (ID: ${result.ContractId})`);
        onClose();
        return;
      } else if (contract) {
        const updateBody: Record<string, unknown> = {};
        const originalCustomerAuthId =
          (source as { CustomerAuthorizedContactId?: number | null } | null | undefined)
            ?.CustomerAuthorizedContactId ?? null;
        const nextCustomerAuthId = selectedAuthorizedContactId ? Number(selectedAuthorizedContactId) : null;
        if (originalCustomerAuthId !== nextCustomerAuthId && nextCustomerAuthId != null) {
          updateBody.CustomerAuthorizedContactId = nextCustomerAuthId;
        }

        const originalSiteId = (source as { SiteId?: number | null } | null | undefined)?.SiteId ?? null;
        const siteFields = buildSiteRequestFields(isNewSiteMode, newSiteForm, selectedSiteId);
        if (isNewSiteMode) {
          if (siteFields.newSite) {
            updateBody.newSite = siteFields.newSite;
          }
        } else {
          const nextSiteId = selectedSiteId ? Number(selectedSiteId) : null;
          if (originalSiteId !== nextSiteId) {
            if (nextSiteId != null) updateBody.SiteId = nextSiteId;
          }
        }

        const originalIskonto = Number((source as { Iskonto?: number } | null | undefined)?.Iskonto ?? 0) || 0;
        const nextIskonto = Number(iskonto) || 0;
        if (originalIskonto !== nextIskonto) {
          updateBody.Iskonto = nextIskonto;
        }

        const originalVat = Number((source as { VatRate?: number } | null | undefined)?.VatRate ?? 20) || 0;
        const nextVat = Number(vatRate) || 0;
        if (originalVat !== nextVat) {
          updateBody.VatRate = nextVat;
        }

        const originalCurrency =
          (source as { Currency?: string } | null | undefined)?.Currency === 'EUR'
            ? 'EUR'
            : (source as { Currency?: string } | null | undefined)?.Currency === 'USD'
              ? 'USD'
              : 'TRY';
        if (originalCurrency !== currency) {
          updateBody.Currency = currency;
        }

        const originalLanguage = (source as any)?.Language || 'TR';
        if (originalLanguage !== language) {
          updateBody.Language = language;
        }

        const originalCode = normalizeText(String((source as { ContractCode?: string } | null | undefined)?.ContractCode ?? ''));
        const nextCode = normalizeText(contractCode);
        if (nextCode && nextCode !== originalCode) {
          updateBody.ContractCode = nextCode;
        }

        const originalSd = source?.StartDate ? String(source.StartDate).split('T')[0] : '';
        if (originalSd !== startDate) {
          updateBody.StartDate = new Date(startDate).toISOString();
        }

        if (isRentalContract) {
          const originalPed = source?.PlannedEndDate ? String(source.PlannedEndDate).split('T')[0] : '';
          const nextPed = plannedEndDate.trim();
          if (originalPed !== nextPed) {
            if (nextPed) {
              updateBody.PlannedEndDate = new Date(nextPed).toISOString();
            }
          }
        }

        if (Object.keys(updateBody).length === 0) {
          toast.info('Değişiklik yok.');
          setIsReadOnly(true);
          return;
        }

        const updateResult = await contractService.updateAsync(contract.ContractId, updateBody as any);
        if (updateResult.CreatedSiteId && selectedCustomerId) {
          await applyCreatedSiteId({
            customerId: Number(selectedCustomerId),
            createdSiteId: updateResult.CreatedSiteId,
            setSites,
            setSelectedSiteId,
            resetNewSiteMode,
          });
        }
        const rentalDatesChanged =
          isRentalContract && (updateBody.StartDate != null || updateBody.PlannedEndDate != null);
        toast.success(
          rentalDatesChanged
            ? 'Sözleşme güncellendi. Kiralama tarihleri değiştiği için planlanan tutar sunucuda yeniden hesaplandı; özet güncellendi.'
            : 'Sözleşme başarıyla güncellendi!'
        );
        await refreshContract();
        setIsReadOnly(true);
        return;
      }
    } catch (error) {
      console.error('Save contract error:', error);
      const fieldErrors = getApiFieldErrors(error, [
        'CustomerAuthorizedContactId',
        'customerAuthorizedContactId',
      ]);
      const errorMsg = getApiErrorMessage(error);
      const normalizedMessage = errorMsg.toLowerCase();
      if (fieldErrors.CustomerAuthorizedContactId || fieldErrors.customerAuthorizedContactId) {
        setAuthorizedContactError(
          fieldErrors.CustomerAuthorizedContactId ??
            fieldErrors.customerAuthorizedContactId ??
            'Merkez yetkili alanı zorunludur.'
        );
      } else if (
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
      if (errorMsg.includes('Yetersiz') || errorMsg.includes('stok') || isStockErrorMessage(errorMsg)) {
        setSaveStockError(errorMsg);
      } else if (isSiteRelatedApiMessage(errorMsg)) {
        toast.error(errorMsg);
      } else if (isArchivedInventoryApiError(error)) {
        toast.error(getUserFacingApiErrorMessage(error, 'contract-save'));
      } else {
        toast.error(userMessageForCustomerRelatedApiError(error, errorMsg || 'Kaydetme hatası'));
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleReduceSaveStockQuantity = (available: number) => {
    const itemName = extractFirstQuotedName(saveStockError ?? '');
    if (!itemName) return;
    setContractItems((prev) =>
      prev.map((i) => {
        if (i.kind !== 'inventory') return i;
        const inv = availableItems.find((a) => a.ItemId === i.ItemId);
        const label = inv
          ? formatInventoryLineBilingualLabel(inv.ItemName, inv.ItemNameEn, inv)
          : i.ItemName;
        if (label.includes(itemName) || i.ItemName === itemName) {
          return { ...i, RentedQuantity: Math.max(1, Math.min(i.RentedQuantity, available)) };
        }
        return i;
      })
    );
    setSaveStockError(null);
  };

  const handleCancelClick = () => {
    if (!contract || !active) return;
    if (!canCancelContract) {
      toast.error('Sözleşmeyi iptal etmek için yetkiniz bulunmuyor.');
      return;
    }
    setCancelReason('');
    setCancelReasonError(null);
    setShowCancelReasonModal(true);
  };

  const handleRevertClick = () => {
    if (!canRevertToQuote) {
      toast.error('Teklife geri alma işlemi için yetkiniz bulunmuyor.');
      return;
    }
    setShowRevertConfirm(true);
  };

  const handleArchiveClick = () => {
    if (!contract || !archivable) return;
    if (!canArchiveContract) {
      toast.error('Sözleşmeyi arşivlemek için yetkiniz bulunmuyor.');
      return;
    }
    setArchiveReason('');
    setArchiveReasonError(null);
    setShowArchiveModal(true);
  };

  const handleArchiveConfirm = async () => {
    if (!contract || !archivable) return;
    const trimmedReason = archiveReason.trim();
    if (trimmedReason.length > 0 && trimmedReason.length < 3) {
      setArchiveReasonError('Not en az 3 karakter olmalıdır.');
      return;
    }
    try {
      setIsBusy(true);
      await contractService.archiveAsync(
        contract.ContractId,
        trimmedReason.length >= 3 ? trimmedReason : undefined
      );
      setShowArchiveModal(false);
      setArchiveReason('');
      toast.success('Sözleşme arşivlendi.');
      await onDataChanged?.();
      onClose();
    } catch (error) {
      console.error('Archive contract error:', error);
      toast.error(getApiErrorMessage(error) || getUserFacingApiErrorMessage(error, 'contract-archive'));
    } finally {
      setIsBusy(false);
    }
  };

  const handleUnarchiveConfirm = async () => {
    if (!contract || !archived) return;
    if (!canArchiveContract) {
      toast.error('Sözleşmeyi geri getirmek için yetkiniz bulunmuyor.');
      return;
    }
    try {
      setIsBusy(true);
      await contractService.unarchiveAsync(contract.ContractId);
      setShowUnarchiveConfirm(false);
      toast.success('Sözleşme arşivden geri getirildi.');
      await onDataChanged?.();
      onClose();
    } catch (error) {
      console.error('Unarchive contract error:', error);
      toast.error(getApiErrorMessage(error) || 'Sözleşme geri getirilemedi.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleCancelReasonContinue = () => {
    const reason = cancelReason.trim();
    if (reason.length < 3) {
      setCancelReasonError('İptal gerekçesi en az 3 karakter olmalıdır.');
      return;
    }
    setCancelReasonError(null);
    setShowCancelReasonModal(false);
    setShowCancelConfirm(true);
  };

  const handleCancelConfirm = async () => {
    if (!contract || !active) return;
    const reason = cancelReason.trim();
    if (reason.length < 3) return;
    try {
      setIsBusy(true);
      const result = await contractService.cancelAsync(contract.ContractId, reason);
      setShowCancelConfirm(false);
      setCancelReason('');
      if (result.QuoteReleased && result.QuoteId) {
        toast.success(`Sözleşme iptal edildi. Teklif #${result.QuoteId} aktif tekliflere geri döndü.`);
      } else {
        toast.success('Sözleşme iptal edildi.');
      }
      await onDataChanged?.({ quoteReleased: Boolean(result.QuoteReleased) });
      onClose();
    } catch (error) {
      console.error('Cancel contract error:', error);
      setShowCancelConfirm(false);
      toast.error(getUserFacingApiErrorMessage(error, 'contract-cancel'));
    } finally {
      setIsBusy(false);
    }
  };

  const handleRevertToQuoteConfirm = async () => {
    if (!contract) return;
    try {
      setIsBusy(true);
      const result = await contractService.revertToQuoteAsync(contract.ContractId);
      setShowRevertConfirm(false);
      if (result.QuoteId) {
        toast.success('Sözleşme kaldırıldı; kaynak teklif aktif listeye döndü.');
        await onDataChanged?.({ quoteReleased: true });
        onClose();
        navigate('/contracts/sale', { replace: true, state: { openQuoteId: result.QuoteId } });
      } else {
        toast.success('Sözleşme kaldırıldı.');
        await onDataChanged?.({ quoteReleased: true });
        onClose();
        navigate('/contracts/sale', { replace: true });
      }
    } catch (error) {
      const status = (error as any)?.status as number | undefined;
      if (status === 403) {
        toast.error('Bu işlem için yetkiniz yok.');
        setShowRevertConfirm(false);
        return;
      }
      if (status === 400 || status === 404) {
        toast.error(getApiErrorMessage(error));
        setShowRevertConfirm(false);
        return;
      }
      setRevertRetryMessage(getApiErrorMessage(error) || 'İşlem sırasında hata oluştu.');
      setShowRevertConfirm(false);
      setShowRevertRetryConfirm(true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleComplete = async () => {
    if (!isRentalContract) return;
    if (!contract || !active) return;

    const today = new Date().toISOString();
    try {
      setIsBusy(true);
      await contractService.completeContractAsync(contract.ContractId, today);
      toast.success('Sözleşme tamamlandı. Kalan ürünlerin stokları geri eklendi.');
      await onDataChanged?.();
      onClose();
    } catch (error) {
      console.error('Complete contract error:', error);
      toast.error(getApiErrorMessage(error) || 'Tamamlama hatası');
    } finally {
      setIsBusy(false);
    }
  };

  const handleReturnClick = () => {
    if (!isRentalContract) return;
    const effectiveContractForReturn = fullContract ?? contract;
    if (!contract || !effectiveContractForReturn || !active || !returnDetailKey) return;
    const [itemIdStr, warehouseIdStr] = returnDetailKey.split('-');
    const itemId = Number(itemIdStr);
    const warehouseId = Number(warehouseIdStr);
    const item = contractItems.find(
      (i): i is Extract<ContractLineItem, { kind: 'inventory' }> =>
        i.kind === 'inventory' && i.ItemId === itemId && i.WarehouseId === warehouseId
    );
    if (!item) return;
    const qty = Math.max(0, parseInt(returnQuantityStr, 10) || 0);
    const remainingOnRent = item.RentedQuantity - item.ReturnedQuantity;
    if (qty <= 0 || qty > remainingOnRent) {
      toast.warning(`İade miktarı 1 ile ${remainingOnRent} arasında olmalıdır`);
      return;
    }
    setShowReturnConfirm(true);
  };

  const handleReturnItem = async () => {
    if (!isRentalContract) return;
    const effectiveContractForReturn = fullContract ?? contract;
    if (!contract || !effectiveContractForReturn || !active || !returnDetailKey) return;

    const [itemIdStr, warehouseIdStr] = returnDetailKey.split('-');
    const itemId = Number(itemIdStr);
    const warehouseId = Number(warehouseIdStr);

    const item = contractItems.find(
      (i): i is Extract<ContractLineItem, { kind: 'inventory' }> =>
        i.kind === 'inventory' && i.ItemId === itemId && i.WarehouseId === warehouseId
    );
    if (!item) return;

    const qty = Math.max(0, parseInt(returnQuantityStr, 10) || 0);
    const remainingOnRent = item.RentedQuantity - item.ReturnedQuantity;
    if (qty <= 0 || qty > remainingOnRent) {
      toast.warning(`İade miktarı 1 ile ${remainingOnRent} arasında olmalıdır`);
      return;
    }

    try {
      setIsReturning(true);
      const options: { returnDate?: string; returnWarehouseId?: number } = {};
      if (returnDate) options.returnDate = new Date(returnDate).toISOString();
      if (returnWarehouseId) options.returnWarehouseId = Number(returnWarehouseId);

      const result: ReturnItemResponse = await contractService.returnItemAsync(
        contract.ContractId,
        itemId,
        warehouseId,
        qty,
        options
      );

      // Başarılı iade sonrası contract items güncelle
      setContractItems((prevItems) =>
        prevItems.map((i) =>
          i.kind === 'inventory' && i.ItemId === itemId && i.WarehouseId === warehouseId
            ? { ...i, ReturnedQuantity: result.ReturnedQuantity }
            : i
        )
      );

      // İade formunu kapat ve onay modal'ını kapat
      setShowReturnConfirm(false);
      setReturnDetailKey(null);
      setReturnQuantityStr('1');
      setReturnDate(new Date().toISOString().split('T')[0]);
      setReturnWarehouseId('');

      // İade geçmişini yenile
      loadContractReturns();

      let message = `İade başarılı!\nİade edilen: ${qty} adet\nKirada kalan: ${result.RemainingOnRent} adet`;
      if (result.LateDays > 0) {
        const lateFmt = result.LateFee.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        message += `\n\nGecikme: ${result.LateDays} gün`;
        message += `\nGecikme ücreti: ${currency === 'EUR' ? '€' : currency === 'USD' ? '$' : '₺'}${lateFmt}`;
      }
      if (result.ContractCompleted) {
        message += '\n\nTüm ürünler iade edildi. Sözleşme otomatik olarak tamamlandı.';
      }

      toast.success(message);
      if (result.ContractCompleted) onClose();
    } catch (error: unknown) {
      console.error('Return item error:', error);
      toast.error(getApiErrorMessage(error) || 'İade işlemi başarısız');
    } finally {
      setIsReturning(false);
    }
  };

  const openReturnForm = (item: Extract<ContractLineItem, { kind: 'inventory' }>) => {
    if (!isRentalContract) return;
    const remainingOnRent = item.RentedQuantity - item.ReturnedQuantity;
    if (remainingOnRent > 0) {
      setIsReturning(false); // Önceki istek takılı kaldıysa input disabled kalmasın
      setReturnDetailKey(`${item.ItemId}-${item.WarehouseId}`);
      setReturnQuantityStr('1');
      setReturnWarehouseId(item.WarehouseId); // Varsayılan: aynı depoya iade
    }
  };

  const closeReturnForm = () => {
    setReturnDetailKey(null);
    setReturnQuantityStr('1');
    setReturnWarehouseId('');
  };

  useEffect(() => {
    if (!isRentalContract && (activeTab === 'return' || activeTab === 'returns')) {
      setActiveTab('info');
    }
  }, [isRentalContract, activeTab]);

  /** Sadece rakam girişine izin ver (miktar / iade miktarı); tam genişlik Unicode rakamları NFKC ile normalize edilir */
  const handleNumericInput = (setter: (v: string) => void, e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.normalize('NFKC').replace(/\D/g, '');
    setter(raw);
  };

  const formatCurrency = (amount: number | null | undefined) => {
    const n = typeof amount === 'number' && Number.isFinite(amount) ? amount : Number(amount);
    const safe = Number.isFinite(n) ? n : 0;
    return formatMoney(safe, currency);
  };

  const handleGenerateDocument = async (format: 'pdf' | 'docx' = 'pdf') => {
    if (!contract || !activeTemplateId) {
      toast.warning('Döküman oluşturmak için bir şablon seçmelisiniz');
      return;
    }

    try {
      setIsBusy(true);
      const blob = await contractService.generateDocumentAsync(
        contract.ContractId,
        Number(activeTemplateId),
        format
      );

      if (blob.size === 0) {
        toast.error('Belge oluşturulamadı (sunucu boş yanıt döndü).');
        return;
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sozlesme_${contract.ContractId}.${format}`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Generate document error:', error);
      toast.error(getApiErrorMessage(error) || 'Döküman oluşturma hatası');
    } finally {
      setIsBusy(false);
    }
  };

  const handlePreviewDocument = async () => {
    if (!contract || !activeTemplateId) {
      toast.warning('Önizleme için bir şablon seçmelisiniz');
      return;
    }

    try {
      setIsBusy(true);
      const blob = await contractService.previewDocumentAsync(
        contract.ContractId,
        Number(activeTemplateId)
      );
      // Backend tanı: gelen yanıtın tipi ve boyutu (konsolda kontrol edin)
      console.log('[PDF Önizleme] Blob:', { size: blob.size, type: blob.type });

      if (blob.size === 0) {
        toast.error(
          'Sunucu boş yanıt döndürdü (boyut: 0). Backend preview-document endpoint\'ini kontrol edin.'
        );
        return;
      }
      const isPdf = blob.type === 'application/pdf' || blob.type === '';
      if (!isPdf && blob.size < 10000) {
        const text = await blob.text();
        try {
          const j = JSON.parse(text);
          toast.error('Önizleme hatası (sunucu PDF değil): ' + (j.message || text.slice(0, 200)));
        } catch {
          toast.error(
            'Sunucu PDF döndürmedi. Content-Type: ' + (blob.type || '(boş)') + '. Backend\'i kontrol edin.'
          );
        }
        return;
      }
      if (!isPdf) {
        console.warn('[PDF Önizleme] Content-Type PDF değil:', blob.type, '- yine de açmayı deniyoruz.');
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

  const closePdfPreview = () => {
    setShowPdfPreview(false);
    if (pdfPreviewUrl) {
      window.URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(null);
    }
  };

  const handleOpenSourceQuote = () => {
    if (!sourceQuoteId) return;
    if (onOpenSourceQuote) {
      void Promise.resolve(onOpenSourceQuote(sourceQuoteId));
      return;
    }
    onClose();
    const path = contractType === 'SALE' ? '/contracts/sale' : '/contracts/rental';
    navigate(path, {
      replace: false,
      state: { openQuoteId: sourceQuoteId, openQuoteNonce: Date.now() },
    });
  };

  const compactBtn = '!py-1.5 !px-3 text-xs';
  const fieldLabel = 'block text-[11px] font-medium text-text-secondary mb-0.5';

  const modalTree = (
    <div className={`fixed inset-0 flex flex-col overflow-hidden bg-background-main ${stackAboveParent ? 'z-[60]' : 'z-50'}`}>
      <header className="shrink-0 flex items-center justify-between px-3 py-2 bg-background-panel border-b border-background-border gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <h1 className="text-base font-semibold text-text-primary tracking-tight truncate">
            {isNew ? 'Yeni Sözleşme' : `Sözleşme #${contract?.ContractId ?? ''} Detayı`}
          </h1>
          <span className="text-xs font-medium text-text-secondary whitespace-nowrap">
            {contractType === 'SALE' ? 'Satış' : 'Kiralama'}
          </span>
          {!isNew && cancelled && (
            <span className="rounded border border-amber-600/50 bg-amber-900/30 px-2 py-0.5 text-[11px] font-semibold text-amber-100 shrink-0">
              İptal Edildi
              {effectiveContract?.CancelledAt
                ? ` • ${formatShortDateTime(effectiveContract.CancelledAt)}`
                : ''}
            </span>
          )}
          {!isNew && completed && !cancelled && !archived && (
            <span className="rounded border border-green-700/50 bg-green-900/30 px-2 py-0.5 text-[11px] font-semibold text-green-100 shrink-0">
              Tamamlandı
            </span>
          )}
          {!isNew && archived && (
            <span className="rounded border border-amber-600/50 bg-amber-900/30 px-2 py-0.5 text-[11px] font-semibold text-amber-100 shrink-0">
              Arşivlenmiş{archivedAtLabel ? ` • ${archivedAtLabel}` : ''}
            </span>
          )}
          {!isNew && active && (
            <span className="rounded border border-blue-700/50 bg-blue-900/30 px-2 py-0.5 text-[11px] font-semibold text-blue-100 shrink-0">
              Aktif
            </span>
          )}
          <span className="hidden md:inline text-[11px] text-text-secondary truncate">
            {currentUser?.fullName || currentUser?.username || ''}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          {!isNew && hasSourceQuote && (
            <button
              type="button"
              onClick={handleOpenSourceQuote}
              disabled={isBusy}
              className={`btn-secondary ${compactBtn}`}
              title="Bu sözleşmenin kaynak teklifini açar"
            >
              {sourceQuoteCode
                ? `Kaynak teklif (${sourceQuoteCode})`
                : 'Kaynak teklife git'}
            </button>
          )}
          {archivable && (
            <button
              type="button"
              onClick={handleArchiveClick}
              disabled={isBusy || !canArchiveContract}
              className={`btn-danger ${compactBtn} ${!canArchiveContract ? 'opacity-60 cursor-not-allowed' : ''}`}
              title={
                canArchiveContract
                  ? 'Sözleşmeyi listeden kaldırır; kayıt silinmez'
                  : 'Arşivleme yetkiniz bulunmuyor'
              }
            >
              Arşivle
            </button>
          )}
          {!isNew && archived && canArchiveContract && (
            <button
              type="button"
              onClick={() => setShowUnarchiveConfirm(true)}
              disabled={isBusy}
              className={`btn-primary ${compactBtn}`}
              title="Sözleşmeyi arşivden geri getirir"
            >
              Geri Getir
            </button>
          )}
          {!isNew && active && !cancelled && (
            <button
              type="button"
              onClick={handleCancelClick}
              disabled={isBusy}
              className={`btn-danger ${compactBtn} ${!canCancelContract ? 'opacity-60' : ''}`}
              title={
                canCancelContract
                  ? 'Sözleşmeyi iptal eder; kaynak teklif varsa aktif tekliflere geri döner'
                  : 'Sözleşme iptal yetkiniz yok'
              }
            >
              İptal Et
            </button>
          )}
          {!isNew && active && !cancelled && contractType === 'SALE' && hasSourceQuote && (
            <button
              type="button"
              onClick={handleRevertClick}
              disabled={isBusy}
              className={`btn-danger ${compactBtn} ${!canRevertToQuote ? 'opacity-60' : ''}`}
              title={
                canRevertToQuote
                  ? 'Sözleşmeyi kaldırır ve kaynak teklifi beklemede duruma alır'
                  : 'Teklife geri alma yetkiniz yok'
              }
            >
              Teklife Geri Al
            </button>
          )}
          {!isNew && isRentalContract && active && !cancelled && (
            <button
              type="button"
              onClick={() => setShowCompleteConfirm(true)}
              disabled={isBusy}
              className={`btn-success ${compactBtn}`}
            >
              Tamamla
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-secondary hover:bg-background-hover hover:text-text-primary transition-colors"
            aria-label="Kapat"
            title="Kapat"
          >
            <XIcon size={20} weight="regular" />
          </button>
        </div>
      </header>

      {!isNew && archivable && (
        <section className="shrink-0 px-3 py-1.5 border-b border-green-800/40 bg-green-950/20 text-xs text-green-100">
          Bu sözleşme {cancelled ? 'iptal edilmiş' : 'tamamlanmış'}; bilgiler salt okunurdur. Listeden kaldırmak için{' '}
          <span className="font-medium">Arşivle</span> kullanın.
        </section>
      )}
      {!isNew && archived && (
        <section className="shrink-0 px-3 py-1.5 border-b border-amber-700/40 bg-amber-900/15 text-xs text-amber-100">
          Bu kayıt arşivlenmiştir; düzenleme, iptal ve iade yapılamaz. Bilgiler salt okunurdur.
          {effectiveContract?.ArchiveReason?.trim() ? (
            <span className="ml-1 text-amber-200/90">
              Arşiv notu: {effectiveContract.ArchiveReason.trim()}
            </span>
          ) : null}
        </section>
      )}
      {!isNew && cancelled && !archived && (
        <section className="shrink-0 px-3 py-1.5 border-b border-amber-700/40 bg-amber-900/15 text-xs text-amber-100">
          Bu sözleşme iptal edilmiş; tekrar iptal edilemez.
        </section>
      )}
      {!isNew && !active && !cancelled && !completed && effectiveContract && (
        <section className="shrink-0 px-3 py-1.5 border-b border-background-border bg-background-panel text-xs text-text-secondary">
          Sözleşme durumu belirlenemedi. Sayfayı yenileyip tekrar deneyin.
        </section>
      )}
      {!isNew && active && !canCancelContract && (
        <section className="shrink-0 px-3 py-1.5 border-b border-amber-700/40 bg-amber-900/15 text-xs text-amber-100">
          Bu sözleşmeyi iptal etmek için yetkiniz bulunmuyor. Eski &quot;Sil&quot; işlemi kaldırıldı;
          bağlı teklifi serbest bırakmak için <span className="font-medium">sözleşme iptal</span> yetkisi gerekir.
        </section>
      )}

      {!isNew && (
        <div className="shrink-0 flex gap-1 px-3 border-b border-background-border bg-background-panel">
          <button
            type="button"
            onClick={() => setActiveTab('info')}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === 'info'
                ? 'text-accent border-b-2 border-accent'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Bilgiler
          </button>
          {isRentalContract && active && (fullContract ?? contract) && (
            <button
              type="button"
              onClick={() => {
                setIsReturning(false);
                setActiveTab('return');
              }}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === 'return'
                  ? 'text-accent border-b-2 border-accent'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              İade Al
              {contractItems.some(i => i.kind === 'inventory' && (i.RentedQuantity - i.ReturnedQuantity) > 0) && (
                <span className="ml-1.5 bg-green-600/30 text-green-400 text-xs px-1.5 py-0.5 rounded-full">
                  {contractItems.filter(i => i.kind === 'inventory' && (i.RentedQuantity - i.ReturnedQuantity) > 0).length}
                </span>
              )}
            </button>
          )}
          {isRentalContract && (
            <button
              type="button"
              onClick={() => setActiveTab('returns')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === 'returns'
                  ? 'text-accent border-b-2 border-accent'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              İade Geçmişi
              {contractReturns.length > 0 && (
                <span className="ml-1.5 bg-accent/20 text-accent text-xs px-1.5 py-0.5 rounded-full">
                  {contractReturns.length}
                </span>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === 'history'
                ? 'text-accent border-b-2 border-accent'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Geçmiş
          </button>
          {canViewContracts && (
            <button
              type="button"
              onClick={() => setActiveTab('addenda')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === 'addenda'
                  ? 'text-accent border-b-2 border-accent'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Zeyilnameler
            </button>
          )}
        </div>
      )}

      {isRentalContract && activeTab === 'return' && !isNew && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
          <p className="mb-2 shrink-0 text-xs text-text-secondary">
            Kirada bekleyen ürünleri seçin; miktar, tarih ve hedef depoyu girerek iade alın.
          </p>
          {contractItems.length === 0 ? (
            <div className="py-8 text-center text-sm text-text-secondary">
              Bu sözleşmede kiralanan malzeme bulunmuyor veya yükleniyor...
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-background-border">
              <table className="w-full table-compact text-text-primary">
                <thead className="sticky top-0 z-10 bg-background-surface">
                  <tr className="border-b border-background-border">
                    <th className="text-left">Ürün</th>
                    <th className="text-left">Depo</th>
                    <th className="text-right">Kirada</th>
                    <th className="text-right">İade</th>
                    <th className="text-center">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {contractItems.filter((i) => i.kind === 'inventory').map((item) => {
                    const remainingOnRent = item.RentedQuantity - item.ReturnedQuantity;
                    const itemKey = `${item.ItemId}-${item.WarehouseId}`;
                    const isReturnFormOpen = returnDetailKey === itemKey;

                    return (
                      <Fragment key={itemKey}>
                        <tr
                          className={`border-b border-background-border hover:bg-background-hover ${
                            isReturnFormOpen ? 'bg-accent/5' : ''
                          }`}
                        >
                          <td className="max-w-[220px]">
                            <div className="truncate font-medium" title={formatInventoryLineBilingualLabel(item.ItemName, item.ItemNameEn, item.Item)}>
                              {formatInventoryLineBilingualLabel(item.ItemName, item.ItemNameEn, item.Item)}
                            </div>
                          </td>
                          <td className="text-text-secondary">{item.WarehouseName ?? '—'}</td>
                          <td className="text-right tabular-nums">
                            <span className={remainingOnRent > 0 ? 'font-medium text-orange-400' : 'text-text-secondary'}>
                              {remainingOnRent}
                            </span>
                            <span className="text-text-secondary"> / {item.RentedQuantity}</span>
                          </td>
                          <td className="text-right tabular-nums">
                            {item.ReturnedQuantity > 0 ? (
                              <span className="inline-flex items-center gap-0.5 text-green-400">
                                <CheckIcon size={12} weight="bold" aria-hidden />
                                {item.ReturnedQuantity}
                              </span>
                            ) : (
                              <span className="text-text-secondary">0</span>
                            )}
                          </td>
                          <td className="text-center whitespace-nowrap">
                            {remainingOnRent > 0 ? (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setSettleItem({ item, remainingOnRent })}
                                  className={`btn-secondary ${compactBtn} bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30`}
                                  disabled={isReturning}
                                  title="Zayi / Satış (Sanal İade)"
                                >
                                  Zayi
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openReturnForm(item)}
                                  className={`btn-success ${compactBtn}`}
                                  disabled={isReturning}
                                >
                                  İade Al
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-green-400">Tamamlandı</span>
                            )}
                          </td>
                        </tr>
                        {isReturnFormOpen && remainingOnRent > 0 && (
                          <tr className="bg-background-surface">
                            <td colSpan={5} className="border-b border-background-border px-2 py-2">
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                                <label className="text-xs text-text-secondary">Miktar</label>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  autoComplete="off"
                                  value={returnQuantityStr}
                                  onChange={(e) => handleNumericInput(setReturnQuantityStr, e)}
                                  className="input w-16 py-1 text-sm"
                                  placeholder="1"
                                  disabled={isReturning}
                                  aria-label="İade miktarı"
                                />
                                <span className="text-xs text-text-secondary">/ {remainingOnRent}</span>
                                <label className="text-xs text-text-secondary">Tarih</label>
                                <input
                                  type="date"
                                  value={returnDate}
                                  onChange={(e) => setReturnDate(e.target.value)}
                                  className="input w-32 py-1 text-sm"
                                  disabled={isReturning}
                                />
                                <label className="text-xs text-text-secondary">Hedef Depo</label>
                                <select
                                  value={returnWarehouseId}
                                  onChange={(e) => setReturnWarehouseId(Number(e.target.value) || '')}
                                  className="input min-w-[140px] py-1 text-sm"
                                  disabled={isReturning}
                                >
                                  <option value="">Kaynak depo</option>
                                  {warehouses.map((wh) => (
                                    <option key={wh.WarehouseId} value={wh.WarehouseId}>
                                      {wh.WarehouseName}
                                    </option>
                                  ))}
                                </select>
                                <div className="flex-1" />
                                <button
                                  type="button"
                                  onClick={closeReturnForm}
                                  className={`btn-secondary ${compactBtn}`}
                                  disabled={isReturning}
                                >
                                  İptal
                                </button>
                                <button
                                  type="button"
                                  onClick={handleReturnClick}
                                  className={`btn-success ${compactBtn}`}
                                  disabled={isReturning}
                                >
                                  {isReturning ? 'İşleniyor...' : 'Onayla'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3 flex shrink-0 gap-2">
            <button type="button" onClick={onClose} className={`btn-secondary flex-1 ${compactBtn}`}>
              Kapat
            </button>
          </div>
        </div>
      )}

      {isRentalContract && activeTab === 'returns' && !isNew && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
          {returnsLoading ? (
            <div className="py-8 text-center text-sm text-text-secondary">Yükleniyor...</div>
          ) : contractReturns.length === 0 ? (
            <div className="py-8 text-center text-sm text-text-secondary">
              Bu sözleşmede henüz iade kaydı bulunmuyor.
            </div>
          ) : (
            <>
              <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-background-border">
                <table className="w-full table-compact text-text-primary">
                  <thead className="sticky top-0 z-10 bg-background-surface">
                    <tr className="border-b border-background-border">
                      <th className="text-left">Ürün</th>
                      <th className="text-left">Depo</th>
                      <th className="text-right">Miktar</th>
                      <th className="text-left">İade Tarihi</th>
                      <th className="text-left">Tür</th>
                      <th className="text-left">Detay</th>
                      <th className="text-right whitespace-nowrap">Kayıt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contractReturns.map((ret) => (
                      <tr
                        key={ret.ReturnId}
                        className={`border-b border-background-border hover:bg-background-hover ${
                          ret.IsNonPhysicalSettlement ? 'bg-red-500/5' : ''
                        }`}
                      >
                        <td className="max-w-[180px]">
                          <div className="truncate font-medium" title={ret.ItemName}>{ret.ItemName}</div>
                        </td>
                        <td className="text-text-secondary">{ret.WarehouseName ?? '—'}</td>
                        <td className="text-right tabular-nums">{ret.ReturnQuantity}</td>
                        <td className="whitespace-nowrap">{new Date(ret.ReturnDate).toLocaleDateString('tr-TR')}</td>
                        <td>
                          {ret.IsNonPhysicalSettlement ? (
                            <span className="inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold bg-red-500/20 text-red-300">
                              Zayi / Satış
                            </span>
                          ) : (
                            <span className="inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold bg-green-500/20 text-green-400">
                              Normal
                            </span>
                          )}
                        </td>
                        <td className="text-text-secondary">
                          {ret.IsNonPhysicalSettlement ? (
                            <div className="space-y-0.5">
                              {ret.SettlementReason && (
                                <div>
                                  {ret.SettlementReason === 'SALE' ? 'Satış' : ret.SettlementReason === 'DEFECT' ? 'Hurda / Defo' : ret.SettlementReason}
                                </div>
                              )}
                              {ret.SettlementCharge != null && (
                                <div className="text-red-300">Bedel: {formatMoney(ret.SettlementCharge, currency)}</div>
                              )}
                            </div>
                          ) : ret.LateDays > 0 ? (
                            <span className="text-orange-400">
                              {ret.LateDays} gün · {formatMoney(ret.LateFee, currency)}
                            </span>
                          ) : (
                            <span>—</span>
                          )}
                        </td>
                        <td className="text-right text-text-secondary whitespace-nowrap text-[11px]">
                          {formatShortDateTime(ret.CreatedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {contractReturns.some((r) => r.LateFee > 0) && (
                    <tfoot className="sticky bottom-0 bg-orange-900/40 border-t border-orange-800/40">
                      <tr>
                        <td colSpan={6} className="text-right font-medium">Toplam Gecikme Ücreti</td>
                        <td className="text-right font-bold text-orange-300 tabular-nums">
                          {formatCurrency(contractReturns.reduce((sum, r) => sum + r.LateFee, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </>
          )}
          <div className="mt-3 flex shrink-0 gap-2">
            <button type="button" onClick={onClose} className={`btn-secondary flex-1 ${compactBtn}`}>
              Kapat
            </button>
          </div>
        </div>
      )}

      {activeTab === 'history' && !isNew && (
        <div className="flex-1 overflow-auto p-3">
            <h3 className="text-lg font-semibold mb-3">Aktivite Geçmişi</h3>
            <AuditLogTimeline logs={contractLogs} loading={contractLogsLoading} />
            <div className="flex gap-3 mt-6">
              <button onClick={onClose} className="btn-secondary flex-1">
                Kapat
              </button>
            </div>
        </div>
      )}

      {activeTab === 'addenda' && !isNew && contract?.ContractId && canViewContracts && (
        <div className="flex-1 overflow-auto p-3">
          <ContractAddendaPanel
            contractId={contract.ContractId}
            contractType={contractType}
            contractActive={active}
            contractLines={contractItems}
            items={availableItems}
            warehouses={warehouses}
            currency={currency}
            templateId={selectedContractTemplateId}
            canView={canViewContracts}
            canUpdate={canUpdateContracts}
            canDelete={canDeleteContracts}
            openCreateRequest={pendingOpenAddendumCreate}
            onOpenCreateConsumed={() => setPendingOpenAddendumCreate(false)}
            onContractRefresh={async () => {
              await refreshContract();
              await Promise.resolve(onDataChanged?.());
            }}
            onClose={onClose}
          />
        </div>
      )}

      {(activeTab === 'info' || isNew) && (
        <div className="flex-1 min-h-0 flex flex-col p-2 gap-2">
          {cancelled && effectiveContract && (
            <section className="shrink-0 rounded-lg border border-amber-700/50 bg-amber-900/20 px-3 py-2">
              <h3 className="text-xs font-semibold text-amber-100 mb-1">İptal Bilgileri</h3>
              <div className="text-xs text-amber-50/90 flex flex-wrap gap-x-4 gap-y-1">
                <p>
                  <span className="font-medium">İptal Tarihi:</span>{' '}
                  {effectiveContract.CancelledAt
                    ? formatShortDateTime(effectiveContract.CancelledAt)
                    : '—'}
                </p>
                <p>
                  <span className="font-medium">İptal Gerekçesi:</span>{' '}
                  {effectiveContract.CancellationReason?.trim() || '—'}
                </p>
              </div>
            </section>
          )}
          {isNew && saveStockError && (
            <StockErrorPanel
              message={saveStockError}
              onRetry={handleSave}
              onReduceQuantity={handleReduceSaveStockQuantity}
              onDismiss={() => setSaveStockError(null)}
            />
          )}

          <section className="shrink-0 rounded-lg border border-background-border bg-background-panel px-3 py-2">
            <div className={`grid gap-x-2.5 gap-y-1.5 ${selectedCustomerId ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-2'}`}>
              <div className="min-w-0">
                <label className={fieldLabel} htmlFor="contract-customer-search">
                  Müşteri *
                </label>
                <CustomerSearchField
                  key={`${contract?.ContractId ?? 'new'}-${isNew}-${selectedCustomerId || 'none'}`}
                  id="contract-customer-search"
                  customers={customers}
                  value={selectedCustomerId}
                  onChange={handleCustomerChange}
                  disabled={isReadOnly}
                />
              </div>

              {selectedCustomerId && (
                <div className="min-w-0 overflow-hidden">
                  <label className={fieldLabel}>
                    Merkez Yetkili *
                  </label>
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
                      className="input min-w-0 w-full text-sm py-1.5"
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
                    <div className="input min-w-0 w-full text-red-300 bg-background-secondary text-sm py-1.5 truncate">
                      Bu müşteri için yetkili tanımlı değil
                    </div>
                  )}
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
                    isNewSiteMode={isNewSiteMode}
                    newSiteForm={newSiteForm}
                    onSelectSite={handleSiteSelect}
                    onNewSiteFormChange={handleNewSiteFormChange}
                    onCancelNewSite={resetNewSiteMode}
                    required={sites.length > 0}
                    disabled={isReadOnly}
                    label="Şantiye"
                  />
                </div>
              )}
            </div>

            <div className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-1.5">
              <div className="min-w-[120px] w-[150px]">
                <label className={fieldLabel}>Sözleşme Kodu</label>
                <input
                  type="text"
                  value={contractCode}
                  onChange={(e) => setContractCode(e.target.value)}
                  disabled={isReadOnly}
                  className="input w-full text-sm py-1.5"
                  placeholder="Örn: SZ-2026-001"
                  maxLength={50}
                />
              </div>

              <div className="min-w-[120px] w-[140px]">
                <label className={fieldLabel}>Sözleşme Tipi</label>
                {isNew ? (
                  lockNewContractType ? (
                    <div className="input w-full bg-background-secondary text-text-secondary text-sm py-1.5 px-2 rounded-lg border border-background-border">
                      {contractType === 'SALE' ? 'Satış' : 'Kiralama'}
                    </div>
                  ) : (
                    <select
                      value={contractType}
                      onChange={(e) => setContractType(e.target.value as ContractQuoteType)}
                      className="input w-full text-sm py-1.5"
                    >
                      <option value="RENTAL">Kiralama</option>
                      <option value="SALE">Satış</option>
                    </select>
                  )
                ) : (
                  <div className="input w-full bg-background-secondary text-text-secondary text-sm py-1.5 px-2 rounded-lg border border-background-border">
                    {contractType === 'SALE' ? 'Satış' : 'Kiralama'}
                  </div>
                )}
              </div>

              <div className="min-w-[120px] w-[140px]">
                <label className={fieldLabel}>Başlangıç</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={isReadOnly}
                  className="input w-full text-sm py-1.5"
                />
              </div>

              {isRentalContract && (
                <div className="min-w-[120px] w-[140px]">
                  <label className={fieldLabel} title="Başlangıç veya planlanan bitişi değiştirdiğinizde sunucu planlanan tutarı güncel tarih aralığına göre yeniden hesaplar.">
                    Planlanan Bitiş
                  </label>
                  <input
                    type="date"
                    value={plannedEndDate}
                    onChange={(e) => setPlannedEndDate(e.target.value)}
                    disabled={isReadOnly}
                    className="input w-full text-sm py-1.5"
                  />
                </div>
              )}

              <div className="min-w-[100px] w-[120px]">
                <label className={fieldLabel}>Sözleşme Sahibi</label>
                <div className="input w-full bg-background-secondary text-text-secondary py-1.5 px-2 text-xs rounded-lg border border-background-border truncate">
                  {currentUser?.fullName || currentUser?.username || '—'}
                </div>
              </div>

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
                  title="Tüm satırlara uygulanır"
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

              {!isReadOnly && (
                <div className="min-w-[140px] w-[170px]">
                  <label className={fieldLabel}>Varsayılan depo *</label>
                  <select
                    value={selectedWarehouseId}
                    onChange={(e) => setSelectedWarehouseId(Number(e.target.value) || '')}
                    className="input w-full text-sm py-1.5"
                  >
                    <option value="">Depo seçin</option>
                    {warehouses.map((wh) => (
                      <option key={wh.WarehouseId} value={wh.WarehouseId}>
                        {wh.WarehouseName}
                      </option>
                    ))}
                  </select>
                  {!selectedWarehouseId && (
                    <span className="text-[10px] text-amber-400">Ürün eklemek için depo seçin.</span>
                  )}
                </div>
              )}

              <div className="min-w-[260px] flex-[1.4] space-y-2">
                {isRentalContract && (
                  <div>
                    <label className={fieldLabel}>Belge türü</label>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => void handleDocumentKindChange('contract')}
                        disabled={isEnsuringExtresiTemplate}
                        className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          documentKind === 'contract'
                            ? 'bg-primary text-white'
                            : 'bg-background-hover text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        Sözleşme
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDocumentKindChange('extre')}
                        disabled={isEnsuringExtresiTemplate}
                        className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          documentKind === 'extre'
                            ? 'bg-warning text-white'
                            : 'bg-background-hover text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        {isEnsuringExtresiTemplate ? 'Hazırlanıyor...' : 'Kullanım Extresi'}
                      </button>
                    </div>
                  </div>
                )}
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <label className={fieldLabel}>Şablon</label>
                    <button
                      type="button"
                      onClick={() => navigate('/document-templates?tab=contract')}
                      className="text-[10px] text-primary hover:underline"
                    >
                      Şablonları yönet
                    </button>
                  </div>
                  <div className="flex gap-1">
                    <select
                      value={activeTemplateId}
                      onChange={(e) => setActiveTemplateId(Number(e.target.value) || '')}
                      className="input w-full text-sm py-1.5"
                      disabled={isEnsuringExtresiTemplate || visibleTemplates.length === 0}
                    >
                      <option value="">
                        {visibleTemplates.length === 0 ? 'Bu tür için şablon yok' : 'Şablon seçin'}
                      </option>
                      {visibleTemplates.map((t) => (
                        <option key={t.TemplateId} value={t.TemplateId}>
                          {t.TemplateName} {t.IsDefault ? '(Varsayılan)' : ''}
                        </option>
                      ))}
                    </select>
                    {activeTemplateId && (
                      <button
                        type="button"
                        onClick={async () => {
                          const template = visibleTemplates.find((t) => t.TemplateId === Number(activeTemplateId));
                          if (!template) return;
                          try {
                            setLoadingTemplate(true);
                            const fullTemplate = await contractTemplateService.getByIdAsync(template.TemplateId);
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
                  </div>
                  {documentKind === 'extre' && extreTemplates.length === 0 && !isEnsuringExtresiTemplate && (
                    <span className="text-[10px] text-amber-400 mt-1 block">
                      Extre şablonu seçildiğinde otomatik oluşturulur.
                    </span>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-background-border bg-background-panel flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 border-b border-background-border">
              <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                {contractType === 'SALE' ? 'Satış Kalemleri' : 'Kiralanan Malzemeler'}
                {contractItems.length > 0 && (
                  <span className="ml-1.5 font-normal normal-case tracking-normal text-text-secondary/80">
                    {addendumItemCount > 0
                      ? `(${baseContractItemCount} + ${addendumItemCount} zeyilname)`
                      : `(${contractItems.length})`}
                  </span>
                )}
              </h3>
              <div className="flex flex-wrap items-center gap-1.5">
                {isNew && !isReadOnly && (
                  <button
                    type="button"
                    onClick={() => setShowProductPickerModal(true)}
                    className={`btn-secondary ${compactBtn}`}
                  >
                    Ürün Ekle
                  </button>
                )}
                {isNew && !isReadOnly && (
                  <button
                    type="button"
                    onClick={() => setShowManualLineModal(true)}
                    className={`btn-secondary ${compactBtn}`}
                  >
                    Manuel Kalem
                  </button>
                )}
                {!isReadOnly && activeTemplateId && contractItems.length > 0 && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        setIsAddingMaterialTable(true);
                        const template = visibleTemplates.find((t) => t.TemplateId === Number(activeTemplateId));
                        if (!template) return;
                        const fullTemplate = await contractTemplateService.getByIdAsync(template.TemplateId);
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
                        await contractTemplateService.updateAsync(template.TemplateId, { Content: content });
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
                {!isNew && contract && active && canViewContracts && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('addenda');
                      if (canUpdateContracts) {
                        setPendingOpenAddendumCreate(true);
                      }
                    }}
                    className={`btn-secondary ${compactBtn}`}
                    title="Kalem ekleme / miktar-fiyat değişikliği zeyilname ile yapılır"
                  >
                    Zeyilname
                  </button>
                )}
                {!isNew && contract && activeTemplateId && (
                  <>
                    <button type="button" onClick={handlePreviewDocument} disabled={isBusy} className={`btn-primary ${compactBtn}`}>
                      {isBusy ? 'Yükleniyor...' : 'Önizle'}
                    </button>
                    <button type="button" onClick={() => handleGenerateDocument('pdf')} disabled={isBusy} className={`btn-secondary ${compactBtn}`}>PDF</button>
                    <button type="button" onClick={() => handleGenerateDocument('docx')} disabled={isBusy} className={`btn-secondary ${compactBtn}`}>Word</button>
                  </>
                )}
              </div>
            </div>
            <div className="overflow-auto flex-1 min-h-0">
              <table className="table-data-grid table-excel-rows text-text-primary">
                  <thead>
                    <tr>
                      {!isReadOnly && (
                        <th className="w-8 text-center" aria-label="Sırala" />
                      )}
                      <th className="text-left whitespace-nowrap" style={{ width: LINE_ITEM_COL.itemCode }}>
                        Ürün Kodu
                      </th>
                      <th className="text-left" style={{ width: LINE_ITEM_COL.itemNameWithWarehouse }}>
                        Ürün Adı
                      </th>
                      <th className="text-left whitespace-nowrap" style={{ width: LINE_ITEM_COL.warehouse }}>
                        Depo
                      </th>
                      <th className="text-right whitespace-nowrap" style={{ width: LINE_ITEM_COL.quantity }}>
                        Miktar
                      </th>
                      <th className="text-right whitespace-nowrap" style={{ width: LINE_ITEM_COL.unitPrice }}>
                        {contractType === 'SALE' ? 'Birim Fiyat' : 'Aylık Fiyat'}
                      </th>
                      <th className="text-right whitespace-nowrap" style={{ width: LINE_ITEM_COL.discount }}>
                        İskonto (%)
                      </th>
                      <th
                        className="text-right whitespace-nowrap"
                        style={{ width: LINE_ITEM_COL.total }}
                        title="İskonto sonrası satır tutarı. Düzenlerseniz iskonto % otomatik hesaplanır."
                      >
                        Toplam
                      </th>
                      <th className="text-center w-12">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contractItems.length === 0 ? (
                      <tr>
                        <td colSpan={isReadOnly ? LINE_ITEM_COL_SPAN.contract.readOnly : LINE_ITEM_COL_SPAN.contract.editable} className="py-6 text-center text-text-secondary">
                          Henüz kalem yok. Yukarıdaki Ürün Ekle veya Manuel Kalem ile ekleyin.
                        </td>
                      </tr>
                    ) : (
                    contractItemDisplayEntries.map((entry, rowIndex) => {
                      if (entry.kind === 'separator') {
                        return (
                          <tr key="addendum-separator" className="addendum-separator-row">
                            <td colSpan={isReadOnly ? LINE_ITEM_COL_SPAN.contract.readOnly : LINE_ITEM_COL_SPAN.contract.editable}>
                              Zeyilname ile eklenen kalemler
                            </td>
                          </tr>
                        );
                      }

                      const { item, isAddendumRow, addendumNo } = entry;
                      const remainingOnRent = item.kind === 'inventory' ? item.RentedQuantity - item.ReturnedQuantity : 0;
                      // İskonto / iade formu için ürün+depo anahtarı (iş kuralı)
                      const itemKey = item.kind === 'inventory' ? `${item.ItemId}-${item.WarehouseId}` : item.ClientId;
                      // Liste satırı: aynı ürün zeyilname ile yeniden eklenebildiği için DetailId zorunlu
                      const rowKey =
                        item.kind === 'inventory'
                          ? item.DetailId != null
                            ? `d-${item.DetailId}`
                            : `${item.ItemId}-${item.WarehouseId}-r${rowIndex}`
                          : item.ClientId;
                      const isReturnFormOpen = item.kind === 'inventory' ? returnDetailKey === itemKey : false;
                      const invItem =
                        item.kind === 'inventory'
                          ? availableItems.find((i) => i.ItemId === item.ItemId)
                          : null;
                      const originalItemCode = invItem?.ItemCode ?? '';
                      const displayItemCode =
                        item.kind === 'inventory'
                          ? (item.ItemCode ?? item.ItemCodeOverride ?? originalItemCode) || '—'
                          : '—';
                      const hasCodeOverride =
                        item.kind === 'inventory' &&
                        item.ItemCodeOverride != null &&
                        String(item.ItemCodeOverride).trim() !== '';
                      const itemEnName =
                        item.kind === 'inventory' ? (invItem?.ItemNameEn ?? item.ItemNameEn) : undefined;
                      const canonicalItemName =
                        invItem?.ItemName ?? (item.kind === 'inventory' ? item.ItemName : '');
                      const lineNet = getLineNetTotal(item);
                      const netKey = lineNetInputKey(item);
                      const overrideKey = priceOverrideKey(item);
                      const justAdded = item.kind === 'inventory' ? lastAddedKeys.includes(itemKey) : false;
                      const isRowActive = activeItemsGridCell?.row === rowIndex;
                      const isDragging = dragItemIndex === rowIndex;
                      const isDragOver = dragOverItemIndex === rowIndex && dragItemIndex !== rowIndex;
                      return (
                        <Fragment key={rowKey}>
                          <tr
                            onDragOver={!isReadOnly ? (e) => handleContractItemDragOver(e, rowIndex) : undefined}
                            onDrop={!isReadOnly ? (e) => handleContractItemDrop(e, rowIndex) : undefined}
                            className={`${
                              isAddendumRow ? 'addendum-row ' : ''
                            }${
                              justAdded
                                ? 'bg-green-500/20'
                                : isRowActive
                                  ? 'ring-2 ring-inset ring-primary/60 bg-primary/15'
                                  : !isAddendumRow && rowIndex % 2 === 0
                                    ? 'bg-background-panel'
                                    : !isAddendumRow
                                      ? 'bg-background-secondary/35'
                                      : ''
                            } ${isDragging ? 'opacity-40' : ''} ${isDragOver ? 'border-t-2 border-t-primary' : ''}`}
                          >
                            {!isReadOnly && (
                              <td className="px-1 align-middle">
                                <span
                                  draggable
                                  onDragStart={(e) => handleContractItemDragStart(e, rowIndex)}
                                  onDragEnd={handleContractItemDragEnd}
                                  className="cursor-grab active:cursor-grabbing touch-none inline-flex items-center justify-center p-1 rounded text-text-secondary/70 hover:text-text-primary hover:bg-background-hover select-none"
                                  title="Sürükleyerek sırala"
                                  aria-label="Sürükleyerek sırala"
                                  role="button"
                                  tabIndex={0}
                                >
                                  <DotsSixVerticalIcon size={16} weight="bold" aria-hidden />
                                </span>
                              </td>
                            )}
                            <td className="text-text-secondary">
                              <span className="inline-flex items-center gap-1 min-w-0 max-w-full">
                                {isAddendumRow ? (
                                  <span
                                    className="addendum-badge"
                                    title="Bu kalem onaylı zeyilname ile sözleşmeye eklenmiştir"
                                  >
                                    Z{addendumNo != null ? addendumNo : ''}
                                  </span>
                                ) : null}
                                {item.kind === 'inventory' ? (
                                  isReadOnly ? (
                                    <span className="inline-flex items-center gap-1 min-w-0 flex-1">
                                      {displayItemCode !== '—' ? (
                                        <span className="item-code-badge cell-clip" title={displayItemCode}>{displayItemCode}</span>
                                      ) : (
                                        <span className="text-text-secondary">—</span>
                                      )}
                                      {hasCodeOverride ? (
                                        <span
                                          className="addendum-badge"
                                          title="Bu belge için özel ürün kodu tanımlı"
                                        >
                                          Ö
                                        </span>
                                      ) : null}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 min-w-0 flex-1">
                                      <input
                                        type="text"
                                        value={item.ItemCodeOverride ?? originalItemCode}
                                        onChange={(e) => {
                                          const v = e.target.value.slice(0, 50);
                                          setContractItems((prev) =>
                                            prev.map((x) =>
                                              x.kind === 'inventory' &&
                                              x.ItemId === item.ItemId &&
                                              x.WarehouseId === item.WarehouseId
                                                ? { ...x, ItemCodeOverride: v }
                                                : x
                                            )
                                          );
                                        }}
                                        className="input w-full py-0.5 text-xs font-mono min-w-0"
                                        aria-label="Ürün Kodu Override"
                                        placeholder="Boş bırakılırsa orijinal ürün kodu kullanılır"
                                        maxLength={50}
                                      />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setContractItems((prev) =>
                                            prev.map((x) =>
                                              x.kind === 'inventory' &&
                                              x.ItemId === item.ItemId &&
                                              x.WarehouseId === item.WarehouseId
                                                ? { ...x, ItemCodeOverride: null }
                                                : x
                                            )
                                          );
                                        }}
                                        className="btn-secondary !py-0.5 !px-2 text-xs whitespace-nowrap shrink-0"
                                        disabled={isBusy}
                                        title="Varsayılana dön"
                                      >
                                        Reset
                                      </button>
                                    </span>
                                  )
                                ) : (
                                  '—'
                                )}
                              </span>
                            </td>
                            <td className="font-medium">
                              {item.kind === 'inventory' ? (
                                isReadOnly ? (
                                  <button
                                    type="button"
                                    className="cell-clip text-left hover:text-primary hover:underline transition-colors cursor-pointer max-w-full"
                                    title={
                                      language === 'EN' && !itemEnName
                                        ? `${item.ItemNameOverride ?? canonicalItemName} (Bu ürünün İngilizce adı yoktur)`
                                        : (item.ItemNameOverride ?? (language === 'EN' ? itemEnName : canonicalItemName) ?? canonicalItemName)
                                    }
                                    onClick={() => setSelectedInventoryForDetail(invItem ?? null)}
                                  >
                                    {language === 'EN' ? (
                                      item.ItemNameOverride ?? itemEnName ?? canonicalItemName
                                    ) : (
                                      item.ItemNameOverride ?? canonicalItemName
                                    )}
                                  </button>
                                ) : (
                                  <span className="inline-flex items-center gap-1 min-w-0 w-full">
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
                                        setContractItems((prev) =>
                                          prev.map((x) =>
                                            x.kind === 'inventory' &&
                                            x.ItemId === item.ItemId &&
                                            x.WarehouseId === item.WarehouseId
                                              ? { ...x, ItemNameOverride: v }
                                              : x
                                          )
                                        );
                                      }}
                                      className="input w-full py-0.5 text-xs min-w-0 flex-1"
                                      aria-label="Ürün Adı"
                                      placeholder={canonicalItemName}
                                      title={language === 'EN' && !itemEnName ? 'Bu ürünün İngilizce adı yoktur' : undefined}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setContractItems((prev) =>
                                          prev.map((x) =>
                                            x.kind === 'inventory' &&
                                            x.ItemId === item.ItemId &&
                                            x.WarehouseId === item.WarehouseId
                                              ? { ...x, ItemNameOverride: null }
                                              : x
                                          )
                                        );
                                      }}
                                      className="btn-secondary shrink-0"
                                      disabled={isBusy}
                                      title="Varsayılana dön"
                                    >
                                      ↺
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setSelectedInventoryForDetail(invItem ?? null)}
                                      className="btn-secondary shrink-0"
                                      title="Ürün detayını görüntüle"
                                    >
                                      …
                                    </button>
                                  </span>
                                )
                              ) : (
                                <span className="cell-clip" title={item.Description}>{item.Description}</span>
                              )}
                            </td>
                            <td className="text-text-secondary">
                              <span
                                className="cell-clip"
                                title={
                                  item.kind === 'inventory'
                                    ? [
                                        item.WarehouseName,
                                        isRentalContract && item.EffectiveStartDate
                                          ? `Başlangıç: ${new Date(item.EffectiveStartDate).toLocaleDateString('tr-TR')}`
                                          : null,
                                      ]
                                        .filter(Boolean)
                                        .join(' • ') || undefined
                                    : undefined
                                }
                              >
                                {item.kind === 'inventory' ? (item.WarehouseName ?? '—') : '—'}
                              </span>
                            </td>
                            <td className="text-right tabular-nums">
                              {isReadOnly ? (
                                item.RentedQuantity
                              ) : (
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9.]*"
                                  value={item.RentedQuantity === 0 ? '' : formatThousandsTR(String(item.RentedQuantity))}
                                  ref={(el) => {
                                    const key = `${rowIndex}-3`;
                                    if (el) itemsGridRefs.current.set(key, el);
                                    else itemsGridRefs.current.delete(key);
                                  }}
                                  onFocus={(e) => {
                                    setActiveItemsGridCell({ row: rowIndex, col: 3 });
                                    e.currentTarget.select();
                                  }}
                                  onBlur={() => {
                                    if (item.RentedQuantity === 0) {
                                      if (item.kind === 'inventory') {
                                        updateItemQuantity(item.ItemId, item.WarehouseId, 1);
                                      } else {
                                        setContractItems((prev) =>
                                          prev.map((x) =>
                                            x.kind === 'manual' && x.ClientId === item.ClientId
                                              ? { ...x, RentedQuantity: 1 }
                                              : x
                                          )
                                        );
                                      }
                                    }
                                  }}
                                  onKeyDown={(e) => handleItemsGridKeyDown(e, rowIndex, 3)}
                                  onChange={(e) => {
                                    const { numeric } = normalizeMaskedIntegerTR(e.target.value, { maxDigits: 9, min: 0 });
                                    const v = numeric;
                                    if (item.kind === 'inventory') {
                                      updateItemQuantity(item.ItemId, item.WarehouseId, v);
                                    } else {
                                      setContractItems((prev) =>
                                        prev.map((x) =>
                                          x.kind === 'manual' && x.ClientId === item.ClientId
                                            ? { ...x, RentedQuantity: Math.max(0, Math.floor(v)) }
                                            : x
                                        )
                                      );
                                    }
                                  }}
                                  className="input w-full text-right py-0.5 text-xs"
                                  aria-label="Miktar"
                                />
                              )}
                            </td>
                            <td className="text-right tabular-nums text-text-secondary">
                              {item.kind === 'manual' ? (
                                contractType === 'SALE' ? (
                                  formatCurrency(item.UnitPriceSnapshot)
                                ) : (
                                  `${formatCurrency(item.UnitPriceSnapshot)}/gün`
                                )
                              ) : isReadOnly ? (
                                contractType === 'SALE' ? (
                                  formatCurrency(item.OverrideUnitPrice ?? item.UnitPriceSnapshot)
                                ) : (
                                  <span className="font-medium cell-clip">
                                    {formatCurrency(
                                      item.OverrideMonthlyPrice ??
                                        (item.MonthlyPriceOverride ?? item.UnitPriceSnapshot * 30)
                                    )}
                                  </span>
                                )
                              ) : contractType === 'SALE' ? (
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={
                                    priceOverrideInputs[overrideKey] ??
                                    formatPriceInput(item.OverrideUnitPrice ?? item.UnitPriceSnapshot)
                                  }
                                  ref={(el) => {
                                    const key = `${rowIndex}-4`;
                                    if (el) itemsGridRefs.current.set(key, el);
                                    else itemsGridRefs.current.delete(key);
                                  }}
                                  onFocus={(e) => {
                                    setActiveItemsGridCell({ row: rowIndex, col: 4 });
                                    e.currentTarget.select();
                                  }}
                                  onKeyDown={(e) => handleItemsGridKeyDown(e, rowIndex, 4)}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    const { masked, numeric } = normalizeMaskedDecimalTR(raw, { maxIntDigits: 9, maxFracDigits: 2 });
                                    setPriceOverrideInputs((prev) => ({ ...prev, [overrideKey]: masked }));
                                    if (numeric === null) return;
                                    setContractItems((prev) =>
                                      prev.map((x) =>
                                        x.kind === 'inventory' &&
                                        x.ItemId === item.ItemId &&
                                        x.WarehouseId === item.WarehouseId
                                          ? { ...x, OverrideUnitPrice: numeric }
                                          : x
                                      )
                                    );
                                    setLineNetInputs((prev) => {
                                      if (!(netKey in prev)) return prev;
                                      const next = { ...prev };
                                      delete next[netKey];
                                      return next;
                                    });
                                  }}
                                  onBlur={() => {
                                    const raw = priceOverrideInputs[overrideKey] ?? '';
                                    const { masked, numeric } = normalizeMaskedDecimalTR(raw, { maxIntDigits: 9, maxFracDigits: 2 });
                                    if (numeric === null) {
                                      toast.warning('Birim fiyat negatif olamaz ve sayı olmalıdır.');
                                      setPriceOverrideInputs((prev) => ({ ...prev, [overrideKey]: '' }));
                                      setContractItems((prev) =>
                                        prev.map((x) =>
                                          x.kind === 'inventory' &&
                                          x.ItemId === item.ItemId &&
                                          x.WarehouseId === item.WarehouseId
                                            ? { ...x, OverrideUnitPrice: undefined }
                                            : x
                                        )
                                      );
                                      return;
                                    }
                                    setPriceOverrideInputs((prev) => ({ ...prev, [overrideKey]: masked }));
                                  }}
                                  className="input w-full text-right py-0.5 text-xs"
                                  placeholder={formatCurrency(item.UnitPriceSnapshot)}
                                  aria-label="Birim Fiyat"
                                />
                              ) : (
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={
                                    priceOverrideInputs[overrideKey] ??
                                    formatPriceInput(
                                      item.OverrideMonthlyPrice ??
                                        (item.MonthlyPriceOverride ?? item.UnitPriceSnapshot * 30)
                                    )
                                  }
                                  ref={(el) => {
                                    const key = `${rowIndex}-4`;
                                    if (el) itemsGridRefs.current.set(key, el);
                                    else itemsGridRefs.current.delete(key);
                                  }}
                                  onFocus={(e) => {
                                    setActiveItemsGridCell({ row: rowIndex, col: 4 });
                                    e.currentTarget.select();
                                  }}
                                  onKeyDown={(e) => handleItemsGridKeyDown(e, rowIndex, 4)}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    const { masked, numeric } = normalizeMaskedDecimalTR(raw, { maxIntDigits: 9, maxFracDigits: 2 });
                                    setPriceOverrideInputs((prev) => ({ ...prev, [overrideKey]: masked }));
                                    if (numeric === null) return;
                                    setContractItems((prev) =>
                                      prev.map((x) =>
                                        x.kind === 'inventory' &&
                                        x.ItemId === item.ItemId &&
                                        x.WarehouseId === item.WarehouseId
                                          ? { ...x, OverrideMonthlyPrice: numeric }
                                          : x
                                      )
                                    );
                                    setLineNetInputs((prev) => {
                                      if (!(netKey in prev)) return prev;
                                      const next = { ...prev };
                                      delete next[netKey];
                                      return next;
                                    });
                                  }}
                                  onBlur={() => {
                                    const raw = priceOverrideInputs[overrideKey] ?? '';
                                    const { masked, numeric } = normalizeMaskedDecimalTR(raw, { maxIntDigits: 9, maxFracDigits: 2 });
                                    if (numeric === null) {
                                      toast.warning('Aylık fiyat negatif olamaz ve sayı olmalıdır.');
                                      setPriceOverrideInputs((prev) => ({ ...prev, [overrideKey]: '' }));
                                      setContractItems((prev) =>
                                        prev.map((x) =>
                                          x.kind === 'inventory' &&
                                          x.ItemId === item.ItemId &&
                                          x.WarehouseId === item.WarehouseId
                                            ? { ...x, OverrideMonthlyPrice: undefined }
                                            : x
                                        )
                                      );
                                      return;
                                    }
                                    setPriceOverrideInputs((prev) => ({ ...prev, [overrideKey]: masked }));
                                  }}
                                  className="input w-full text-right py-0.5 text-xs"
                                  placeholder={formatCurrency(item.UnitPriceSnapshot * 30)}
                                  aria-label="Aylık Fiyat"
                                />
                              )}
                            </td>
                            <td className="text-right tabular-nums">
                              {isReadOnly ? (
                                Number(item.kind === 'inventory' ? getItemIskonto(item.ItemId, item.WarehouseId) : iskonto) || 0
                              ) : (
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  step={0.01}
                                  value={Number(item.kind === 'inventory' ? getItemIskonto(item.ItemId, item.WarehouseId) : iskonto) || 0}
                                  ref={(el) => {
                                    const key = `${rowIndex}-5`;
                                    if (el) itemsGridRefs.current.set(key, el);
                                    else itemsGridRefs.current.delete(key);
                                  }}
                                  onFocus={(e) => {
                                    setActiveItemsGridCell({ row: rowIndex, col: 5 });
                                    e.currentTarget.select();
                                  }}
                                  onKeyDown={(e) => handleItemsGridKeyDown(e, rowIndex, 5)}
                                  onChange={(e) => {
                                    const v = parseFloat(e.target.value);
                                    if (item.kind === 'inventory') {
                                      updateContractItemIskonto(
                                        item.ItemId,
                                        item.WarehouseId,
                                        Number.isFinite(v) ? v : 0
                                      );
                                    } else {
                                      setIskonto(Number.isFinite(v) ? v : 0);
                                    }
                                    setLineNetInputs((prev) => {
                                      if (!(netKey in prev)) return prev;
                                      const next = { ...prev };
                                      delete next[netKey];
                                      return next;
                                    });
                                  }}
                                  className="input w-full text-right py-0.5 text-xs"
                                  aria-label="İskonto %"
                                />
                              )}
                            </td>
                            <td className="text-right tabular-nums font-medium text-green-500">
                              {isReadOnly ? (
                                formatCurrency(lineNet)
                              ) : (
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={lineNetInputs[netKey] ?? formatPriceInput(lineNet)}
                                  ref={(el) => {
                                    const key = `${rowIndex}-6`;
                                    if (el) itemsGridRefs.current.set(key, el);
                                    else itemsGridRefs.current.delete(key);
                                  }}
                                  onFocus={(e) => {
                                    setActiveItemsGridCell({ row: rowIndex, col: 6 });
                                    e.currentTarget.select();
                                  }}
                                  onKeyDown={(e) => handleItemsGridKeyDown(e, rowIndex, 6)}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    const { masked } = normalizeMaskedDecimalTR(raw, {
                                      maxIntDigits: 12,
                                      maxFracDigits: 2,
                                    });
                                    setLineNetInputs((prev) => ({ ...prev, [netKey]: masked }));
                                  }}
                                  onBlur={(e) => {
                                    const raw = e.currentTarget.value;
                                    const { numeric } = normalizeMaskedDecimalTR(raw, {
                                      maxIntDigits: 12,
                                      maxFracDigits: 2,
                                    });
                                    if (numeric === null || numeric === undefined) {
                                      if (raw.trim() !== '') {
                                        toast.warning('Satır tutarı negatif olamaz ve sayı olmalıdır.');
                                      }
                                      setLineNetInputs((prev) => {
                                        const next = { ...prev };
                                        delete next[netKey];
                                        return next;
                                      });
                                      return;
                                    }
                                    const result = applyLineNetTarget(item, numeric);
                                    if (result.reason === 'net_above_gross') {
                                      toast.warning('Satır tutarı brüt tutarı aşamaz; iskonto %0 yapıldı.');
                                    } else if (result.reason === 'gross_zero') {
                                      toast.warning('Brüt tutar 0 iken iskonto hesaplanamaz.');
                                    }
                                    setLineNetInputs((prev) => {
                                      const next = { ...prev };
                                      delete next[netKey];
                                      return next;
                                    });
                                  }}
                                  className="input w-full text-right py-0.5 text-xs font-medium text-green-500"
                                  aria-label="İskontolu satır tutarı"
                                  title="İskonto sonrası tutar — değiştirirseniz iskonto % otomatik ayarlanır"
                                />
                              )}
                            </td>
                            <td className="text-center">
                              {isRentalContract && !isNew && item.kind === 'inventory' && active && remainingOnRent > 0 && isReadOnly ? (
                                <button
                                  type="button"
                                  onClick={() => openReturnForm(item)}
                                  className="btn-secondary text-[10px] px-1 py-0 leading-none h-[1.125rem] min-h-0"
                                  disabled={isReturning}
                                  title={
                                    item.ReturnedQuantity > 0
                                      ? `İade: ${item.ReturnedQuantity}, Kirada: ${remainingOnRent}`
                                      : 'İade et'
                                  }
                                >
                                  İade
                                </button>
                              ) : !isReadOnly ? (
                                <button
                                  type="button"
                                  ref={(el) => {
                                    const key = `${rowIndex}-7`;
                                    if (el) itemsGridRefs.current.set(key, el);
                                    else itemsGridRefs.current.delete(key);
                                  }}
                                  onFocus={() => setActiveItemsGridCell({ row: rowIndex, col: 7 })}
                                  onKeyDown={(e) => handleItemsGridKeyDown(e, rowIndex, 7)}
                                  onClick={() => (item.kind === 'inventory' ? handleRemoveItem(item.ItemId, item.WarehouseId) : handleRemoveManualItem(item.ClientId))}
                                  className="action-remove-btn"
                                  aria-label="Kaldır"
                                  title="Kaldır"
                                >
                                  <XIcon size={12} weight="bold" aria-hidden />
                                </button>
                              ) : item.kind === 'inventory' && item.ReturnedQuantity > 0 ? (
                                <span
                                  className="text-[10px] text-text-secondary tabular-nums"
                                  title={`İade: ${item.ReturnedQuantity}, ${contractType === 'SALE' ? 'Kalan' : 'Kirada'}: ${remainingOnRent}`}
                                >
                                  {item.ReturnedQuantity}/{remainingOnRent}
                                </span>
                              ) : null}
                            </td>
                          </tr>
                          {isRentalContract && item.kind === 'inventory' && isReturnFormOpen && (
                            <tr className="bg-background-surface">
                              <td colSpan={isReadOnly ? LINE_ITEM_COL_SPAN.contract.readOnly : LINE_ITEM_COL_SPAN.contract.editable} className="px-3 py-3 border-b border-background-border">
                                <div className="flex flex-wrap items-center gap-3">
                                  <label className="text-sm">İade Miktarı:</label>
                                  <input type="text" inputMode="numeric" autoComplete="off" value={returnQuantityStr} onChange={(e) => handleNumericInput(setReturnQuantityStr, e)} className="input w-24" placeholder="1" disabled={isReturning} aria-label="İade miktarı" />
                                  <span className="text-sm text-text-secondary">/ {remainingOnRent} adet</span>
                                  <label className="text-sm ml-2">İade Tarihi:</label>
                                  <input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className="input w-40" disabled={isReturning} />
                                  <label className="text-sm ml-2">Hedef Depo:</label>
                                  <select value={returnWarehouseId} onChange={(e) => setReturnWarehouseId(Number(e.target.value) || '')} className="input w-40" disabled={isReturning}>
                                    <option value="">Kaynak depoya iade</option>
                                    {warehouses.map((wh) => (<option key={wh.WarehouseId} value={wh.WarehouseId}>{wh.WarehouseName}</option>))}
                                  </select>
                                  <div className="flex-1" />
                                  <button onClick={closeReturnForm} className="btn-secondary text-sm px-3 py-1" disabled={isReturning}>İptal</button>
                                  <button onClick={handleReturnClick} className="btn-success text-sm px-3 py-1" disabled={isReturning}>{isReturning ? 'İşleniyor...' : 'Onayla'}</button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })
                    )}
                  </tbody>
                </table>
            </div>
          </section>

          <section className="shrink-0 rounded-lg border border-background-border bg-background-panel px-3 py-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm min-w-0">
              <div>
                <span className="text-[11px] text-text-secondary mr-1.5">Ara Toplam</span>
                <span className="font-semibold text-text-primary">{formatCurrency(subtotal)}</span>
              </div>
              {totalSettlementCharge > 0 && (
                <div title="Sözleşmedeki zayi, hurda veya iade satışlarından kaynaklanan kesinti / borç tutarı genel toplama eklenmiştir.">
                  <span className="text-[11px] text-text-secondary mr-1.5">Zayi Borcu</span>
                  <span className="font-semibold text-red-400">+{formatCurrency(totalSettlementCharge)}</span>
                </div>
              )}
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
              {contractType === 'RENTAL' && (
                <span className="text-[11px] text-text-secondary">
                  {plannedDays} gün
                  {actualDays > 0 ? ` · gerçekleşen ${actualDays} gün` : ''}
                  {' · '}planlanan süre üzerinden
                </span>
              )}
              {contractType === 'SALE' && (
                <span className="text-[11px] text-text-secondary">Satış: birim fiyat, süre çarpanı yok</span>
              )}
              {contract?.FinalCalculatedPrice != null && (
                <div>
                  <span className="text-[11px] text-text-secondary mr-1.5">Final Tutar</span>
                  <span className="font-semibold text-green-200">{formatCurrency(contract.FinalCalculatedPrice)}</span>
                </div>
              )}
              {!isNew && contract && active && priceCalculation && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
                  {contractType === 'RENTAL' && (
                    <span className="text-text-secondary">Planlanan: {priceCalculation.plannedDays} gün</span>
                  )}
                  <span className="text-text-secondary">Temel: {formatCurrency(priceCalculation.basePrice)}</span>
                  {priceCalculation.totalLateFee > 0 && (
                    <span className="text-orange-300">Gecikme: {formatCurrency(priceCalculation.totalLateFee)}</span>
                  )}
                  <span className="font-semibold text-green-300">Final: {formatCurrency(priceCalculation.finalPrice)}</span>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              {!isNew && contract && active && (
                <button
                  type="button"
                  onClick={handleCalculatePrice}
                  disabled={isCalculating}
                  className={`btn-secondary ${compactBtn}`}
                >
                  {isCalculating ? 'Hesaplanıyor...' : 'Fiyat Hesapla'}
                </button>
              )}
              {!isNew && isReadOnly && active && (
                <button
                  type="button"
                  onClick={() => setIsReadOnly(false)}
                  disabled={isBusy}
                  className={`btn-primary ${compactBtn}`}
                >
                  Düzenle
                </button>
              )}
              {!isReadOnly && !completed && (
                <>
                  <button type="button" onClick={onClose} className={`btn-secondary ${compactBtn}`}>
                    İptal
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isBusy || isSaveBlockedByNewSite(isNewSiteMode, newSiteForm.SiteName)}
                    className={`btn-primary ${compactBtn}`}
                  >
                    {isBusy ? 'Kaydediliyor...' : 'Kaydet'}
                  </button>
                </>
              )}
              {isReadOnly && (
                <button type="button" onClick={onClose} className={`btn-secondary ${compactBtn}`}>
                  Kapat
                </button>
              )}
            </div>
          </section>
        </div>
      )}

      {showCancelReasonModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-background-panel rounded-panel w-full max-w-md p-6 max-h-[90vh] overflow-y-auto shadow-xl">
            <h3 className="text-xl font-bold mb-2">İptal Gerekçesi</h3>
            <p className="text-sm text-text-secondary mb-4">
              Sözleşmeyi iptal etmek için lütfen gerekçeyi belirtin.
            </p>
            <textarea
              value={cancelReason}
              onChange={(e) => {
                setCancelReason(e.target.value);
                setCancelReasonError(null);
              }}
              className="input w-full h-24 resize-none py-2 px-3 text-sm"
              placeholder="Örn: Müşteri talebi / Yanlış kayıt"
            />
            {cancelReasonError && (
              <div className="mt-2 text-xs text-red-400 border border-red-700 rounded-md px-2 py-1">
                {cancelReasonError}
              </div>
            )}
            <div className="flex gap-3 justify-end mt-4">
              <button
                type="button"
                onClick={() => {
                  setShowCancelReasonModal(false);
                  setCancelReason('');
                  setCancelReasonError(null);
                }}
                disabled={isBusy}
                className="btn-secondary flex-1"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleCancelReasonContinue}
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
        open={showCancelConfirm}
        title="Sözleşmeyi iptal et"
        message={`Aşağıdaki sözleşmeyi iptal edeceksiniz.\n\nSözleşme: #${contract?.ContractId ?? '-'}\nİptal Gerekçesi: ${cancelReason.trim()}`}
        confirmLabel="İptal Et"
        cancelLabel="Vazgeç"
        variant="danger"
        loading={isBusy}
        onConfirm={() => void handleCancelConfirm()}
        onCancel={() => {
          setShowCancelConfirm(false);
          setCancelReason('');
          setCancelReasonError(null);
        }}
      />

      {showArchiveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-background-panel rounded-panel w-full max-w-md p-6 max-h-[90vh] overflow-y-auto shadow-xl">
            <h3 className="text-xl font-bold mb-2">Sözleşmeyi arşivle</h3>
            <p className="text-sm text-text-secondary mb-4">
              Bu sözleşme listeden kaldırılacaktır. Kayıt silinmeyecek; raporlar ve geçmiş veriler korunacaktır.
            </p>
            <label className="block text-xs text-text-secondary mb-1">İsteğe bağlı not</label>
            <textarea
              value={archiveReason}
              onChange={(e) => {
                setArchiveReason(e.target.value);
                setArchiveReasonError(null);
              }}
              className="input w-full h-24 resize-none py-2 px-3 text-sm"
              placeholder="Örn: Eski kayıt — listeden kaldır"
              disabled={isBusy}
            />
            {archiveReasonError && (
              <div className="mt-2 text-xs text-red-400 border border-red-700 rounded-md px-2 py-1">
                {archiveReasonError}
              </div>
            )}
            <div className="flex gap-3 justify-end mt-4">
              <button
                type="button"
                onClick={() => {
                  if (isBusy) return;
                  setShowArchiveModal(false);
                  setArchiveReason('');
                  setArchiveReasonError(null);
                }}
                disabled={isBusy}
                className="btn-secondary flex-1"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => void handleArchiveConfirm()}
                disabled={isBusy || !canArchiveContract}
                className="btn-danger flex-1"
              >
                {isBusy ? 'Arşivleniyor…' : 'Arşivle'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={showUnarchiveConfirm}
        title="Sözleşmeyi arşivden geri getir"
        message="Sözleşme tekrar ilgili durum sekmesinde (Tamamlanan / İptal Edilen) görünecektir."
        confirmLabel="Geri Getir"
        cancelLabel="Vazgeç"
        loading={isBusy}
        onConfirm={() => void handleUnarchiveConfirm()}
        onCancel={() => setShowUnarchiveConfirm(false)}
        zIndexClass="z-[70]"
      />

      <ConfirmModal
        open={showRevertConfirm}
        title="Teklife geri alınsın mı?"
        message="Sözleşme tamamen silinecek, kaynak teklif taslak durumuna dönecek. Devam?"
        confirmLabel="Teklife Geri Al"
        cancelLabel="Vazgeç"
        variant="danger"
        loading={isBusy}
        onConfirm={() => void handleRevertToQuoteConfirm()}
        onCancel={() => setShowRevertConfirm(false)}
        zIndexClass="z-[70]"
      />

      <ConfirmModal
        open={showRevertRetryConfirm}
        title="İşlem başarısız"
        message={`${revertRetryMessage}\n\nTekrar denemek ister misiniz?`}
        confirmLabel="Tekrar Dene"
        cancelLabel="Kapat"
        variant="default"
        loading={false}
        onConfirm={() => {
          setShowRevertRetryConfirm(false);
          setShowRevertConfirm(true);
        }}
        onCancel={() => setShowRevertRetryConfirm(false)}
        zIndexClass="z-[70]"
      />

      {isRentalContract && (
        <ConfirmModal
          open={showCompleteConfirm}
          title="Onaylıyor musunuz?"
          message="Bu sözleşmeyi tamamlamak istediğinizden emin misiniz?\n\nBu işlemle birlikte kalan ürünlerin stokları geri eklenecektir."
          confirmLabel="Tamamla"
          cancelLabel="Vazgeç"
          loading={isBusy}
          onConfirm={() => {
            setShowCompleteConfirm(false);
            void handleComplete();
          }}
          onCancel={() => setShowCompleteConfirm(false)}
          variant="default"
        />
      )}

      {isRentalContract && (
        <ConfirmModal
          open={showReturnConfirm}
          title="Onaylıyor musunuz?"
          message={returnDetailKey ? (() => {
            const [itemIdStr, warehouseIdStr] = returnDetailKey.split('-');
            const itemId = Number(itemIdStr);
            const warehouseId = Number(warehouseIdStr);
            const item = contractItems.find(
              (i): i is Extract<ContractLineItem, { kind: 'inventory' }> =>
                i.kind === 'inventory' && i.ItemId === itemId && i.WarehouseId === warehouseId
            );
            const qty = Math.max(0, parseInt(returnQuantityStr, 10) || 0);
            return item
              ? `Bu iadeyi onaylıyor musunuz? (${qty} adet, ${formatInventoryLineBilingualLabel(item.ItemName, item.ItemNameEn, item.Item)})`
              : 'Bu iadeyi onaylıyor musunuz?';
          })() : 'Bu iadeyi onaylıyor musunuz?'}
          loading={isReturning}
          onConfirm={handleReturnItem}
          onCancel={() => setShowReturnConfirm(false)}
        />
      )}
      {/* Şablon Editör Modal */}
      {isTemplateEditorOpen && (
        <ContractTemplateEditorModal
          template={editingTemplate}
          isNew={isNewTemplate}
          onClose={() => {
            setIsTemplateEditorOpen(false);
            setEditingTemplate(null);
            loadTemplates();
          }}
          onSave={(templateId) => {
            setActiveTemplateId(templateId);
            setIsTemplateEditorOpen(false);
            setEditingTemplate(null);
            loadTemplates();
          }}
        />
      )}
      <ProductPickerModal
        open={showProductPickerModal}
        onClose={() => setShowProductPickerModal(false)}
        items={availableItems}
        onItemSelect={toggleItemFromPicker}
        displayMode="contract"
        currency={currency}
        pickedItemIds={pickerPickedItemIds}
      />
      <ManualLineItemModal
        open={showManualLineModal}
        mode="contract"
        currency={currency}
        onClose={() => setShowManualLineModal(false)}
        onAdd={(data) => {
          setContractItems((prev) => [
            ...prev,
            {
              kind: 'manual',
              ClientId: `manual-${crypto.randomUUID()}`,
              IsManual: true,
              Description: data.Description,
              RentedQuantity: data.Quantity,
              UnitPriceSnapshot: data.DailyPrice,
              PriceUnit: (contractType === 'SALE' ? 'EACH' : 'DAY') as 'EACH' | 'DAY',
              PriceSource: 'MANUAL',
            },
          ]);
        }}
      />
      {settleItem && contract && (
        <SettleNonReturnModal
          contractId={contract.ContractId}
          item={settleItem.item}
          remainingOnRent={settleItem.remainingOnRent}
          currency={currency}
          onClose={() => setSettleItem(null)}
          onSuccess={() => {
            setSettleItem(null);
            refreshContract();
            loadContractReturns();
          }}
        />
      )}
      <PdfPreviewModal
        open={showPdfPreview}
        pdfUrl={pdfPreviewUrl}
        title={`Sözleşme #${contract?.ContractId ?? ''} Önizleme`}
        downloadFileName={`sozlesme_${contract?.ContractId ?? ''}.pdf`}
        onClose={closePdfPreview}
      />
      {selectedInventoryForDetail && (
        <InventoryDetailModal
          item={selectedInventoryForDetail}
          categories={inventoryCategories}
          isNew={false}
          stackAboveParent
          onCategoriesChanged={() => {
            void inventoryService.getAllCategoriesAsync().then(setInventoryCategories).catch(() => undefined);
          }}
          onClose={() => setSelectedInventoryForDetail(null)}
        />
      )}
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalTree, document.body) : null;
}

