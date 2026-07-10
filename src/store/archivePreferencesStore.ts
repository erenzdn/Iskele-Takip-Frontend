import { create } from 'zustand';

const STORAGE_KEY = 'ui_archive_preferences';

export type ArchivePreferences = {
  showArchivedWarehouses: boolean;
  showArchivedInventory: boolean;
};

const DEFAULTS: ArchivePreferences = {
  showArchivedWarehouses: false,
  showArchivedInventory: false,
};

function readPersisted(): ArchivePreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<ArchivePreferences>;
    return {
      showArchivedWarehouses:
        typeof parsed.showArchivedWarehouses === 'boolean'
          ? parsed.showArchivedWarehouses
          : DEFAULTS.showArchivedWarehouses,
      showArchivedInventory:
        typeof parsed.showArchivedInventory === 'boolean'
          ? parsed.showArchivedInventory
          : DEFAULTS.showArchivedInventory,
    };
  } catch {
    return DEFAULTS;
  }
}

function persist(prefs: ArchivePreferences) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage erişimi engellenirse sessizce devam et
  }
}

interface ArchivePreferencesState extends ArchivePreferences {
  setShowArchivedWarehouses: (value: boolean) => void;
  setShowArchivedInventory: (value: boolean) => void;
}

const initial = readPersisted();

export const useArchivePreferencesStore = create<ArchivePreferencesState>((set, get) => ({
  ...initial,
  setShowArchivedWarehouses: (value) => {
    persist({
      showArchivedWarehouses: value,
      showArchivedInventory: get().showArchivedInventory,
    });
    set({ showArchivedWarehouses: value });
  },
  setShowArchivedInventory: (value) => {
    persist({
      showArchivedWarehouses: get().showArchivedWarehouses,
      showArchivedInventory: value,
    });
    set({ showArchivedInventory: value });
  },
}));
