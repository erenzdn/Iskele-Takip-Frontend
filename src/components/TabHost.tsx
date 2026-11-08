import { memo, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  parsePath,
  Route,
  Routes,
  UNSAFE_NavigationContext as NavigationContext,
  UNSAFE_RouteContext as RouteContext,
  useLocation,
  useNavigate,
  type Navigator,
  type To,
} from 'react-router-dom';
import { appRoutes } from '../routes';
import {
  locationHref,
  selectLiveTabIds,
  useTabStore,
  type Tab,
  type TabLocation,
  type TabNavigationMode,
} from '../store/tabStore';
import { TabProvider } from './tabs/TabContext';

/**
 * Sekme mimarisi
 * ---------------
 * - Doğruluk kaynağı sekme deposudur (`useTabStore`). Adres çubuğu yalnızca aktif
 *   sekmenin konumunu yansıtır.
 * - Sekme içindeki her gezinme (`navigate`, `<Link>`, `setSearchParams`, `<Navigate>`)
 *   sekmeye özel bir `Navigator` üzerinden depoya iletilir; böylece arka plandaki bir
 *   sekme aktif sekmeyi ele geçiremez ve adres ↔ depo arasında yarış oluşmaz.
 * - Sekme dışından gelen gezinmeler (sol menü, başlık bağlantıları, giriş) adres
 *   değişikliği olarak yakalanır ve `openLocation` ile sekmeye çevrilir.
 */
export function TabHost() {
  const location = useLocation();
  const navigate = useNavigate();
  const tabs = useTabStore((state) => state.tabs);
  const activeTabId = useTabStore((state) => state.activeTabId);
  const openLocation = useTabStore((state) => state.openLocation);

  const currentHref = locationHref(location);
  const currentHrefRef = useRef(currentHref);
  currentHrefRef.current = currentHref;
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  /** Adresi aktif sekmeye eşitlemek için yaptığımız ve henüz görülmemiş gezinmeler */
  const pendingMirrorsRef = useRef<string[]>([]);
  /**
   * Uygulama varsayılan adresle ('/') açıldığında, depodan geri yüklenen aktif sekme
   * bu adres tarafından ezilmesin.
   */
  const skipDefaultUrlRef = useRef(currentHref === '/');

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [activeTabId, tabs]
  );
  const activeHref = activeTab ? locationHref(activeTab.location) : null;

  const mirrorActiveTabToUrl = useMemo(
    () => () => {
      const { tabs: allTabs, activeTabId: activeId } = useTabStore.getState();
      const tab = allTabs.find((item) => item.id === activeId);
      if (!tab) return;
      const target = locationHref(tab.location);
      if (target === currentHrefRef.current) return;
      const pending = pendingMirrorsRef.current;
      // Aynı hedefe giden eşitleme zaten yolda
      if (pending[pending.length - 1] === target) return;
      pending.push(target);
      navigateRef.current(
        { pathname: tab.location.pathname, search: tab.location.search, hash: tab.location.hash },
        { replace: true, state: tab.location.state }
      );
    },
    []
  );

  // Adres → sekme (yalnızca sekme dışından gelen gezinmeler)
  useEffect(() => {
    const pending = pendingMirrorsRef.current;
    const mirrorIndex = pending.indexOf(currentHref);
    if (mirrorIndex >= 0) {
      // Kendi eşitleme gezinmemiz; öncekiler de geçersiz (aradaki ara durumlar atlandı)
      pending.splice(0, mirrorIndex + 1);
      skipDefaultUrlRef.current = false;
      return;
    }
    pendingMirrorsRef.current = [];
    if (skipDefaultUrlRef.current && currentHref === '/') {
      mirrorActiveTabToUrl();
      return;
    }
    skipDefaultUrlRef.current = false;
    openLocation({
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
      state: location.state,
    });
    // Sekme açılamadıysa ya da yalın bağlantı mevcut sekmenin konumunu korudu ise
    // adres yeniden aktif sekmeye eşitlenir.
    mirrorActiveTabToUrl();
    // location.key: aynı adrese tekrar tıklama da ayrı bir gezinmedir
  }, [location.key, currentHref, location.pathname, location.search, location.hash, location.state, openLocation, mirrorActiveTabToUrl]);

  // Sekme → adres
  useEffect(() => {
    mirrorActiveTabToUrl();
  }, [activeTabId, activeHref, mirrorActiveTabToUrl]);

  const liveIds = useMemo(() => new Set(selectLiveTabIds(tabs, activeTabId)), [tabs, activeTabId]);

  return (
    <>
      {tabs.map((tab) =>
        liveIds.has(tab.id) ? <TabPane key={tab.id} tab={tab} isActive={tab.id === activeTabId} /> : null
      )}
    </>
  );
}

const paneRouteElements = appRoutes.map((route) => (
  <Route key={route.path} path={route.path} element={route.element} />
));

/** Sekme içerikleri üst rota ağacından bağımsız, kök seviyesinde çözülür. */
const rootRouteContext = { outlet: null, matches: [], isDataRoute: false };

function toTabLocation(to: To, state: unknown, fallbackPathname: string): TabLocation {
  const path = typeof to === 'string' ? parsePath(to) : to;
  return {
    pathname: path.pathname || fallbackPathname,
    search: path.search || '',
    hash: path.hash || '',
    state: state ?? null,
  };
}

/** Sekmenin kendi gezinme bağlamı: gezinmeler global geçmiş yerine depoya gider. */
function useTabNavigationContext(tabId: string) {
  const outer = useContext(NavigationContext);
  return useMemo(() => {
    const go = (mode: TabNavigationMode) => (to: To, state?: unknown) => {
      const store = useTabStore.getState();
      const current = store.tabs.find((tab) => tab.id === tabId);
      const target = toTabLocation(to, state, current?.location.pathname ?? '/');
      store.navigateInTab(tabId, target, mode);
    };
    const navigator: Navigator = {
      createHref: (to) => outer.navigator.createHref(to),
      encodeLocation: outer.navigator.encodeLocation
        ? (to) => outer.navigator.encodeLocation!(to)
        : undefined,
      go: (delta) => {
        if (useTabStore.getState().activeTabId === tabId) outer.navigator.go(delta);
      },
      push: go('push'),
      replace: go('replace'),
    };
    return { ...outer, navigator };
  }, [outer, tabId]);
}

const TabPane = memo(function TabPane({ tab, isActive }: { tab: Tab; isActive: boolean }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const navigationContext = useTabNavigationContext(tab.id);
  const routesLocation = useMemo(() => ({ ...tab.location, key: tab.id }), [tab.id, tab.location]);

  // Gizli sekme klavye/odak sırasından çıkarılır
  useLayoutEffect(() => {
    container?.toggleAttribute('inert', !isActive);
  }, [container, isActive]);

  return (
    <div
      ref={setContainer}
      className={`h-full min-h-0 overflow-auto ${isActive ? '' : 'hidden'}`}
      aria-hidden={!isActive}
    >
      <NavigationContext.Provider value={navigationContext}>
        <RouteContext.Provider value={rootRouteContext}>
          <TabProvider tabId={tab.id} isActive={isActive} portalTarget={container}>
            <div key={tab.refreshKey} className="h-full min-h-0">
              <Routes location={routesLocation}>{paneRouteElements}</Routes>
            </div>
          </TabProvider>
        </RouteContext.Provider>
      </NavigationContext.Provider>
    </div>
  );
});
