import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useTabStore } from '../../store/tabStore';

export interface TabContextValue {
  tabId: string;
  isActive: boolean;
  portalTarget: HTMLElement | null;
}

const TabContext = createContext<TabContextValue | null>(null);

export function TabProvider({
  tabId,
  isActive,
  portalTarget,
  children,
}: TabContextValue & { children: ReactNode }) {
  const value = useMemo(
    () => ({ tabId, isActive, portalTarget }),
    [tabId, isActive, portalTarget]
  );
  return <TabContext.Provider value={value}>{children}</TabContext.Provider>;
}

export function useTabOptional(): TabContextValue | null {
  return useContext(TabContext);
}

export function useTab(): TabContextValue {
  const value = useContext(TabContext);
  if (!value) {
    throw new Error('useTab yalnızca bir sekme içinde kullanılabilir');
  }
  return value;
}

export function useTabTitle(title: string | null | undefined) {
  const tabId = useTabOptional()?.tabId;
  const setTabTitle = useTabStore((state) => state.setTabTitle);
  useEffect(() => {
    if (!tabId || !title?.trim()) return;
    setTabTitle(tabId, title.trim());
  }, [setTabTitle, tabId, title]);
}

export function useTabDirty(dirty: boolean) {
  const tabId = useTabOptional()?.tabId;
  const setTabDirty = useTabStore((state) => state.setTabDirty);
  useEffect(() => {
    if (!tabId) return;
    setTabDirty(tabId, dirty);
    return () => setTabDirty(tabId, false);
  }, [dirty, setTabDirty, tabId]);
}

/** Sekme yeniden görünür olduğunda çalışır. İlk açılışta da bir kez çağrılır. */
export function useTabActive(callback: () => void) {
  const tab = useTabOptional();
  const isActive = tab?.isActive ?? true;
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  const wasActive = useRef(false);
  useEffect(() => {
    if (isActive && !wasActive.current) {
      wasActive.current = true;
      callbackRef.current();
    } else if (!isActive) {
      wasActive.current = false;
    }
  }, [isActive]);
}

export function useTabPortalTarget(): HTMLElement | null {
  return useTabOptional()?.portalTarget ?? null;
}

/** Sekme içinde açılan katmanlar sekmenin kendisine portal edilir; gizli sekmede görünmezler. */
export function usePortalTarget(): HTMLElement {
  const fromTab = useTabPortalTarget();
  if (fromTab) return fromTab;
  return document.body;
}
