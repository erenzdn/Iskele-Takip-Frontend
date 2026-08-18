import {
  ArchiveIcon,
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
  PhoneIcon,
  PlusCircleIcon,
  TrashIcon,
  WrenchIcon,
} from '@phosphor-icons/react';
import { isInventoryArchived } from '../models';
import type { ContextMenuActionConfig, ContextMenuEnvironment, ContextMenuKey, ContextMenuTarget } from './types';

const iconSize = 16;
const isScaffoldTarget = (target: ContextMenuTarget) => target.entityType === 'scaffold';
const isScaffoldArchived = (target: ContextMenuTarget) =>
  isScaffoldTarget(target) && isInventoryArchived(target.rawData);
const isCustomerTarget = (target: ContextMenuTarget) => target.entityType === 'customer';
const isContractTarget = (target: ContextMenuTarget) => target.entityType === 'contract';
const isQuoteTarget = (target: ContextMenuTarget) => target.entityType === 'quote';

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
      label: 'Sozlesme Detayi',
      icon: <ClipboardTextIcon size={iconSize} />,
      handlerKey: 'contract.open',
    },
    {
      id: 'contract-copy-code',
      label: 'Kod Kopyala',
      icon: <CopySimpleIcon size={iconSize} />,
      handlerKey: 'contract.copyCode',
      enabledWhen: (target) => Boolean(isContractTarget(target) && target.rawData.ContractCode),
    },
    {
      id: 'contract-return-tab',
      label: 'Iade Al Sekmesine Git',
      icon: <ClockIcon size={iconSize} />,
      handlerKey: 'contract.returnTab',
      enabledWhen: (target) =>
        Boolean(
          isContractTarget(target) &&
            target.rawData.IsRental &&
            !target.rawData.IsCompleted &&
            !target.rawData.IsCancelled &&
            !target.rawData.IsArchived
        ),
    },
    {
      id: 'contract-archive',
      label: 'Arsivle',
      icon: <ArchiveIcon size={iconSize} />,
      handlerKey: 'contract.archive',
      enabledWhen: (target) =>
        Boolean(
          isContractTarget(target) &&
            !target.rawData.IsArchived &&
            (target.rawData.IsCompleted || target.rawData.IsCancelled)
        ),
    },
    {
      id: 'contract-unarchive',
      label: 'Geri Getir',
      icon: <ArrowsCounterClockwiseIcon size={iconSize} />,
      handlerKey: 'contract.unarchive',
      enabledWhen: (target) =>
        Boolean(isContractTarget(target) && target.rawData.IsArchived),
    },
    {
      id: 'contract-complete',
      label: 'Sozlesmeyi Tamamla',
      icon: <CheckCircleIcon size={iconSize} />,
      handlerKey: 'contract.complete',
      enabledWhen: (target) =>
        Boolean(
          isContractTarget(target) &&
            target.rawData.IsRental &&
            !target.rawData.IsCompleted &&
            !target.rawData.IsCancelled &&
            !target.rawData.IsArchived
        ),
      confirm: {
        title: 'Sozlesme tamamlansin mi?',
        message: (target) => `"${target.itemName}" sozlesmesini tamamlamak istediginize emin misiniz?`,
        confirmLabel: 'Tamamla',
      },
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
};

function hasRequiredPermissions(requiredPermissions: string[] | undefined, permissions: string[]) {
  if (!requiredPermissions || requiredPermissions.length === 0) return true;
  return requiredPermissions.every((permission) => permissions.includes(permission));
}

export function resolveContextMenuActions(
  menuKey: ContextMenuKey,
  target: ContextMenuTarget,
  env: ContextMenuEnvironment
): ContextMenuActionConfig[] {
  const source = registry[menuKey] ?? [];

  const resolve = (actions: ContextMenuActionConfig[]): ContextMenuActionConfig[] =>
    actions
      .filter((action) => {
        if (!hasRequiredPermissions(action.requiredPermissions, env.permissions)) return false;
        if (action.visibleWhen && !action.visibleWhen(target, env)) return false;
        return true;
      })
      .map((action) => ({
        ...action,
        disabled: action.enabledWhen ? !action.enabledWhen(target, env) : false,
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
