import { lazy, Suspense } from 'react';
import { matchRoutes, Navigate, parsePath, type RouteObject } from 'react-router-dom';
import {
  ChartBarIcon,
  ChartLineIcon,
  ClipboardIcon,
  CurrencyCircleDollarIcon,
  GearIcon,
  PackageIcon,
  ReceiptIcon,
  ScrollIcon,
  ShieldCheckIcon,
  ShoppingCartIcon,
  UserIcon,
  UsersIcon,
  VaultIcon,
  WarehouseIcon,
  type Icon,
} from '@phosphor-icons/react';
import PageLoader from './components/PageLoader';
import { PageGuard } from './components/PageGuard';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const CustomersPage = lazy(() => import('./pages/CustomersPage'));
const CustomerDetailPage = lazy(() => import('./pages/CustomerDetailPage'));
const InventoryPage = lazy(() => import('./pages/InventoryPage'));
const InventoryDetailPage = lazy(() => import('./pages/InventoryDetailPage'));
const ItemMovementsPage = lazy(() => import('./pages/ItemMovementsPage'));
const WarehousesPage = lazy(() => import('./pages/WarehousesPage'));
const WarehouseDetailPage = lazy(() => import('./pages/WarehouseDetailPage'));
const ContractsPage = lazy(() => import('./pages/ContractsPage'));
const ContractDetailPage = lazy(() => import('./pages/ContractDetailPage'));
const QuoteDetailPage = lazy(() => import('./pages/QuoteDetailPage'));
const PurchaseInvoicesPage = lazy(() => import('./pages/PurchaseInvoicesPage'));
const PriceTiersPage = lazy(() => import('./pages/PriceTiersPage'));
const PricingRulesPage = lazy(() => import('./pages/PricingRulesPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const AuditLogsPage = lazy(() => import('./pages/AuditLogsPage'));
const RentalMovementReportPage = lazy(() => import('./pages/RentalMovementReportPage'));
const StockReceiptsPage = lazy(() => import('./pages/StockReceiptsPage'));
const ChecksPage = lazy(() => import('./pages/ChecksPage'));
const CashPage = lazy(() => import('./pages/CashPage'));
const CashAccountDetailPage = lazy(() => import('./pages/CashAccountDetailPage'));
const SystemSettingsPage = lazy(() => import('./pages/SystemSettingsPage'));
const DocumentTemplatesPage = lazy(() => import('./pages/DocumentTemplatesPage'));
const OfferManagementPage = lazy(() => import('./pages/OfferManagementPage'));

export type AppSection = 'main' | 'reports' | 'admin';

export type RouteIcon = Icon;

export interface RouteMeta {
  title: string;
  description?: string;
  icon?: RouteIcon;
  section?: AppSection;
  /** Sol menüde göster */
  menu?: boolean;
  permission?: string;
  adminOnly?: boolean;
  /** Yönlendirme rotası: sekme açılmaz, `redirectTo` hedefine gidilir */
  redirect?: boolean;
  /** Yönlendirme hedefi (sorgu dizesi içerebilir) */
  redirectTo?: string;
  /** Breadcrumb için üst liste yolu */
  parent?: string;
}

export interface RouteConfig {
  path: string;
  element: React.ReactNode;
  meta?: RouteMeta;
}

const guarded = (permission: string | undefined, node: React.ReactNode, adminOnly = false) => (
  <PageGuard requiredPermission={permission} adminOnly={adminOnly}>
    <Suspense fallback={<PageLoader />}>{node}</Suspense>
  </PageGuard>
);

const plain = (node: React.ReactNode) => <Suspense fallback={<PageLoader />}>{node}</Suspense>;

/**
 * Tüm korumalı sayfaların rota yapılandırması.
 * Bu liste hem App.tsx hem de TabHost tarafından kullanılır.
 * Başlık, açıklama, ikon ve menü tek kaynaktan okunur.
 */
export const appRoutes: RouteConfig[] = [
  {
    path: '/',
    meta: {
      title: 'Dashboard',
      description: 'Genel durum ve hızlı özet metrikler',
      icon: ChartLineIcon,
      section: 'main',
      menu: true,
    },
    element: plain(<DashboardPage />),
  },
  {
    path: '/customers',
    meta: {
      title: 'Müşteriler',
      description: 'Müşteri kayıtları, iletişim ve ilişki yönetimi',
      icon: UsersIcon,
      section: 'main',
      menu: true,
      permission: 'customers_view',
    },
    element: guarded('customers_view', <CustomersPage />),
  },
  {
    path: '/customers/:id',
    meta: {
      title: 'Müşteri',
      description: 'Müşteri kaydı',
      parent: '/customers',
      permission: 'customers_view',
    },
    element: guarded('customers_view', <CustomerDetailPage />),
  },
  {
    path: '/inventory',
    meta: {
      title: 'Envanter',
      description: 'Ürün kartları, stok durumu ve fiyat bilgileri',
      icon: PackageIcon,
      section: 'main',
      menu: true,
      permission: 'inventory_view',
    },
    element: guarded('inventory_view', <InventoryPage />),
  },
  {
    path: '/inventory/:itemId/movements',
    meta: {
      title: 'Ürün Hareketleri',
      description: 'Ürünün sözleşme ve stok hareketleri',
      parent: '/inventory',
      permission: 'inventory_view',
    },
    element: guarded('inventory_view', <ItemMovementsPage />),
  },
  {
    path: '/inventory/:id',
    meta: {
      title: 'Malzeme',
      description: 'Malzeme kartı',
      parent: '/inventory',
      permission: 'inventory_view',
    },
    element: guarded('inventory_view', <InventoryDetailPage />),
  },
  {
    path: '/warehouses',
    meta: {
      title: 'Depolar',
      description: 'Depo listesi, depo bazlı stok ve hareket yönetimi',
      icon: WarehouseIcon,
      section: 'main',
      menu: true,
      permission: 'warehouses_view',
    },
    element: guarded('warehouses_view', <WarehousesPage />),
  },
  {
    path: '/warehouses/:id',
    meta: {
      title: 'Depo Detayı',
      description: 'Depo stok ve hareketleri',
      parent: '/warehouses',
      permission: 'warehouses_view',
    },
    element: guarded('warehouses_view', <WarehouseDetailPage />),
  },
  {
    path: '/contracts/rental',
    meta: {
      title: 'Kiralama teklifleri',
      description: 'Kiralama teklifleri, sözleşmeler ve kapalı kayıtlar',
      icon: ClipboardIcon,
      section: 'main',
      menu: true,
      permission: 'contracts_view',
    },
    element: guarded('contracts_view', <ContractsPage contractScope="rental" />),
  },
  {
    path: '/contracts/sale',
    meta: {
      title: 'Satış teklifleri',
      description: 'Satış teklifleri, sözleşmeler ve kapalı kayıtlar',
      icon: ShoppingCartIcon,
      section: 'main',
      menu: true,
      permission: 'contracts_view',
    },
    element: guarded('contracts_view', <ContractsPage contractScope="sale" />),
  },
  {
    path: '/contracts/new',
    meta: {
      title: 'Yeni Sözleşme',
      description: 'Yeni sözleşme kaydı',
      parent: '/contracts/rental',
      permission: 'contracts_view',
    },
    element: guarded('contracts_view', <ContractDetailPage />),
  },
  {
    path: '/contracts/:id',
    meta: {
      title: 'Sözleşme',
      description: 'Sözleşme kaydı',
      parent: '/contracts/rental',
      permission: 'contracts_view',
    },
    element: guarded('contracts_view', <ContractDetailPage />),
  },
  {
    path: '/quotes/new',
    meta: {
      title: 'Yeni Teklif',
      description: 'Yeni teklif kaydı',
      parent: '/contracts/rental',
      permission: 'contracts_view',
    },
    element: guarded('contracts_view', <QuoteDetailPage />),
  },
  {
    path: '/quotes/:id',
    meta: {
      title: 'Teklif',
      description: 'Teklif kaydı',
      parent: '/contracts/rental',
      permission: 'contracts_view',
    },
    element: guarded('contracts_view', <QuoteDetailPage />),
  },
  {
    path: '/contracts',
    meta: { title: 'Sözleşmeler', redirect: true, redirectTo: '/contracts/rental' },
    element: <Navigate to="/contracts/rental" replace />,
  },
  {
    path: '/purchase-invoices',
    meta: {
      title: 'Alış Faturaları',
      description: 'Alış faturaları ve mali kayıt süreçleri',
      icon: ReceiptIcon,
      section: 'main',
      menu: true,
      permission: 'purchaseInvoices_view',
    },
    element: guarded('purchaseInvoices_view', <PurchaseInvoicesPage />),
  },
  {
    path: '/stock-receipts',
    meta: {
      title: 'Stok Fişleri',
      description: 'Stok giriş, çıkış ve transfer fişleri',
      icon: ReceiptIcon,
      section: 'main',
      menu: true,
    },
    element: plain(<StockReceiptsPage />),
  },
  {
    path: '/checks',
    meta: {
      title: 'Çekler',
      description: 'Çek portföyü, tahsilat ve iade takibi',
      icon: ReceiptIcon,
      section: 'main',
      menu: true,
      permission: 'checks_view',
    },
    element: guarded('checks_view', <ChecksPage />),
  },
  {
    path: '/cash',
    meta: {
      title: 'Kasa & Banka',
      description: 'Kasa, banka hesapları ve nakit hareketleri',
      icon: VaultIcon,
      section: 'main',
      menu: true,
      permission: 'cash_view',
    },
    element: guarded('cash_view', <CashPage />),
  },
  {
    path: '/cash/accounts/:accountId',
    meta: {
      title: 'Hesap Hareketi',
      description: 'Hesap hareket dökümü',
      parent: '/cash',
      permission: 'cash_view',
    },
    element: guarded('cash_view', <CashAccountDetailPage />),
  },
  {
    path: '/system-settings',
    meta: {
      title: 'Sistem Ayarları',
      description: 'Genel sistem ayarları ve yönetim tercihleri',
      icon: ShieldCheckIcon,
      section: 'admin',
      menu: true,
      adminOnly: true,
    },
    element: guarded(undefined, <SystemSettingsPage />, true),
  },
  {
    path: '/price-tiers',
    meta: {
      title: 'Fiyat Tarifeleri',
      description: 'Ürün bazlı fiyat katmanları yönetimi',
      icon: CurrencyCircleDollarIcon,
      section: 'admin',
      menu: true,
      permission: 'priceTiers_view',
    },
    element: guarded('priceTiers_view', <PriceTiersPage />),
  },
  {
    path: '/pricing-rules',
    meta: {
      title: 'Fiyatlandırma Kuralları',
      description: 'Fiyatlama kuralları ve koşul tanımları',
      icon: GearIcon,
      section: 'admin',
      menu: true,
      permission: 'pricingRules_view',
    },
    element: guarded('pricingRules_view', <PricingRulesPage />),
  },
  {
    path: '/users',
    meta: {
      title: 'Kullanıcılar',
      description: 'Kullanıcı hesapları ve yetki yönetimi',
      icon: UserIcon,
      section: 'admin',
      menu: true,
      permission: 'users_view',
    },
    element: guarded('users_view', <UsersPage />),
  },
  {
    path: '/audit-logs',
    meta: {
      title: 'Audit Logları',
      description: 'Sistem işlem geçmişi ve denetim kayıtları',
      icon: ScrollIcon,
      section: 'admin',
      menu: true,
      permission: 'auditLogs_view',
    },
    element: guarded('auditLogs_view', <AuditLogsPage />),
  },
  {
    path: '/reports/rental-movement',
    meta: {
      title: 'Kiralama Hareket Raporu',
      description: 'Kiralama hareket raporları ve analiz ekranı',
      icon: ChartBarIcon,
      section: 'reports',
      menu: true,
      permission: 'reports_view',
    },
    element: guarded('reports_view', <RentalMovementReportPage />),
  },
  {
    path: '/document-templates',
    meta: {
      title: 'Belge Şablonları',
      description: 'Teklif, sözleşme ve kullanım extresi şablonlarını yönetin',
      permission: 'contracts_view',
    },
    element: guarded('contracts_view', <DocumentTemplatesPage />),
  },
  {
    path: '/offer-management',
    meta: {
      title: 'Teklif Yönetimi',
      description: 'Kategori ve teklif paketi ayarlarını yönetin',
      permission: 'contracts_view',
    },
    element: guarded('contracts_view', <OfferManagementPage />),
  },
  {
    path: '/contract-management',
    meta: { title: 'Belge Şablonları', redirect: true, redirectTo: '/document-templates?tab=contract' },
    element: <Navigate to="/document-templates?tab=contract" replace />,
  },
  {
    path: '/offer-management/templates',
    meta: { title: 'Belge Şablonları', redirect: true, redirectTo: '/document-templates?tab=quote' },
    element: <Navigate to="/document-templates?tab=quote" replace />,
  },
  {
    path: '*',
    meta: { title: 'Sayfa', redirect: true, redirectTo: '/' },
    element: <Navigate to="/" replace />,
  },
];

export const sectionLabels: Record<AppSection, string> = {
  main: 'Operasyon',
  reports: 'Raporlar',
  admin: 'Yönetim',
};

export interface MatchedAppRoute {
  route: RouteConfig;
  params: Record<string, string | undefined>;
}

export function matchAppRoute(pathname: string): MatchedAppRoute | null {
  const matches = matchRoutes(appRoutes as RouteObject[], pathname);
  if (!matches || matches.length === 0) return null;
  const last = matches[matches.length - 1];
  const route = appRoutes.find((item) => item.path === last.route.path);
  if (!route) return null;
  return { route, params: last.params as Record<string, string | undefined> };
}

export interface ResolvedPath {
  pathname: string;
  search: string;
  hash: string;
  /** Yönlendirme uygulandıysa true; bu durumda gezinme durumu (state) taşınmaz */
  redirected: boolean;
}

const MAX_REDIRECT_HOPS = 5;

/**
 * Yönlendirme rotalarını (ör. /contracts → /contracts/rental) çözer.
 * Sekme açılabilecek bir yol bulunamazsa null döner.
 */
export function resolveTabPath(pathname: string, search = '', hash = ''): ResolvedPath | null {
  let current = { pathname, search, hash };
  let redirected = false;
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop += 1) {
    const matched = matchAppRoute(current.pathname);
    if (!matched) return null;
    const meta = matched.route.meta;
    if (!meta?.redirect) return { ...current, redirected };
    if (!meta.redirectTo) return null;
    const target = parsePath(meta.redirectTo);
    current = {
      pathname: target.pathname || '/',
      search: target.search || '',
      hash: target.hash || '',
    };
    redirected = true;
  }
  return null;
}

export function shouldOpenTab(pathname: string): boolean {
  const matched = matchAppRoute(pathname);
  if (!matched) return false;
  if (matched.route.meta?.redirect) return false;
  if (matched.route.path === '*') return false;
  return true;
}

/** Yeni kayıt formları sorgu dizesiyle ayrılır (kiralama / satış). */
export function buildTabId(pathname: string, search: string): string {
  const matched = matchAppRoute(pathname);
  if (matched?.params.id === 'new' || pathname.endsWith('/new')) {
    return pathname + (search || '');
  }
  return pathname;
}

export function isEphemeralPath(pathname: string): boolean {
  const matched = matchAppRoute(pathname);
  return matched?.params.id === 'new' || pathname.endsWith('/new');
}

export function titleForPath(pathname: string): string {
  const matched = matchAppRoute(pathname);
  if (!matched || matched.route.meta?.redirect) return 'Sayfa';
  return matched.route.meta?.title ?? 'Sayfa';
}
