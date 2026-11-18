import type { ReactNode } from 'react';

export type ContextMenuKey = 'scaffoldRow' | 'customerRow' | 'contractRow' | 'quoteRow' | 'shipmentRow';
export type CustomerModalInitialTab = 'info' | 'sites' | 'history';

export type ContextMenuIntent = 'default' | 'danger';

export type ContextMenuActionHandlerKey =
  | 'scaffold.edit'
  | 'scaffold.stockEntry'
  | 'scaffold.movements'
  | 'scaffold.delete'
  | 'scaffold.restore'
  | 'scaffold.exportPdf'
  | 'scaffold.selection.toggle'
  | 'scaffold.selection.selectAll'
  | 'scaffold.selection.clear'
  | 'scaffold.status.active'
  | 'scaffold.status.passive'
  | 'scaffold.status.maintenance'
  | 'customer.detail'
  | 'customer.edit'
  | 'customer.sites'
  | 'customer.copyPhone'
  | 'customer.copyEmail'
  | 'customer.delete'
  | 'contract.open'
  | 'contract.ship'
  | 'contract.goto.shipments'
  | 'contract.goto.returns'
  | 'contract.goto.billing'
  | 'contract.goto.invoices'
  | 'contract.goto.addenda'
  | 'contract.goto.extensions'
  | 'contract.goto.history'
  | 'contract.returnTab'
  | 'contract.complete'
  | 'contract.copyCode'
  | 'contract.archive'
  | 'contract.unarchive'
  | 'contract.categories'
  | 'quote.open'
  | 'quote.preview'
  | 'quote.copyCode'
  | 'quote.accept'
  | 'quote.rollback'
  | 'quote.convert'
  | 'quote.openContract'
  | 'quote.clone'
  | 'quote.delete'
  | 'quote.categories'
  | 'shipment.details'
  | 'shipment.openContract'
  | 'shipment.preview'
  | 'shipment.confirmDelivery'
  | 'shipment.editDelivery'
  | 'shipment.undoDelivery'
  | 'shipment.copyNo'
  | 'shipment.copyWaybill'
  | 'shipment.cancel';

export interface ScaffoldRowTarget {
  entityType: 'scaffold';
  entityId: number;
  itemName: string;
  rawData: {
    ItemId: number;
    ItemName: string;
    ItemCode?: string;
    TotalStock: number;
    OnRent: number;
    /** Sevk bekleyen sözleşmelere rezerve miktar */
    Reserved?: number;
    UnitPrice?: number;
    MonthlyListPrice?: number;
    DeletedAt?: string | null;
    deletedAt?: string | null;
    IsArchived?: boolean;
    isArchived?: boolean;
  };
}

export interface CustomerRowTarget {
  entityType: 'customer';
  entityId: number;
  itemName: string;
  rawData: {
    CustomerId: number;
    Name: string;
    PhoneNumber?: string;
    Email?: string;
    ContractCount: number;
  };
}

export interface ContractRowTarget {
  entityType: 'contract';
  entityId: number;
  itemName: string;
  rawData: {
    ContractId: number;
    ContractCode?: string;
    IsCompleted: boolean;
    IsCancelled?: boolean;
    IsArchived?: boolean;
    IsRental: boolean;
    /** Sevkiyat (SHIPMENT) teslim modundaki kiralama sözleşmesi */
    IsShipmentMode?: boolean;
    /** Sevk bekleyen (rezerve) toplam miktar */
    PendingShipmentQuantity?: number;
    /** Sevk edilmiş toplam miktar */
    ShippedQuantityTotal?: number;
    ListTab?: 'active' | 'completed' | 'cancelled' | 'archived' | 'quotes' | 'quotesConverted';
  };
}

export interface QuoteRowTarget {
  entityType: 'quote';
  entityId: number;
  itemName: string;
  rawData: {
    QuoteId: number;
    QuoteCode?: string;
    Status: 'draft' | 'pending' | 'accepted' | 'rejected';
    ConvertedContractId?: number;
  };
}

export interface ShipmentRowTarget {
  entityType: 'shipment';
  entityId: number;
  itemName: string;
  rawData: {
    ShipmentId: number;
    ShipmentNo: string;
    ContractId: number;
    IsCancelled: boolean;
    IsDelivered: boolean;
    ExternalWaybillNo?: string | null;
    AttachmentCount?: number;
    HasSignedWaybill?: boolean;
  };
}

export type ContextMenuTarget =
  | ScaffoldRowTarget
  | CustomerRowTarget
  | ContractRowTarget
  | QuoteRowTarget
  | ShipmentRowTarget;

export interface ContextMenuEnvironment {
  permissions: string[];
  selectionMode?: boolean;
}

export interface ContextMenuActionConfig {
  id: string;
  label: string;
  icon?: ReactNode;
  intent?: ContextMenuIntent;
  disabled?: boolean;
  requiredPermissions?: string[];
  handlerKey?: ContextMenuActionHandlerKey;
  visibleWhen?: (target: ContextMenuTarget, env: ContextMenuEnvironment) => boolean;
  enabledWhen?: (target: ContextMenuTarget, env: ContextMenuEnvironment) => boolean;
  /** Etiketin sağında gösterilen kısa bilgi (ör. "12 adet bekliyor", "Henüz sevk yok") */
  hint?: (target: ContextMenuTarget, env: ContextMenuEnvironment) => string | undefined;
  /** Çözümlenmiş ipucu metni (resolveContextMenuActions doldurur) */
  hintText?: string;
  /** Öğenin üstüne ayraç çizgisi koy (gruplama) */
  separatorBefore?: boolean;
  confirm?: {
    title: string;
    message: (target: ContextMenuTarget) => string;
    confirmLabel?: string;
  };
  children?: ContextMenuActionConfig[];
}

export interface OpenContextMenuPayload {
  menuKey: ContextMenuKey;
  target: ContextMenuTarget;
  x: number;
  y: number;
  env?: Partial<ContextMenuEnvironment>;
  /**
   * Menüyü açan ekranın işlemleri. Verilirse kayıtlı (useContextMenuHandlers) işlemlerin yerine
   * bunlar kullanılır; aynı menü türü birden çok açık sekmede olduğunda doğru ekran çalışır.
   * Karşılığı olmayan öğeler menüde gösterilmez.
   */
  handlers?: ContextMenuActionHandlers;
}

export type ContextMenuActionHandlers = Partial<
  Record<ContextMenuActionHandlerKey, (target: ContextMenuTarget) => void | Promise<void>>
>;
