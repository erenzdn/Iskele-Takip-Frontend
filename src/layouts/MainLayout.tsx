import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

interface MainLayoutProps {
  children: React.ReactNode;
}

type MenuItem = { path: string; label: string; icon: string; requiredPermission?: string };

const mainMenuItems: MenuItem[] = [
  { path: '/', label: 'Dashboard', icon: '📊' },
  { path: '/customers', label: 'Müşteriler', icon: '👥', requiredPermission: 'customers_view' },
  { path: '/inventory', label: 'Envanter', icon: '📦', requiredPermission: 'inventory_view' },
  { path: '/warehouses', label: 'Depolar', icon: '🏭', requiredPermission: 'warehouses_view' },
  { path: '/contracts', label: 'Sözleşmeler', icon: '📋', requiredPermission: 'contracts_view' },
  { path: '/purchase-invoices', label: 'Alış Faturaları', icon: '🧾', requiredPermission: 'purchaseInvoices_view' },
];

const managementMenuItems: MenuItem[] = [
  { path: '/price-tiers', label: 'Fiyat Tarifeleri', icon: '💰', requiredPermission: 'priceTiers_view' },
  { path: '/pricing-rules', label: 'Fiyatlandırma Kuralları', icon: '⚙️', requiredPermission: 'pricingRules_view' },
  { path: '/users', label: 'Kullanıcılar', icon: '👤', requiredPermission: 'users_view' },
  { path: '/audit-logs', label: 'Audit Logları', icon: '📋', requiredPermission: 'auditLogs_view' },
];

function filterByPermission(items: MenuItem[], permissions: string[]) {
  return items.filter(
    (item) => !item.requiredPermission || permissions.includes(item.requiredPermission)
  );
}

function NavLink({ item, isActive }: { item: MenuItem; isActive: boolean }) {
  return (
    <Link
      to={item.path}
      className={`flex items-center gap-3 px-4 py-3 rounded-lg mb-2 transition-colors ${
        isActive
          ? 'bg-primary text-white'
          : 'text-text-secondary hover:bg-background-hover hover:text-text-primary'
      }`}
    >
      <span className="text-lg">{item.icon}</span>
      <span className="font-medium">{item.label}</span>
    </Link>
  );
}

export default function MainLayout({ children }: MainLayoutProps) {
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const permissions = user?.Permissions ?? [];
  const visibleMain = filterByPermission(mainMenuItems, permissions);
  const visibleManagement = filterByPermission(managementMenuItems, permissions);

  return (
    <div className="flex h-screen bg-background-main">
      {/* Sidebar */}
      <aside className="w-64 bg-background-sidebar border-r border-background-border flex flex-col">
        <div className="p-6 border-b border-background-border">
          <h1 className="text-xl font-bold text-text-primary">İskeleTakip</h1>
        </div>
        <nav className="flex-1 p-4 overflow-y-auto">
          {visibleMain.map((item) => (
            <NavLink key={item.path} item={item} isActive={location.pathname === item.path} />
          ))}
          {visibleManagement.length > 0 && (
            <div className="pt-4 mt-4 border-t border-background-border">
              <div className="px-4 mb-2 text-xs font-semibold text-text-secondary uppercase tracking-wider">
                Yönetim
              </div>
              {visibleManagement.map((item) => (
                <NavLink key={item.path} item={item} isActive={location.pathname === item.path} />
              ))}
            </div>
          )}
        </nav>
        <div className="p-4 border-t border-background-border">
          <button
            onClick={logout}
            className="w-full btn-secondary text-left"
          >
            Çıkış Yap
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-background-main">
        {children}
      </main>
    </div>
  );
}

