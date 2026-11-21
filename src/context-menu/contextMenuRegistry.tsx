import {
  ArchiveIcon,
  ArrowCounterClockwiseIcon,
  PaperclipIcon,
  XCircleIcon,
  ArrowSquareOutIcon,
  ArrowUDownLeftIcon,
  CalendarDotsIcon,
  CalendarPlusIcon,
  ClockCounterClockwiseIcon,
  FilesIcon,
  ListBulletsIcon,
  ReceiptIcon,
  TruckIcon,
  BuildingsIcon,
  CheckCircleIcon,
  CircleIcon,
  ClipboardTextIcon,
  ClockIcon,
  CopySimpleIcon,
  CopyIcon,
  ArrowsCounterClockwiseIcon,
  EnvelopeSimpleIcon,
  FilePdfIcon,
  ChecksIcon,
  NotePencilIcon,
  PencilSimpleIcon,
  PhoneIcon,
  PlusCircleIcon,
  TagIcon,
  TrashIcon,
  WrenchIcon,
} from '@phosphor-icons/react';
import { isInventoryArchived } from '../models';
import type {
  ContextMenuActionConfig,
  ContextMenuEnvironment,
  ContextMenuKey,
  ContextMenuTarget,
  ShipmentRowTarget,
} from './types';

const iconSize = 16;
const isScaffoldTarget = (target: ContextMenuTarget) => target.entityType === 'scaffold';
const isScaffoldArchived = (target: ContextMenuTarget) =>
  isScaffoldTarget(target) && isInventoryArchived(target.rawData);
const isCustomerTarget = (target: ContextMenuTarget) => target.entityType === 'customer';
const isContractTarget = (target: ContextMenuTarget) => target.entityType === 'contract';
const isQuoteTarget = (target: ContextMenuTarget) => target.entityType === 'quote';
const isShipmentTarget = (target: ContextMenuTarget): target is ShipmentRowTarget =>
  target.entityType === 'shipment';
/** Açık (tamamlanmamış, iptal/arşiv olmayan) kiralama sözleşmesi */
const isActiveRental = (target: ContextMenuTarget) =>
  Boolean(
    isContractTarget(target) &&
      target.rawData.IsRental &&
      !target.rawData.IsCompleted &&
      !target.rawData.IsCancelled &&
      !target.rawData.IsArchived
  );
const isShipmentModeContract = (target: ContextMenuTarget) =>
  Boolean(isContractTarget(target) && target.rawData.IsShipmentMode);
const pendingShipmentQty = (target: ContextMenuTarget) =>
  isContractTarget(target) ? Number(target.rawData.PendingShipmentQuantity) || 0 : 0;
const shippedQty = (target: ContextMenuTarget) =>
  isContractTarget(target) ? Number(target.rawData.ShippedQuantityTotal) || 0 : 0;
const hasAnyPermission = (env: ContextMenuEnvironment, permissions: string[]) =>
  permissions.some((permission) => env.permissions.includes(permission));

const registry: Record<ContextMenuKey, ContextMenuActionConfig[]> = {
  scaffoldRow: [
    {
      id: 'selection-direct',
      label: 'Sec',
      icon: <ChecksIcon size={iconSize} />,
      handlerKey: 'scaffold.selection.toggle',
      visibleWhen: (_target, env) => !env.selectionMode,
    },
    {
      id: 'selection',
      label: 'Sec',
      icon: <ChecksIcon size={iconSize} />,
      visibleWhen: (_target, env) => Boolean(env.selectionMode),
      children: [
        {
          id: 'selection-toggle',
          label: 'Bu Satiri Sec/Kaldir',
          icon: <ChecksIcon size={iconSize} />,
          handlerKey: 'scaffold.selection.toggle',
        },
        {
          id: 'selection-select-all',
          label: 'Tum Satirlari Sec',
          icon: <CheckCircleIcon size={iconSize} />,
          handlerKey: 'scaffold.selection.selectAll',
        },
        {
          id: 'selection-clear',
          label: 'Secimi Temizle',
          icon: <CircleIcon size={iconSize} />,
          handlerKey: 'scaffold.selection.clear',
        },
      ],
    },
    {
      id: 'edit-root',
      label: 'Duzenle',
      icon: <NotePencilIcon size={iconSize} />,
      children: [
        {
          id: 'open-detail',
          label: 'Detay Ac',
          icon: <NotePencilIcon size={iconSize} />,
          handlerKey: 'scaffold.edit',
        },
        {
          id: 'stock-entry',
          label: 'Stok Gir',
          icon: <PlusCircleIcon size={iconSize} />,
          requiredPermissions: ['inventory_update'],
          enabledWhen: (target) =>
            isScaffoldTarget(target) &&
            !isScaffoldArchived(target) &&
            target.rawData.TotalStock >= 0,
          handlerKey: 'scaffold.stockEntry',
        },
        {
          id: 'delete',
          label: 'Listeden Kaldır',
          icon: <TrashIcon size={iconSize} />,
          intent: 'danger',
          requiredPermissions: ['inventory_delete'],
          enabledWhen: (target) =>
            isScaffoldTarget(target) &&
            !isScaffoldArchived(target) &&
            target.rawData.OnRent === 0,
          handlerKey: 'scaffold.delete',
          confirm: {
            title: 'Ürünü pasife almak istiyor musunuz?',
            message: (target) =>
              `"${target.itemName}" ürününü pasife almak istediğinize emin misiniz? Pasif ürünler yeni teklif ve sözleşmelerde seçilemez; geçmiş kayıtlar korunur.`,
            confirmLabel: 'Listeden Kaldır',
          },
        },
        {
          id: 'restore',
          label: 'Geri Getir',
          icon: <ArrowsCounterClockwiseIcon size={iconSize} />,
          requiredPermissions: ['inventory_delete'],
          enabledWhen: (target) => isScaffoldTarget(target) && isScaffoldArchived(target),
          handlerKey: 'scaffold.restore',
        },
      ],
    },
    {
      id: 'movements',
      label: 'Hareketler',
      icon: <ClockIcon size={iconSize} />,
      handlerKey: 'scaffold.movements',
    },
    {
      id: 'status',
      label: 'Durum Degistir',
      icon: <CircleIcon size={iconSize} />,
      children: [
        {
          id: 'status-active',
          label: 'Aktif',
          icon: <CheckCircleIcon size={iconSize} />,
          requiredPermissions: ['inventory_update'],
          enabledWhen: (target) =>
            isScaffoldTarget(target) && !isScaffoldArchived(target) && target.rawData.TotalStock > 0,
          handlerKey: 'scaffold.status.active',
        },
        {
          id: 'status-passive',
          label: 'Pasif',
          icon: <CircleIcon size={iconSize} />,
          requiredPermissions: ['inventory_update'],
          enabledWhen: (target) =>
            isScaffoldTarget(target) && !isScaffoldArchived(target) && target.rawData.TotalStock > 0,
          handlerKey: 'scaffold.status.passive',
        },
        {
          id: 'status-maintenance',
          label: 'Bakimda',
          icon: <WrenchIcon size={iconSize} />,
          requiredPermissions: ['inventory_update'],
          enabledWhen: (target) =>
            isScaffoldTarget(target) && !isScaffoldArchived(target) && target.rawData.TotalStock > 0,
          handlerKey: 'scaffold.status.maintenance',
        },
      ],
    },
    {
      id: 'pdf',
      label: 'PDF Al',
      icon: <FilePdfIcon size={iconSize} />,
      requiredPermissions: ['inventory_view'],
      handlerKey: 'scaffold.exportPdf',
    },
  ],
  customerRow: [
    {
      id: 'customer-open',
      label: 'Musteri Detayi',
      icon: <ClipboardTextIcon size={iconSize} />,
      requiredPermissions: ['customers_view'],
      handlerKey: 'customer.detail',
    },
    {
      id: 'customer-edit-root',
      label: 'Duzenle',
      icon: <NotePencilIcon size={iconSize} />,
      children: [
        {
          id: 'customer-edit',
          label: 'Bilgileri Duzenle',
          icon: <NotePencilIcon size={iconSize} />,
          requiredPermissions: ['customers_update'],
          handlerKey: 'customer.edit',
        },
        {
          id: 'customer-sites',
          label: 'Santiyelere Git',
          icon: <BuildingsIcon size={iconSize} />,
          requiredPermissions: ['customers_update'],
          handlerKey: 'customer.sites',
        },
        {
          id: 'customer-delete',
          label: 'Arşivle',
          icon: <TrashIcon size={iconSize} />,
          intent: 'danger',
          requiredPermissions: ['customers_delete'],
          handlerKey: 'customer.delete',
          confirm: {
            title: 'Müşteriyi arşivlemek istiyor musunuz?',
            message: (target) =>
              `"${target.itemName}" kaydı listeden kaldırılacak (arşivlenecek). Onaylıyor musunuz?`,
            confirmLabel: 'Arşivle',
          },
        },
      ],
    },
    {
      id: 'customer-quick-actions',
      label: 'Hizli Iletisim',
      icon: <CopyIcon size={iconSize} />,
      children: [
        {
          id: 'customer-copy-phone',
          label: 'Telefonu Kopyala',
          icon: <PhoneIcon size={iconSize} />,
          handlerKey: 'customer.copyPhone',
          enabledWhen: (target) => Boolean(isCustomerTarget(target) && target.rawData.PhoneNumber),
        },
        {
          id: 'customer-copy-email',
          label: 'E-posta Kopyala',
          icon: <EnvelopeSimpleIcon size={iconSize} />,
          handlerKey: 'customer.copyEmail',
          enabledWhen: (target) => Boolean(isCustomerTarget(target) && target.rawData.Email),
        },
      ],
    },
  ],
  contractRow: [
    {
      id: 'contract-open',
      label: 'Sözleşmeyi Aç',
      icon: <ClipboardTextIcon size={iconSize} />,
      handlerKey: 'contract.open',
    },
    {
      id: 'contract-ship',
      label: 'Sevk Et',
      icon: <TruckIcon size={iconSize} />,
      handlerKey: 'contract.ship',
      // Sevkiyatlar sekmesi contracts_view ister; fiş penceresi o sekmede açılır
      requiredPermissions: ['shipments_create', 'contracts_view'],
      visibleWhen: (target) => isActiveRental(target) && isShipmentModeContract(target),
      enabledWhen: (target) => pendingShipmentQty(target) > 0,
      hint: (target) => {
        const pending = pendingShipmentQty(target);
        return pending > 0 ? `${pending} adet bekliyor` : 'Tamamı sevk edildi';
      },
    },
    {
      id: 'contract-return-tab',
      label: 'İade Al',
      icon: <ArrowUDownLeftIcon size={iconSize} />,
      handlerKey: 'contract.returnTab',
      visibleWhen: (target) => isActiveRental(target),
      enabledWhen: (target) => !isShipmentModeContract(target) || shippedQty(target) > 0,
      hint: (target) =>
        isShipmentModeContract(target) && shippedQty(target) <= 0 ? 'Henüz sevk yok' : undefined,
    },
    {
      id: 'contract-goto',
      label: 'Sekmeye Git',
      icon: <ArrowSquareOutIcon size={iconSize} />,
      children: [
        {
          id: 'contract-goto-shipments',
          label: 'Sevkiyatlar',
          icon: <TruckIcon size={iconSize} />,
          handlerKey: 'contract.goto.shipments',
          requiredPermissions: ['contracts_view'],
          visibleWhen: (target) => isShipmentModeContract(target),
        },
        {
          id: 'contract-goto-returns',
          label: 'İade Geçmişi',
          icon: <ClockCounterClockwiseIcon size={iconSize} />,
          handlerKey: 'contract.goto.returns',
          visibleWhen: (target) => isContractTarget(target) && target.rawData.IsRental,
        },
        {
          id: 'contract-goto-billing',
          label: 'Faturalama Planı',
          icon: <CalendarDotsIcon size={iconSize} />,
          handlerKey: 'contract.goto.billing',
          requiredPermissions: ['contracts_view'],
        },
        {
          id: 'contract-goto-invoices',
          label: 'Faturalar',
          icon: <ReceiptIcon size={iconSize} />,
          handlerKey: 'contract.goto.invoices',
          visibleWhen: (_target, env) =>
            hasAnyPermission(env, ['contracts_view', 'contracts_invoice']),
        },
        {
          id: 'contract-goto-addenda',
          label: 'Zeyilnameler',
          icon: <FilesIcon size={iconSize} />,
          handlerKey: 'contract.goto.addenda',
          requiredPermissions: ['contracts_view'],
        },
        {
          id: 'contract-goto-extensions',
          label: 'Uzatmalar',
          icon: <CalendarPlusIcon size={iconSize} />,
          handlerKey: 'contract.goto.extensions',
          visibleWhen: (target, env) =>
            isContractTarget(target) &&
            target.rawData.IsRental &&
            hasAnyPermission(env, ['contracts_view', 'contracts_extend']),
        },
        {
          id: 'contract-goto-history',
          label: 'Geçmiş',
          icon: <ClockIcon size={iconSize} />,
          handlerKey: 'contract.goto.history',
        },
      ],
    },
    {
      id: 'contract-copy-code',
      label: 'Kodu Kopyala',
      icon: <CopySimpleIcon size={iconSize} />,
      handlerKey: 'contract.copyCode',
      separatorBefore: true,
      enabledWhen: (target) => Boolean(isContractTarget(target) && target.rawData.ContractCode),
    },
    {
      id: 'contract-categories',
      label: 'Kategorileri Düzenle',
      icon: <TagIcon size={iconSize} />,
      requiredPermissions: ['contracts_update'],
      handlerKey: 'contract.categories',
    },
    {
      id: 'contract-complete',
      label: 'Sözleşmeyi Tamamla',
      icon: <CheckCircleIcon size={iconSize} />,
      handlerKey: 'contract.complete',
      separatorBefore: true,
      visibleWhen: (target) => isActiveRental(target),
      confirm: {
        title: 'Sözleşme tamamlansın mı?',
        message: (target) => `"${target.itemName}" sözleşmesini tamamlamak istediğinize emin misiniz?`,
        confirmLabel: 'Tamamla',
      },
    },
    {
      id: 'contract-archive',
      label: 'Arşivle',
      icon: <ArchiveIcon size={iconSize} />,
      handlerKey: 'contract.archive',
      separatorBefore: true,
      visibleWhen: (target, env) =>
        Boolean(
          isContractTarget(target) &&
            !target.rawData.IsArchived &&
            (target.rawData.IsCompleted || target.rawData.IsCancelled) &&
            hasAnyPermission(env, ['contracts_archive', 'contracts_delete'])
        ),
    },
    {
      id: 'contract-unarchive',
      label: 'Arşivden Geri Getir',
      icon: <ArrowsCounterClockwiseIcon size={iconSize} />,
      handlerKey: 'contract.unarchive',
      separatorBefore: true,
      visibleWhen: (target, env) =>
        Boolean(
          isContractTarget(target) &&
            target.rawData.IsArchived &&
            hasAnyPermission(env, ['contracts_archive', 'contracts_delete'])
        ),
    },
  ],
  quoteRow: [
    {
      id: 'quote-open',
      label: 'Teklif Detayi',
      icon: <ClipboardTextIcon size={iconSize} />,
      handlerKey: 'quote.open',
    },
    {
      id: 'quote-preview',
      label: 'Onizle',
      icon: <FilePdfIcon size={iconSize} />,
      handlerKey: 'quote.preview',
    },
    {
      id: 'quote-copy-code',
      label: 'Kod Kopyala',
      icon: <CopySimpleIcon size={iconSize} />,
      handlerKey: 'quote.copyCode',
      enabledWhen: (target) => Boolean(isQuoteTarget(target) && target.rawData.QuoteCode),
    },
    {
      id: 'quote-categories',
      label: 'Kategorileri Düzenle',
      icon: <TagIcon size={iconSize} />,
      requiredPermissions: ['quotes_update'],
      handlerKey: 'quote.categories',
    },
    {
      id: 'quote-clone',
      label: 'Teklifi Kopyala',
      icon: <CopyIcon size={iconSize} />,
      handlerKey: 'quote.clone',
      confirm: {
        title: 'Teklifi Kopyala',
        message: (target) =>
          `"${target.itemName}" teklifini yeni bir taslak teklif olarak kopyalamak istiyor musunuz?\n\nYeni teklifin durumu "Taslak" olur, teklif kodu bos gelir; tum fiyatlar ve kalemler aynen kopyalanir.`,
        confirmLabel: 'Kopyala',
      },
    },
    {
      id: 'quote-flow',
      label: 'Teklif Akisi',
      icon: <CheckCircleIcon size={iconSize} />,
      children: [
        {
          id: 'quote-accept',
          label: 'Kabul Et',
          icon: <CheckCircleIcon size={iconSize} />,
          handlerKey: 'quote.accept',
          enabledWhen: (target) =>
            Boolean(
              isQuoteTarget(target) &&
                target.rawData.Status !== 'accepted' &&
                target.rawData.Status !== 'draft' &&
                !target.rawData.ConvertedContractId
            ),
        },
        {
          id: 'quote-rollback',
          label: 'Geri Al (Beklemede)',
          icon: <ArrowsCounterClockwiseIcon size={iconSize} />,
          handlerKey: 'quote.rollback',
          enabledWhen: (target) =>
            Boolean(
              isQuoteTarget(target) &&
                target.rawData.Status !== 'pending' &&
                target.rawData.Status !== 'draft' &&
                !target.rawData.ConvertedContractId
            ),
        },
        {
          id: 'quote-convert',
          label: 'Sozlesmeye Donustur',
          icon: <ClipboardTextIcon size={iconSize} />,
          handlerKey: 'quote.convert',
          enabledWhen: (target) =>
            Boolean(
              isQuoteTarget(target) &&
                target.rawData.Status === 'accepted' &&
                !target.rawData.ConvertedContractId
            ),
        },
      ],
    },
    {
      id: 'quote-open-contract',
      label: 'Sozlesmeye git',
      icon: <ClipboardTextIcon size={iconSize} />,
      handlerKey: 'quote.openContract',
      enabledWhen: (target) =>
        Boolean(isQuoteTarget(target) && target.rawData.ConvertedContractId),
    },
    {
      id: 'quote-delete',
      label: 'Teklifi Sil',
      icon: <TrashIcon size={iconSize} />,
      intent: 'danger',
      handlerKey: 'quote.delete',
      requiredPermissions: ['quotes_delete'],
      enabledWhen: (target) =>
        Boolean(isQuoteTarget(target) && !target.rawData.ConvertedContractId),
      confirm: {
        title: 'Teklifi silmek istiyor musunuz?',
        message: (target) =>
          `"${target.itemName}" teklifini silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.`,
        confirmLabel: 'Sil',
      },
    },
  ],
  awaitingShipmentRow: [
    {
      id: 'awaiting-ship',
      label: 'Sevk Et (Fiş Kes)',
      icon: <TruckIcon size={iconSize} />,
      handlerKey: 'contract.ship',
      requiredPermissions: ['shipments_create'],
      enabledWhen: (target) => pendingShipmentQty(target) > 0,
      hint: (target) => {
        const pending = pendingShipmentQty(target);
        return pending > 0 ? `${pending} adet bekliyor` : 'Tamamı sevk edildi';
      },
    },
    {
      id: 'awaiting-show-shipments',
      label: 'Kesilen Fişleri Göster',
      icon: <ListBulletsIcon size={iconSize} />,
      handlerKey: 'contract.showShipments',
      enabledWhen: (target) => shippedQty(target) > 0,
      hint: (target) => (shippedQty(target) > 0 ? `${shippedQty(target)} adet sevk edildi` : 'Henüz fiş yok'),
    },
    {
      id: 'awaiting-open-contract',
      label: 'Sözleşmeyi Aç',
      icon: <ClipboardTextIcon size={iconSize} />,
      handlerKey: 'contract.open',
      separatorBefore: true,
    },
    {
      id: 'awaiting-goto-shipments',
      label: 'Sözleşmenin Sevkiyat Sekmesi',
      icon: <ArrowSquareOutIcon size={iconSize} />,
      handlerKey: 'contract.goto.shipments',
      requiredPermissions: ['contracts_view'],
    },
    {
      id: 'awaiting-copy-code',
      label: 'Sözleşme Kodunu Kopyala',
      icon: <CopySimpleIcon size={iconSize} />,
      handlerKey: 'contract.copyCode',
      separatorBefore: true,
      enabledWhen: (target) => Boolean(isContractTarget(target) && target.rawData.ContractCode),
    },
  ],
  shipmentRow: [
    // ── Görüntüle ──
    {
      id: 'shipment-details',
      label: 'Ayrıntılar ve Belgeler',
      icon: <PaperclipIcon size={iconSize} />,
      handlerKey: 'shipment.details',
      hint: (target) => {
        if (!isShipmentTarget(target) || target.rawData.IsCancelled) return undefined;
        const count = target.rawData.AttachmentCount ?? 0;
        if (!target.rawData.HasSignedWaybill) return 'İrsaliye eksik';
        return count > 0 ? `${count} ek` : undefined;
      },
    },
    {
      id: 'shipment-preview',
      label: 'Sevk Fişi PDF',
      icon: <FilePdfIcon size={iconSize} />,
      handlerKey: 'shipment.preview',
    },
    {
      id: 'shipment-open-contract',
      label: 'Sözleşmeyi Aç',
      icon: <ClipboardTextIcon size={iconSize} />,
      handlerKey: 'shipment.openContract',
    },
    {
      id: 'shipment-filter-contract',
      label: 'Bu Sözleşmenin Tüm Fişleri',
      icon: <ListBulletsIcon size={iconSize} />,
      handlerKey: 'shipment.filterContract',
    },
    // ── Teslim ──
    {
      id: 'shipment-confirm-delivery',
      label: 'Teslimi Onayla',
      icon: <CheckCircleIcon size={iconSize} />,
      handlerKey: 'shipment.confirmDelivery',
      requiredPermissions: ['shipments_confirm_delivery'],
      separatorBefore: true,
      visibleWhen: (target) =>
        isShipmentTarget(target) && !target.rawData.IsCancelled && !target.rawData.IsDelivered,
      hint: (target) => {
        const days = isShipmentTarget(target) ? target.rawData.PendingDays ?? 0 : 0;
        return days > 0 ? `${days} gündür bekliyor` : undefined;
      },
    },
    {
      id: 'shipment-edit-delivery',
      label: 'Teslim Bilgisi ve Belgeler',
      icon: <NotePencilIcon size={iconSize} />,
      handlerKey: 'shipment.editDelivery',
      requiredPermissions: ['shipments_confirm_delivery'],
      separatorBefore: true,
      visibleWhen: (target) =>
        isShipmentTarget(target) && !target.rawData.IsCancelled && target.rawData.IsDelivered,
      hint: (target) =>
        isShipmentTarget(target) && !target.rawData.HasSignedWaybill ? 'İrsaliye eksik' : undefined,
    },
    {
      id: 'shipment-undo-delivery',
      label: 'Teslim Onayını Geri Al',
      icon: <ArrowCounterClockwiseIcon size={iconSize} />,
      handlerKey: 'shipment.undoDelivery',
      requiredPermissions: ['shipments_confirm_delivery'],
      visibleWhen: (target) =>
        isShipmentTarget(target) && !target.rawData.IsCancelled && target.rawData.IsDelivered,
      confirm: {
        title: 'Teslim onayı geri alınsın mı?',
        message: (target) =>
          `"${target.itemName}" fişinin teslim onayı kaldırılacak ve fiş "Teslim bekliyor" durumuna dönecek. Kira hesabı etkilenmez; yüklenen belgeler silinmez.`,
        confirmLabel: 'Geri Al',
      },
    },
    // ── Fiş ──
    {
      id: 'shipment-edit',
      label: 'Fişi Düzenle',
      icon: <PencilSimpleIcon size={iconSize} />,
      handlerKey: 'shipment.edit',
      requiredPermissions: ['shipments_update'],
      separatorBefore: true,
      visibleWhen: (target) => isShipmentTarget(target) && !target.rawData.IsCancelled,
    },
    {
      id: 'shipment-copy',
      label: 'Kopyala',
      icon: <CopySimpleIcon size={iconSize} />,
      children: [
        {
          id: 'shipment-copy-no',
          label: 'Fiş No',
          icon: <CopySimpleIcon size={iconSize} />,
          handlerKey: 'shipment.copyNo',
        },
        {
          id: 'shipment-copy-waybill',
          label: 'İrsaliye No',
          icon: <CopySimpleIcon size={iconSize} />,
          handlerKey: 'shipment.copyWaybill',
          enabledWhen: (target) => Boolean(isShipmentTarget(target) && target.rawData.ExternalWaybillNo),
          hint: (target) =>
            isShipmentTarget(target) && !target.rawData.ExternalWaybillNo ? 'Girilmemiş' : undefined,
        },
      ],
    },
    {
      id: 'shipment-cancel',
      label: 'Fişi İptal Et',
      icon: <XCircleIcon size={iconSize} />,
      intent: 'danger',
      handlerKey: 'shipment.cancel',
      requiredPermissions: ['shipments_cancel'],
      separatorBefore: true,
      visibleWhen: (target) => isShipmentTarget(target) && !target.rawData.IsCancelled,
    },
  ],
};

function hasRequiredPermissions(requiredPermissions: string[] | undefined, permissions: string[]) {
  if (!requiredPermissions || requiredPermissions.length === 0) return true;
  return requiredPermissions.every((permission) => permissions.includes(permission));
}

export function resolveContextMenuActions(
  menuKey: ContextMenuKey,
  target: ContextMenuTarget,
  env: ContextMenuEnvironment,
  /** Verilirse yalnızca karşılığı olan işlemler gösterilir */
  availableHandlers?: ReadonlySet<string>
): ContextMenuActionConfig[] {
  const source = registry[menuKey] ?? [];

  const resolve = (actions: ContextMenuActionConfig[]): ContextMenuActionConfig[] =>
    actions
      .filter((action) => {
        if (!hasRequiredPermissions(action.requiredPermissions, env.permissions)) return false;
        if (action.visibleWhen && !action.visibleWhen(target, env)) return false;
        if (availableHandlers && action.handlerKey && !availableHandlers.has(action.handlerKey)) return false;
        return true;
      })
      .map((action) => ({
        ...action,
        disabled: action.enabledWhen ? !action.enabledWhen(target, env) : false,
        hintText: action.hint ? action.hint(target, env) : undefined,
        children: action.children ? resolve(action.children) : undefined,
      }))
      .filter((action) => (action.children ? action.children.length > 0 || Boolean(action.handlerKey) : true));

  const resolved = resolve(source);
  if (resolved.length > 0) return resolved;
  return [
    {
      id: 'no-actions',
      label: 'Bu kayit icin uygun islem yok',
      disabled: true,
    },
  ];
}
