import { create } from 'zustand';
import type { CustomerColumnKey, InventoryColumnKey } from '../constants/tableColumns';
import {
  CUSTOMER_TABLE_COLUMNS,
  INVENTORY_TABLE_COLUMNS,
} from '../constants/tableColumns';

const STORAGE_KEY = 'ui_table_column_preferences';

export type TableColumnPreferences = {
  inventory: Record<InventoryColumnKey, boolean>;
  customers: Record<CustomerColumnKey, boolean>;
};

const REQUIRED_INVENTORY: ReadonlySet<InventoryColumnKey> = new Set(
  INVENTORY_TABLE_COLUMNS.filter((c) => c.required).map((c) => c.key)
);
const REQUIRED_CUSTOMERS: ReadonlySet<CustomerColumnKey> = new Set(
  CUSTOMER_TABLE_COLUMNS.filter((c) => c.required).map((c) => c.key)
);

function defaultInventoryVisibility(): Record<InventoryColumnKey, boolean> {
  return Object.fromEntries(
    INVENTORY_TABLE_COLUMNS.map((c) => [c.key, true])
  ) as Record<InventoryColumnKey, boolean>;
}

function defaultCustomerVisibility(): Record<CustomerColumnKey, boolean> {
  return Object.fromEntries(
    CUSTOMER_TABLE_COLUMNS.map((c) => [c.key, true])
  ) as Record<CustomerColumnKey, boolean>;
}

const DEFAULTS: TableColumnPreferences = {
  inventory: defaultInventoryVisibility(),
  customers: defaultCustomerVisibility(),
};

function mergeVisibility<TKey extends string>(
  defaults: Record<TKey, boolean>,
  raw: unknown,
  required: ReadonlySet<TKey>
): Record<TKey, boolean> {
  const result = { ...defaults };
  if (!raw || typeof raw !== 'object') return result;

  for (const key of Object.keys(defaults) as TKey[]) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value !== 'boolean') continue;
    if (required.has(key)) {
      result[key] = true;
      continue;
    }
    result[key] = value;
  }
  return result;
}

function readPersisted(): TableColumnPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<TableColumnPreferences>;
    return {
      inventory: mergeVisibility(DEFAULTS.inventory, parsed.inventory, REQUIRED_INVENTORY),
      customers: mergeVisibility(DEFAULTS.customers, parsed.customers, REQUIRED_CUSTOMERS),
    };
  } catch {
    return DEFAULTS;
  }
}

function persist(prefs: TableColumnPreferences) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage erişimi engellenirse sessizce devam et
  }
}

interface TableColumnPreferencesState extends TableColumnPreferences {
  setInventoryColumnVisible: (key: InventoryColumnKey, value: boolean) => void;
  setCustomerColumnVisible: (key: CustomerColumnKey, value: boolean) => void;
}

const initial = readPersisted();

export const useTableColumnPreferencesStore = create<TableColumnPreferencesState>((set, get) => ({
  ...initial,
  setInventoryColumnVisible: (key, value) => {
    if (REQUIRED_INVENTORY.has(key)) return;
    const inventory = { ...get().inventory, [key]: value };
    const next = { inventory, customers: get().customers };
    persist(next);
    set({ inventory });
  },
  setCustomerColumnVisible: (key, value) => {
    if (REQUIRED_CUSTOMERS.has(key)) return;
    const customers = { ...get().customers, [key]: value };
    const next = { inventory: get().inventory, customers };
    persist(next);
    set({ customers });
  },
}));
