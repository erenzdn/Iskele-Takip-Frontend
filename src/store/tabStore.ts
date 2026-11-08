import { create } from 'zustand';
import { useAuthStore } from './authStore';
import { buildTabId, resolveTabPath, titleForPath } from '../routes';

export interface TabLocation {
  pathname: string;
  search: string;
  hash: string;
  state: unknown;
}

export interface Tab {
  id: string;
  title: string;
  customTitle: string | null;
  pinned: boolean;
  dirty: boolean;
  refreshKey: number;
  location: TabLocation;
  lastAccessTime: number;
}

/**
 * - `push`: hedef sekmeyi açar / öne getirir (kaynak sekme yerinde kalır).
 * - `replace`: kaynak sekmenin yerini hedef alır (ör. "yeni kayıt" → kaydedilen kayıt).
 */
export type TabNavigationMode = 'push' | 'replace';

interface TabState {
  tabs: Tab[];
  activeTabId: string | null;
  closedStack: Tab[];
  /** Kapatılması onay bekleyen sekmeler */
  pendingCloseIds: string[] | null;

  /** Sekme dışından gelen gezinme (sol menü, adres değişikliği, giriş sonrası vb.) */
  openLocation: (location: TabLocation) => void;
  /** Bir sekmenin içinden yapılan gezinme */
  navigateInTab: (sourceTabId: string, location: TabLocation, mode: TabNavigationMode) => void;
  requestClose: (tabId: string) => void;
  requestCloseMany: (tabIds: string[]) => void;
  confirmPendingClose: () => void;
  dismissPendingClose: () => void;
  closeOtherTabs: (tabId: string) => void;
  closeTabsToRight: (tabId: string) => void;
  closeAllTabs: () => void;
  setActiveTab: (tabId: string) => void;
  activateByIndex: (index: number) => void;
  setTabTitle: (tabId: string, title: string | null) => void;
  setTabDirty: (tabId: string, dirty: boolean) => void;
  pinTab: (tabId: string, pinned: boolean) => void;
  moveTab: (sourceId: string, targetId: string) => void;
  refreshTab: (tabId: string) => void;
  reopenClosedTab: () => void;
}

export const DASHBOARD_TAB_ID = '/';
export const MAX_LIVE_TABS = 8;
const MAX_CLOSED = 10;
const MAX_STATE_BYTES = 500_000;
const PERSIST_DELAY_MS = 250;
const LEGACY_SESSION_KEY = 'app_tabs';

const dashboardTab = (): Tab => ({
  id: DASHBOARD_TAB_ID,
  title: 'Dashboard',
  customTitle: null,
  pinned: true,
  dirty: false,
  refreshKey: 0,
  location: { pathname: '/', search: '', hash: '', state: null },
  lastAccessTime: Date.now(),
});

function defaultTabs(): Tab[] {
  return [dashboardTab()];
}

/** Kayıt başarılı olduktan sonra kapatma onayı çıkmasın. */
export function acknowledgeTabSaved(tabId?: string | null) {
  const id = tabId ?? useTabStore.getState().activeTabId;
  if (!id) return;
  useTabStore.getState().setTabDirty(id, false);
}

export function tabDisplayTitle(tab: Tab): string {
  return tab.customTitle?.trim() || tab.title;
}

export function locationHref(location: Pick<TabLocation, 'pathname' | 'search' | 'hash'>): string {
  return `${location.pathname}${location.search || ''}${location.hash || ''}`;
}

export function selectLiveTabIds(tabs: Tab[], activeTabId: string | null): string[] {
  const must = new Set<string>();
  if (activeTabId) must.add(activeTabId);
  for (const tab of tabs) {
    if (tab.pinned || tab.dirty) must.add(tab.id);
  }
  const recent = [...tabs].sort((a, b) => b.lastAccessTime - a.lastAccessTime);
  for (const tab of recent) {
    if (must.size >= MAX_LIVE_TABS) break;
    must.add(tab.id);
  }
  return tabs.map((tab) => tab.id).filter((id) => must.has(id));
}

function sanitizeState(state: unknown): unknown {
  if (state == null) return null;
  try {
    const json = JSON.stringify(state);
    if (!json || json.length > MAX_STATE_BYTES) return null;
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function sanitizeLocation(location: TabLocation): TabLocation {
  return {
    pathname: location.pathname || '/',
    search: location.search || '',
    hash: location.hash || '',
    state: sanitizeState(location.state),
  };
}

/** Yönlendirmeleri çözer ve konumu saklanabilir hale getirir. Sekme açılamıyorsa null. */
function resolveLocation(raw: TabLocation): TabLocation | null {
  const resolved = resolveTabPath(raw.pathname || '/', raw.search || '', raw.hash || '');
  if (!resolved) return null;
  return sanitizeLocation({
    pathname: resolved.pathname,
    search: resolved.search,
    hash: resolved.hash,
    state: resolved.redirected ? null : raw.state,
  });
}

function locationsEqual(a: TabLocation, b: TabLocation): boolean {
  return (
    a.pathname === b.pathname &&
    a.search === b.search &&
    a.hash === b.hash &&
    JSON.stringify(a.state ?? null) === JSON.stringify(b.state ?? null)
  );
}

/** Sorgu, hash ve state taşımayan yalın bağlantı (ör. sol menü). */
function isBareLocation(location: TabLocation): boolean {
  return !location.search && !location.hash && location.state == null;
}

function createTab(id: string, location: TabLocation): Tab {
  return {
    id,
    title: titleForPath(location.pathname),
    customTitle: null,
    pinned: id === DASHBOARD_TAB_ID,
    dirty: false,
    refreshKey: 0,
    location,
    lastAccessTime: Date.now(),
  };
}

/** Yeni sekmeyi kaynağın hemen sağına (sabitlenmiş sekmelerden sonra) yerleştirir. */
function insertAfter(tabs: Tab[], sourceId: string, tab: Tab): Tab[] {
  const sourceIndex = tabs.findIndex((item) => item.id === sourceId);
  let lastPinned = -1;
  tabs.forEach((item, index) => {
    if (item.pinned) lastPinned = index;
  });
  const at = Math.max(sourceIndex + 1, lastPinned + 1);
  return [...tabs.slice(0, at), tab, ...tabs.slice(at)];
}

/** Var olan sekmeyi öne getirirken, yalın bağlantı sekmenin kaldığı yeri ezmez. */
function withIncomingLocation(tab: Tab, location: TabLocation): Tab {
  if (isBareLocation(location) || locationsEqual(tab.location, location)) return tab;
  return { ...tab, location };
}

function touch(tab: Tab): Tab {
  return { ...tab, lastAccessTime: Date.now() };
}

interface PersistedShape {
  tabs: Tab[];
  activeTabId: string | null;
  closedStack: Tab[];
}

function storageKey(userId: number) {
  return `app_tabs_u${userId}`;
}

function normalizeTab(raw: Partial<Tab> | null | undefined): Tab | null {
  if (!raw || typeof raw.id !== 'string' || !raw.location || typeof raw.location.pathname !== 'string') {
    return null;
  }
  const location = resolveLocation(raw.location as TabLocation);
  if (!location) return null;
  const id = buildTabId(location.pathname, location.search);
  return {
    id,
    title: typeof raw.title === 'string' ? raw.title : titleForPath(location.pathname),
    customTitle: typeof raw.customTitle === 'string' ? raw.customTitle : null,
    pinned: id === DASHBOARD_TAB_ID ? true : Boolean(raw.pinned),
    dirty: false,
    refreshKey: 0,
    location,
    lastAccessTime: typeof raw.lastAccessTime === 'number' ? raw.lastAccessTime : Date.now(),
  };
}

function uniqueById(tabs: Tab[]): Tab[] {
  const seen = new Set<string>();
  return tabs.filter((tab) => {
    if (seen.has(tab.id)) return false;
    seen.add(tab.id);
    return true;
  });
}

function loadPersisted(userId: number): Pick<TabState, 'tabs' | 'activeTabId' | 'closedStack'> {
  try {
    const raw = sessionStorage.getItem(storageKey(userId));
    if (!raw) return { tabs: defaultTabs(), activeTabId: DASHBOARD_TAB_ID, closedStack: [] };
    const parsed = JSON.parse(raw) as PersistedShape;
    const tabs = uniqueById(
      (Array.isArray(parsed.tabs) ? parsed.tabs : [])
        .map((tab) => normalizeTab(tab))
        .filter((tab): tab is Tab => Boolean(tab))
    );
    if (!tabs.some((tab) => tab.id === DASHBOARD_TAB_ID)) tabs.unshift(dashboardTab());
    const closedStack = uniqueById(
      (Array.isArray(parsed.closedStack) ? parsed.closedStack : [])
        .map((tab) => normalizeTab(tab))
        .filter((tab): tab is Tab => Boolean(tab) && tab!.id !== DASHBOARD_TAB_ID)
    ).slice(0, MAX_CLOSED);
    const activeTabId = tabs.some((tab) => tab.id === parsed.activeTabId)
      ? parsed.activeTabId
      : tabs[0]?.id ?? DASHBOARD_TAB_ID;
    return { tabs, activeTabId, closedStack };
  } catch {
    return { tabs: defaultTabs(), activeTabId: DASHBOARD_TAB_ID, closedStack: [] };
  }
}

function archiveClosed(stack: Tab[], tab: Tab): Tab[] {
  if (tab.id === DASHBOARD_TAB_ID) return stack;
  const entry: Tab = { ...tab, dirty: false };
  return [entry, ...stack.filter((item) => item.id !== entry.id)].slice(0, MAX_CLOSED);
}

export const useTabStore = create<TabState>((set, get) => {
  const closeNow = (tabIds: string[]) => {
    const state = get();
    const closing = new Set(tabIds.filter((id) => id !== DASHBOARD_TAB_ID));
    if (closing.size === 0) {
      if (state.pendingCloseIds) set({ pendingCloseIds: null });
      return;
    }
    let closedStack = state.closedStack;
    for (const tab of state.tabs) {
      if (closing.has(tab.id)) closedStack = archiveClosed(closedStack, tab);
    }
    const newTabs = state.tabs.filter((tab) => !closing.has(tab.id));
    let newActive = state.activeTabId;
    if (newActive && closing.has(newActive)) {
      const oldIndex = state.tabs.findIndex((tab) => tab.id === newActive);
      const fallback =
        newTabs[Math.min(oldIndex, newTabs.length - 1)] ?? newTabs[newTabs.length - 1] ?? newTabs[0];
      newActive = fallback?.id ?? DASHBOARD_TAB_ID;
    }
    const tabs = newTabs.map((tab) => (tab.id === newActive ? touch(tab) : tab));
    set({ tabs, activeTabId: newActive, closedStack, pendingCloseIds: null });
  };

  /** Sabitlenmiş sekmeler ve Dashboard toplu kapatmalarda korunur. */
  const closableIds = (tabs: Tab[]) =>
    tabs.filter((tab) => tab.id !== DASHBOARD_TAB_ID && !tab.pinned).map((tab) => tab.id);

  return {
    tabs: defaultTabs(),
    activeTabId: DASHBOARD_TAB_ID,
    closedStack: [],
    pendingCloseIds: null,

    openLocation: (rawLocation) => {
      const location = resolveLocation(rawLocation);
      if (!location) return;
      const tabId = buildTabId(location.pathname, location.search);
      const state = get();
      const existing = state.tabs.find((tab) => tab.id === tabId);

      if (existing) {
        const updated = withIncomingLocation(existing, location);
        if (state.activeTabId === tabId && updated === existing) return;
        set({
          tabs: state.tabs.map((tab) => (tab.id === tabId ? touch(updated) : tab)),
          activeTabId: tabId,
        });
        return;
      }

      set({ tabs: [...state.tabs, createTab(tabId, location)], activeTabId: tabId });
    },

    navigateInTab: (sourceTabId, rawLocation, mode) => {
      const state = get();
      const source = state.tabs.find((tab) => tab.id === sourceTabId);
      if (!source) {
        // Sekme kapanmışken tamamlanan bir işlem: sekme dışı gezinme gibi davran
        get().openLocation(rawLocation);
        return;
      }
      const location = resolveLocation(rawLocation);
      if (!location) return;
      const targetId = buildTabId(location.pathname, location.search);
      const sourceIsActive = state.activeTabId === sourceTabId;

      // Aynı sekme içinde kalan gezinme (sorgu parametresi, state vb.)
      if (targetId === sourceTabId) {
        if (locationsEqual(source.location, location)) return;
        set({
          tabs: state.tabs.map((tab) => (tab.id === sourceTabId ? { ...tab, location } : tab)),
        });
        return;
      }

      const existing = state.tabs.find((tab) => tab.id === targetId);

      if (mode === 'replace') {
        if (existing) {
          // Kaynak sekme kaldırılır, hedef sekme yerini alır
          const tabs = state.tabs
            .filter((tab) => tab.id !== sourceTabId || sourceTabId === DASHBOARD_TAB_ID)
            .map((tab) => (tab.id === targetId ? touch(withIncomingLocation(tab, location)) : tab));
          set({ tabs, activeTabId: sourceIsActive ? targetId : state.activeTabId });
          return;
        }
        if (sourceTabId === DASHBOARD_TAB_ID) {
          // Dashboard dönüştürülmez; hedef yeni sekmede açılır
          set({
            tabs: insertAfter(state.tabs, sourceTabId, createTab(targetId, location)),
            activeTabId: sourceIsActive ? targetId : state.activeTabId,
          });
          return;
        }
        const converted: Tab = {
          ...source,
          id: targetId,
          title: titleForPath(location.pathname),
          customTitle: null,
          dirty: false,
          refreshKey: 0,
          location,
          lastAccessTime: Date.now(),
        };
        set({
          tabs: state.tabs.map((tab) => (tab.id === sourceTabId ? converted : tab)),
          activeTabId: sourceIsActive ? targetId : state.activeTabId,
        });
        return;
      }

      // push: arka plandaki bir sekmeden gelen gezinme odağı çalmaz
      if (existing) {
        const updated = withIncomingLocation(existing, location);
        if (!sourceIsActive && updated === existing) return;
        set({
          tabs: state.tabs.map((tab) =>
            tab.id === targetId ? (sourceIsActive ? touch(updated) : updated) : tab
          ),
          activeTabId: sourceIsActive ? targetId : state.activeTabId,
        });
        return;
      }
      set({
        tabs: insertAfter(state.tabs, sourceTabId, createTab(targetId, location)),
        activeTabId: sourceIsActive ? targetId : state.activeTabId,
      });
    },

    requestClose: (tabId) => {
      if (tabId === DASHBOARD_TAB_ID) return;
      const tab = get().tabs.find((item) => item.id === tabId);
      if (!tab) return;
      if (tab.dirty) {
        set({ pendingCloseIds: [tabId] });
        return;
      }
      closeNow([tabId]);
    },

    requestCloseMany: (tabIds) => {
      const { tabs } = get();
      const ids = tabIds.filter((id) => id !== DASHBOARD_TAB_ID && tabs.some((tab) => tab.id === id));
      if (ids.length === 0) return;
      const hasDirty = ids.some((id) => tabs.find((tab) => tab.id === id)?.dirty);
      if (hasDirty) {
        set({ pendingCloseIds: ids });
        return;
      }
      closeNow(ids);
    },

    confirmPendingClose: () => {
      const ids = get().pendingCloseIds;
      if (!ids) return;
      closeNow(ids);
    },

    dismissPendingClose: () => set({ pendingCloseIds: null }),

    closeOtherTabs: (tabId) => {
      get().requestCloseMany(closableIds(get().tabs).filter((id) => id !== tabId));
    },

    closeTabsToRight: (tabId) => {
      const tabs = get().tabs;
      const index = tabs.findIndex((tab) => tab.id === tabId);
      if (index < 0) return;
      get().requestCloseMany(closableIds(tabs.slice(index + 1)));
    },

    closeAllTabs: () => {
      get().requestCloseMany(closableIds(get().tabs));
    },

    setActiveTab: (tabId) => {
      const state = get();
      if (state.activeTabId === tabId) return;
      if (!state.tabs.some((tab) => tab.id === tabId)) return;
      set({
        tabs: state.tabs.map((tab) => (tab.id === tabId ? touch(tab) : tab)),
        activeTabId: tabId,
      });
    },

    activateByIndex: (index) => {
      const tab = get().tabs[index];
      if (tab) get().setActiveTab(tab.id);
    },

    setTabTitle: (tabId, title) => {
      const state = get();
      const target = state.tabs.find((tab) => tab.id === tabId);
      if (!target || target.customTitle === title) return;
      set({
        tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, customTitle: title } : tab)),
      });
    },

    setTabDirty: (tabId, dirty) => {
      const state = get();
      const target = state.tabs.find((tab) => tab.id === tabId);
      if (!target || target.dirty === dirty) return;
      set({
        tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, dirty } : tab)),
      });
    },

    pinTab: (tabId, pinned) => {
      if (tabId === DASHBOARD_TAB_ID) return;
      const tabs = get().tabs.map((tab) => (tab.id === tabId ? { ...tab, pinned } : tab));
      set({ tabs: [...tabs.filter((tab) => tab.pinned), ...tabs.filter((tab) => !tab.pinned)] });
    },

    moveTab: (sourceId, targetId) => {
      if (sourceId === targetId) return;
      const tabs = [...get().tabs];
      const from = tabs.findIndex((tab) => tab.id === sourceId);
      const to = tabs.findIndex((tab) => tab.id === targetId);
      if (from < 0 || to < 0) return;
      // Sabitlenmiş ve sabitlenmemiş gruplar arasında taşıma yapılmaz
      if (tabs[from].pinned !== tabs[to].pinned) return;
      const [moved] = tabs.splice(from, 1);
      tabs.splice(to, 0, moved);
      set({ tabs });
    },

    refreshTab: (tabId) => {
      set((state) => ({
        tabs: state.tabs.map((tab) =>
          tab.id === tabId ? { ...tab, refreshKey: tab.refreshKey + 1, dirty: false } : tab
        ),
      }));
    },

    reopenClosedTab: () => {
      const state = get();
      const [nextClosed, ...rest] = state.closedStack;
      if (!nextClosed) return;
      if (state.tabs.some((tab) => tab.id === nextClosed.id)) {
        set({
          closedStack: rest,
          activeTabId: nextClosed.id,
          tabs: state.tabs.map((tab) => (tab.id === nextClosed.id ? touch(tab) : tab)),
        });
        return;
      }
      const restored: Tab = { ...nextClosed, dirty: false, refreshKey: 0, lastAccessTime: Date.now() };
      set({ tabs: [...state.tabs, restored], activeTabId: restored.id, closedStack: rest });
    },
  };
});

// ---------------------------------------------------------------------------
// Kalıcılık: her değişiklikte senkron sessionStorage yazımı yerine kısa gecikmeyle
// tek yazım yapılır; pencere kapanırken bekleyen yazım hemen tamamlanır.
// ---------------------------------------------------------------------------

let boundUserId: number | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function writePersisted() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (boundUserId == null) return;
  const state = useTabStore.getState();
  try {
    const payload: PersistedShape = {
      tabs: state.tabs.map((tab) => ({ ...tab, dirty: false, refreshKey: 0 })),
      activeTabId: state.activeTabId,
      closedStack: state.closedStack.map((tab) => ({ ...tab, dirty: false, refreshKey: 0 })),
    };
    sessionStorage.setItem(storageKey(boundUserId), JSON.stringify(payload));
  } catch {
    // depolama doluysa sekmeler yalnızca bellekte kalır
  }
}

function schedulePersist() {
  if (boundUserId == null || persistTimer) return;
  persistTimer = setTimeout(writePersisted, PERSIST_DELAY_MS);
}

useTabStore.subscribe((state, prev) => {
  if (
    state.tabs !== prev.tabs ||
    state.activeTabId !== prev.activeTabId ||
    state.closedStack !== prev.closedStack
  ) {
    schedulePersist();
  }
});

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (event) => {
    writePersisted();
    // Düzenleme modunda sekme varsa kapanış durdurulur; Electron ana süreci
    // ('will-prevent-unload') kullanıcıya onay sorar. Düz sayfalar sorusuz kapanır.
    if (useTabStore.getState().tabs.some((tab) => tab.dirty)) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
}

// Sekmeler yalnızca oturum boyunca (sessionStorage) tutulur: uygulama kapatılıp
// açıldığında geri gelmez. Eski sürümlerin kalıcı kayıtları temizlenir.
try {
  sessionStorage.removeItem(LEGACY_SESSION_KEY);
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && /^app_tabs_u\d+$/.test(key)) localStorage.removeItem(key);
  }
} catch {
  // yok say
}

useAuthStore.subscribe((state, prev) => {
  const nextId = state.user?.userId ?? null;
  const prevId = prev.user?.userId ?? null;
  if (nextId && nextId !== boundUserId) {
    // Önceki kullanıcının bekleyen yazımı yeni kullanıcının anahtarına gitmesin
    writePersisted();
    boundUserId = nextId;
    const loaded = loadPersisted(nextId);
    useTabStore.setState({ ...loaded, pendingCloseIds: null });
    return;
  }
  if (!nextId && prevId && !state.isLocked) {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    try {
      sessionStorage.removeItem(storageKey(prevId));
    } catch {
      // yok say
    }
    boundUserId = null;
    useTabStore.setState({
      tabs: defaultTabs(),
      activeTabId: DASHBOARD_TAB_ID,
      closedStack: [],
      pendingCloseIds: null,
    });
  }
});
