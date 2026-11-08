import { useCallback, type ReactNode } from 'react';
import { create } from 'zustand';
import { useTabOptional } from '../components/tabs/TabContext';
import { useTabStore } from '../store/tabStore';

/**
 * Sekme bazlı başlık (header) aksiyonları.
 *
 * Aksiyonlar React context yerine ayrı bir depoda tutulur: `setActions` her zaman
 * aynı referanstır, böylece sayfaların `useEffect(() => setActions(...), [setActions])`
 * kalıbı yeniden tetiklenip render döngüsüne girmez. Başlık yalnızca aktif sekmenin
 * aksiyonları değiştiğinde yeniden çizilir.
 */
interface HeaderActionsState {
  actions: Record<string, ReactNode>;
  setActions: (tabId: string, actions: ReactNode) => void;
}

const useHeaderActionsStore = create<HeaderActionsState>((set, get) => ({
  actions: {},
  setActions: (tabId, actions) => {
    const current = get().actions;
    if (actions == null) {
      if (!(tabId in current)) return;
      const next = { ...current };
      delete next[tabId];
      set({ actions: next });
      return;
    }
    if (current[tabId] === actions) return;
    set({ actions: { ...current, [tabId]: actions } });
  },
}));

// Kapatılan sekmelerin aksiyonları bellekte kalmasın
useTabStore.subscribe((state, prev) => {
  if (state.tabs === prev.tabs) return;
  const open = new Set(state.tabs.map((tab) => tab.id));
  const { actions } = useHeaderActionsStore.getState();
  const stale = Object.keys(actions).filter((id) => !open.has(id));
  if (stale.length === 0) return;
  const next = { ...actions };
  for (const id of stale) delete next[id];
  useHeaderActionsStore.setState({ actions: next });
});

/** Sayfa içinden, bulunduğu sekmenin başlık aksiyonlarını ayarlar. */
export function useHeaderActions() {
  const tabId = useTabOptional()?.tabId ?? null;
  const setActions = useCallback(
    (actions: ReactNode) => {
      if (!tabId) return;
      useHeaderActionsStore.getState().setActions(tabId, actions);
    },
    [tabId]
  );
  return { setActions };
}

/** Başlıkta gösterilecek, verilen sekmenin aksiyonları. */
export function useTabHeaderActions(tabId: string | null | undefined): ReactNode | null {
  return useHeaderActionsStore((state) => (tabId ? state.actions[tabId] ?? null : null));
}
