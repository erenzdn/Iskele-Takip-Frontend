import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import {
  CaretDownIcon,
  ChartBarIcon,
  ChartLineIcon,
  ClipboardIcon,
  CurrencyCircleDollarIcon,
  GearIcon,
  ListIcon,
  MagnifyingGlassIcon,
  PackageIcon,
  ReceiptIcon,
  SignOutIcon,
  ScrollIcon,
  ShieldCheckIcon,
  ShoppingCartIcon,
  UserIcon,
  UsersIcon,
  VaultIcon,
  WarehouseIcon,
} from '@phosphor-icons/react';
import { useAuthStore } from '../store/authStore';
import { isAdminUser } from '../utils/authHelpers';
import { normalizeText } from '../utils/validation';
import { HeaderActionsContext } from './HeaderActionsContext';
import { useUpdateStore } from '../store/updateStore';

interface MainLayoutProps {
  children?: React.ReactNode;
}

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'layout_sidebar_collapsed';
const SIDEBAR_WIDTH_STORAGE_KEY = 'layout_sidebar_width';
const MENU_SECTIONS_STORAGE_KEY = 'layout_menu_sections';
const SIDEBAR_DEFAULT_WIDTH = 288;
const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 360;

type SectionState = {
  main: boolean;
  reports: boolean;
  admin: boolean;
};

const defaultSectionState: SectionState = {
  main: true,
  reports: true,
  admin: true,
};

const iconProps = { size: 20, weight: 'regular' as const, color: 'currentColor' };

type MenuItem = { path: string; label: string; icon: React.ReactNode; requiredPermission?: string };

const mainMenuItems: MenuItem[] = [
  { path: '/', label: 'Dashboard', icon: <ChartLineIcon {...iconProps} /> },
  { path: '/customers', label: 'Müşteriler', icon: <UsersIcon {...iconProps} />, requiredPermission: 'customers_view' },
  { path: '/inventory', label: 'Envanter', icon: <PackageIcon {...iconProps} />, requiredPermission: 'inventory_view' },
  { path: '/warehouses', label: 'Depolar', icon: <WarehouseIcon {...iconProps} />, requiredPermission: 'warehouses_view' },
  { path: '/contracts/rental', label: 'Kiralama teklifleri', icon: <ClipboardIcon {...iconProps} />, requiredPermission: 'contracts_view' },
  { path: '/contracts/sale', label: 'Satış teklifleri', icon: <ShoppingCartIcon {...iconProps} />, requiredPermission: 'contracts_view' },
  { path: '/purchase-invoices', label: 'Alış Faturaları', icon: <ReceiptIcon {...iconProps} />, requiredPermission: 'purchaseInvoices_view' },
  { path: '/stock-receipts', label: 'Stok Fişleri', icon: <ReceiptIcon {...iconProps} /> },
  { path: '/checks', label: 'Çekler', icon: <ReceiptIcon {...iconProps} />, requiredPermission: 'checks_view' },
  { path: '/cash', label: 'Kasa & Banka', icon: <VaultIcon {...iconProps} />, requiredPermission: 'cash_view' },
];

const reportingMenuItems: MenuItem[] = [
  { path: '/reports/rental-movement', label: 'Kiralama Hareket Raporu', icon: <ChartBarIcon {...iconProps} />, requiredPermission: 'reports_view' },
];

const administrationMenuItems: MenuItem[] = [
  { path: '/price-tiers', label: 'Fiyat Tarifeleri', icon: <CurrencyCircleDollarIcon {...iconProps} />, requiredPermission: 'priceTiers_view' },
  { path: '/pricing-rules', label: 'Fiyatlandırma Kuralları', icon: <GearIcon {...iconProps} />, requiredPermission: 'pricingRules_view' },
  { path: '/users', label: 'Kullanıcılar', icon: <UserIcon {...iconProps} />, requiredPermission: 'users_view' },
  { path: '/audit-logs', label: 'Audit Logları', icon: <ScrollIcon {...iconProps} />, requiredPermission: 'auditLogs_view' },
  { path: '/system-settings', label: 'Sistem Ayarları', icon: <ShieldCheckIcon {...iconProps} /> },
];

function filterByPermission(items: MenuItem[], permissions: string[]) {
  return items.filter(
    (item) => !item.requiredPermission || permissions.includes(item.requiredPermission)
  );
}

function isPathActive(currentPath: string, targetPath: string) {
  if (targetPath === '/') return currentPath === '/';
  return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`);
}

function MenuSection({
  title,
  items,
  locationPath,
  collapsed,
  isOpen,
  onToggle,
}: {
  title: string;
  items: MenuItem[];
  locationPath: string;
  collapsed: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="pt-3 mt-3 border-t border-background-border">
      {!collapsed && (
        <button
          type="button"
          onClick={onToggle}
          className="w-full px-3 mb-2 flex items-center justify-between text-[11px] font-semibold text-text-secondary uppercase tracking-wider hover:text-text-primary"
        >
          <span>{title}</span>
          <CaretDownIcon
            size={12}
            className={`transition-transform ${isOpen ? 'rotate-0' : '-rotate-90'}`}
          />
        </button>
      )}
      {(collapsed || isOpen) &&
        items.map((item) => (
          <NavLink
            key={item.path}
            item={item}
            isActive={isPathActive(locationPath, item.path)}
            collapsed={collapsed}
          />
        ))}
    </div>
  );
}

function NavLink({
  item,
  isActive,
  collapsed,
}: {
  item: MenuItem;
  isActive: boolean;
  collapsed: boolean;
}) {
  const isUpdateAvailable = useUpdateStore((s) => s.isUpdateAvailable);
  const isDownloaded = useUpdateStore((s) => s.isDownloaded);
  
  const showUpdateBadge = (item.path === '/system-settings') && (isUpdateAvailable || isDownloaded);

  return (
    <Link
      to={item.path}
      title={collapsed ? item.label : undefined}
      className={`group relative flex items-center gap-3 rounded-xl mb-1.5 transition-all ${
        isActive
          ? 'bg-primary text-white shadow-sm'
          : 'text-text-secondary hover:bg-background-hover hover:text-text-primary'
      }`}
    >
      <span className={`flex h-11 items-center ${collapsed ? 'w-full justify-center' : 'w-11 justify-center'}`}>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-background-elevated group-hover:bg-background-hover [&_svg]:size-5 relative">
          {item.icon}
          {showUpdateBadge && (
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-error opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-error border-2 border-background-sidebar"></span>
            </span>
          )}
        </span>
      </span>
      {!collapsed && (
        <span className="font-medium truncate pr-2 flex-1 flex items-center justify-between">
          {item.label}
          {showUpdateBadge && !collapsed && (
            <span className="h-2 w-2 rounded-full bg-error shadow-[0_0_8px_rgba(239,68,68,0.6)]"></span>
          )}
        </span>
      )}
    </Link>
  );
}

export default function MainLayout({ children }: MainLayoutProps = {}) {
  const location = useLocation();
  const isResizingRef = useRef(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    const raw = localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
    return raw === 'true';
  });
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    const parsed = raw ? Number(raw) : NaN;
    if (Number.isNaN(parsed)) return SIDEBAR_DEFAULT_WIDTH;
    return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, parsed));
  });
  const [menuQuery, setMenuQuery] = useState('');
  const [openSections, setOpenSections] = useState<SectionState>(() => {
    const raw = localStorage.getItem(MENU_SECTIONS_STORAGE_KEY);
    if (!raw) return defaultSectionState;
    try {
      const parsed = JSON.parse(raw) as Partial<SectionState>;
      return {
        main: typeof parsed.main === 'boolean' ? parsed.main : defaultSectionState.main,
        reports: typeof parsed.reports === 'boolean' ? parsed.reports : defaultSectionState.reports,
        admin: typeof parsed.admin === 'boolean' ? parsed.admin : defaultSectionState.admin,
      };
    } catch {
      return defaultSectionState;
    }
  });
  const [headerActions, setHeaderActions] = useState<ReactNode>(null);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const permissions = user?.permissions ?? [];
  const visibleMainBase = filterByPermission(mainMenuItems, permissions);
  const visibleReportingBase = filterByPermission(reportingMenuItems, permissions);
  const visibleAdministrationBase = filterByPermission(administrationMenuItems, permissions).filter((item) => {
    if (item.path === '/system-settings') return isAdminUser(user);
    return true;
  });
  const normalizedQuery = menuQuery.trim().toLocaleLowerCase('tr-TR');
  const visibleMain = useMemo(() => {
    if (!normalizedQuery) return visibleMainBase;
    return visibleMainBase.filter((item) => item.label.toLocaleLowerCase('tr-TR').includes(normalizedQuery));
  }, [normalizedQuery, visibleMainBase]);
  const visibleReporting = useMemo(() => {
    if (!normalizedQuery) return visibleReportingBase;
    return visibleReportingBase.filter((item) => item.label.toLocaleLowerCase('tr-TR').includes(normalizedQuery));
  }, [normalizedQuery, visibleReportingBase]);
  const visibleAdministration = useMemo(() => {
    if (!normalizedQuery) return visibleAdministrationBase;
    return visibleAdministrationBase.filter((item) => item.label.toLocaleLowerCase('tr-TR').includes(normalizedQuery));
  }, [normalizedQuery, visibleAdministrationBase]);

  const pageTitle = useMemo(() => {
    const allItems = [...mainMenuItems, ...reportingMenuItems, ...administrationMenuItems];
    return allItems.find((item) => isPathActive(location.pathname, item.path))?.label ?? 'Panel';
  }, [location.pathname]);
  const pageDescription = useMemo(() => {
    const descriptionMap: Record<string, string> = {
      '/': 'Genel durum ve hızlı özet metrikler',
      '/customers': 'Müşteri kayıtları, iletişim ve ilişki yönetimi',
      '/inventory': 'Ürün kartları, stok durumu ve fiyat bilgileri',
      '/warehouses': 'Depo listesi, depo bazlı stok ve hareket yönetimi',
      '/contracts/rental': 'Kiralama teklifleri, sözleşmeler ve kapalı kayıtlar',
      '/contracts/sale': 'Satış teklifleri, sözleşmeler ve kapalı kayıtlar',
      '/offer-management': 'Kategori, şablon ve paket işlemlerini tek merkezden yönetin',
      '/purchase-invoices': 'Alış faturaları ve mali kayıt süreçleri',
      '/stock-receipts': 'Stok giriş, çıkış ve transfer fişleri',
      '/checks': 'Çek portföyü, tahsilat ve iade takibi',
      '/cash': 'Kasa, banka hesapları ve nakit hareketleri',
      '/price-tiers': 'Ürün bazlı fiyat katmanları yönetimi',
      '/pricing-rules': 'Fiyatlama kuralları ve koşul tanımları',
      '/users': 'Kullanıcı hesapları ve yetki yönetimi',
      '/audit-logs': 'Sistem işlem geçmişi ve denetim kayıtları',
      '/reports/rental-movement': 'Kiralama hareket raporları ve analiz ekranı',
      '/system-settings': 'Genel sistem ayarları ve yönetim tercihleri',
    };
    const allPaths = Object.keys(descriptionMap);
    const matchedPath = allPaths.find((path) => isPathActive(location.pathname, path));
    return matchedPath ? descriptionMap[matchedPath] : 'İş akışınızı sade ve hızlı şekilde yönetin';
  }, [location.pathname]);

  const breadcrumb = useMemo(() => {
    const root = { label: 'Panel', path: '/' };
    const inMain = mainMenuItems.find((item) => isPathActive(location.pathname, item.path));
    if (inMain) return [root, { label: 'Operasyon', path: inMain.path }, { label: inMain.label, path: inMain.path }];
    const inReports = reportingMenuItems.find((item) => isPathActive(location.pathname, item.path));
    if (inReports) return [root, { label: 'Raporlar', path: inReports.path }, { label: inReports.label, path: inReports.path }];
    const inAdmin = administrationMenuItems.find((item) => isPathActive(location.pathname, item.path));
    if (inAdmin) return [root, { label: 'Yönetim', path: inAdmin.path }, { label: inAdmin.label, path: inAdmin.path }];
    return [root, { label: pageTitle, path: location.pathname }];
  }, [location.pathname, pageTitle]);
  const displayName = user?.fullName?.trim() || user?.username || 'Kullanıcı';
  const handleSetHeaderActions = useCallback((actions: ReactNode) => {
    setHeaderActions(actions);
  }, []);

  useEffect(() => {
    // Mouse scroll ile number input degerinin degismesini engelle
    const handleWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'number') {
        (target as HTMLElement).blur();
      }
    };

    // ArrowUp/ArrowDown ile number input degerinin degismesini engelle
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' &&
        (target as HTMLInputElement).type === 'number' &&
        (e.key === 'ArrowUp' || e.key === 'ArrowDown')
      ) {
        e.preventDefault();
      }
    };

    document.addEventListener('wheel', handleWheel, { passive: true });
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('wheel', handleWheel);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    localStorage.setItem(MENU_SECTIONS_STORAGE_KEY, JSON.stringify(openSections));
  }, [openSections]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isResizingRef.current || isSidebarCollapsed) return;
      const nextWidth = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, event.clientX));
      setSidebarWidth(nextWidth);
    };

    const stopResizing = () => {
      isResizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopResizing);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isSidebarCollapsed]);

  const startResizingSidebar = () => {
    if (isSidebarCollapsed) return;
    isResizingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  return (
    <div className="flex h-screen bg-background-main text-text-primary">
      {/* Sidebar */}
      <aside
        className={`relative bg-background-sidebar/95 border-r border-background-border flex flex-col transition-all duration-300 ${
          isSidebarCollapsed ? 'w-24' : ''
        }`}
        style={!isSidebarCollapsed ? { width: `${sidebarWidth}px` } : undefined}
      >
        <div className="p-4 border-b border-background-border">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-primary/20 border border-primary/30 text-primary flex items-center justify-center font-bold">
              I
            </div>
            {!isSidebarCollapsed && (
              <div className="min-w-0">
                <h1 className="text-base font-semibold text-text-primary truncate">İskeleTakip</h1>
                <p className="text-xs text-text-secondary truncate">Operasyon Yönetimi</p>
              </div>
            )}
            </div>
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed((prev) => !prev)}
              className={`h-8 w-8 shrink-0 rounded-lg border border-background-border bg-background-panel text-text-secondary hover:text-text-primary hover:bg-background-hover flex items-center justify-center ${
                isSidebarCollapsed ? 'mx-auto' : ''
              }`}
              title={isSidebarCollapsed ? 'Menüyü genişlet' : 'Menüyü daralt'}
            >
              <ListIcon size={18} />
            </button>
          </div>
        </div>

        {!isSidebarCollapsed && (
          <div className="p-3 border-b border-background-border">
            <label className="relative block">
              <MagnifyingGlassIcon
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
              />
              <input
                value={menuQuery}
                onChange={(e) => setMenuQuery(normalizeText(e.target.value))}
                placeholder="Menüde ara..."
                className="w-full bg-background-panel rounded-lg border border-background-border pl-9 pr-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/70"
              />
            </label>
          </div>
        )}

        <nav className="flex-1 px-3 py-3 overflow-y-auto">
          <MenuSection
            title="Operasyon"
            items={visibleMain}
            locationPath={location.pathname}
            collapsed={isSidebarCollapsed}
            isOpen={openSections.main}
            onToggle={() => setOpenSections((prev) => ({ ...prev, main: !prev.main }))}
          />
          <MenuSection
            title="Raporlar"
            items={visibleReporting}
            locationPath={location.pathname}
            collapsed={isSidebarCollapsed}
            isOpen={openSections.reports}
            onToggle={() => setOpenSections((prev) => ({ ...prev, reports: !prev.reports }))}
          />
          <MenuSection
            title="Yönetim"
            items={visibleAdministration}
            locationPath={location.pathname}
            collapsed={isSidebarCollapsed}
            isOpen={openSections.admin}
            onToggle={() => setOpenSections((prev) => ({ ...prev, admin: !prev.admin }))}
          />
        </nav>

        <div className="p-3 border-t border-background-border">
          <button
            onClick={logout}
            className={`w-full rounded-lg border border-background-border bg-background-panel hover:bg-background-hover text-text-primary transition-colors ${
              isSidebarCollapsed ? 'h-11 flex items-center justify-center' : 'py-3 px-4 flex items-center gap-2'
            }`}
            title="Çıkış Yap"
          >
            <SignOutIcon size={18} />
            {!isSidebarCollapsed && 'Çıkış Yap'}
          </button>
        </div>
        {!isSidebarCollapsed && (
          <button
            type="button"
            onMouseDown={startResizingSidebar}
            className="absolute right-0 top-0 h-full w-1 translate-x-1/2 cursor-col-resize bg-transparent hover:bg-primary/20"
            aria-label="Menü genişliğini ayarla"
            title="Menü genişliğini ayarla"
          />
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden bg-background-main">
        <header className="h-14 border-b border-background-border bg-background-main/95 backdrop-blur px-4 flex items-center justify-between gap-3">
          <div className="min-w-0" title={pageDescription}>
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-text-secondary leading-none mb-0.5">
              {breadcrumb.map((item, index) => (
                <span key={`${item.path}-${index}`} className="flex items-center gap-1.5 truncate">
                  {index > 0 && <span className="opacity-50">/</span>}
                  <span className={index === breadcrumb.length - 1 ? 'text-text-primary' : ''}>{item.label}</span>
                </span>
              ))}
            </div>
            <h2 className="text-base font-semibold leading-tight truncate">{pageTitle}</h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <UpdateHeaderIndicator />
            {headerActions ? <div className="flex items-center gap-2">{headerActions}</div> : null}
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium text-text-primary truncate max-w-[200px]">{displayName}</div>
              <div className="text-xs text-text-secondary truncate max-w-[200px]">{user?.roleName || 'Kullanıcı'}</div>
            </div>
          </div>
        </header>

        <div className="h-[calc(100vh-3.5rem)] overflow-auto px-4 py-3">
          <HeaderActionsContext.Provider value={{ setActions: handleSetHeaderActions }}>
            {children || <Outlet />}
          </HeaderActionsContext.Provider>
        </div>
      </main>
    </div>
  );
}

function UpdateHeaderIndicator() {
  const { isUpdateAvailable, isDownloaded, isDownloading, progress } = useUpdateStore();

  if (!isUpdateAvailable && !isDownloaded && !isDownloading) return null;

  return (
    <Link
      to="/system-settings"
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border shadow-sm ${
        isDownloaded
          ? 'bg-success/10 text-success border-success/30 hover:bg-success/20'
          : isDownloading
          ? 'bg-info/10 text-info border-info/30 hover:bg-info/20'
          : 'bg-warning/10 text-warning border-warning/30 hover:bg-warning/20'
      }`}
    >
      <div className="relative flex h-2 w-2">
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
          isDownloaded ? 'bg-success' : isDownloading ? 'bg-info' : 'bg-warning'
        }`}></span>
        <span className={`relative inline-flex rounded-full h-2 w-2 ${
          isDownloaded ? 'bg-success' : isDownloading ? 'bg-info' : 'bg-warning'
        }`}></span>
      </div>
      <span>
        {isDownloaded ? 'Güncelleme Hazır' : isDownloading ? `İndiriliyor %${progress.toFixed(0)}` : 'Güncelleme Mevcut'}
      </span>
    </Link>
  );
}

