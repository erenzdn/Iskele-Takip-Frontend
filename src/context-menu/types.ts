import type { ReactNode } from 'react';

export type ContextMenuKey = 'scaffoldRow' | 'customerRow' | 'contractRow' | 'quoteRow';
export type CustomerModalInitialTab = 'info' | 'sites' | 'history';

export type ContextMenuIntent = 'default' | 'danger';

export type ContextMenuActionHandlerKey =
  | 'scaffold.edit'
  | 'scaffold.stockEntry'
  | 'scaffold.delete'
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
  | 'contract.returnTab'
  | 'contract.complete'
  | 'contract.copyCode'
  | 'quote.open'
  | 'quote.copyCode'
  | 'quote.accept'
  | 'quote.rollback'
  | 'quote.convert'
  | 'quote.clone';

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
    UnitPrice?: number;
    MonthlyListPrice?: number;
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
    IsRental: boolean;
  };
}

export interface QuoteRowTarget {
  entityType: 'quote';
  entityId: number;
  itemName: string;
  rawData: {
    QuoteId: number;
    QuoteCode?: string;
    Status: 'pending' | 'accepted' | 'rejected';
  };
}

export type ContextMenuTarget = ScaffoldRowTarget | CustomerRowTarget | ContractRowTarget | QuoteRowTarget;

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
}

export type ContextMenuActionHandlers = Partial<
  Record<ContextMenuActionHandlerKey, (target: ContextMenuTarget) => void | Promise<void>>
>;
