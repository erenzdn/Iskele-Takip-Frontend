import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import LoginPage from './pages/LoginPage';
import MainLayout from './layouts/MainLayout';
import ProtectedRoute from './components/ProtectedRoute';
import ToastContainer from './components/ToastContainer';
import UpdateListener from './components/UpdateListener';
import PageLoader from './components/PageLoader';
import { ContextMenuProvider } from './context-menu';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const CustomersPage = lazy(() => import('./pages/CustomersPage'));
const InventoryPage = lazy(() => import('./pages/InventoryPage'));
const ItemMovementsPage = lazy(() => import('./pages/ItemMovementsPage'));
const WarehousesPage = lazy(() => import('./pages/WarehousesPage'));
const WarehouseDetailPage = lazy(() => import('./pages/WarehouseDetailPage'));
const ContractsPage = lazy(() => import('./pages/ContractsPage'));
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
const OfferManagementPage = lazy(() => import('./pages/OfferManagementPage'));

function App() {
  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <UpdateListener />
      <ContextMenuProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
            <Route path="/" element={<Suspense fallback={<PageLoader />}><DashboardPage /></Suspense>} />
            <Route path="/customers" element={<Suspense fallback={<PageLoader />}><CustomersPage /></Suspense>} />
            <Route path="/inventory" element={<Suspense fallback={<PageLoader />}><InventoryPage /></Suspense>} />
            <Route path="/inventory/:itemId/movements" element={<Suspense fallback={<PageLoader />}><ItemMovementsPage /></Suspense>} />
            <Route path="/warehouses" element={<Suspense fallback={<PageLoader />}><WarehousesPage /></Suspense>} />
            <Route path="/warehouses/:id" element={<Suspense fallback={<PageLoader />}><WarehouseDetailPage /></Suspense>} />
            <Route path="/contracts/rental" element={<Suspense fallback={<PageLoader />}><ContractsPage contractScope="rental" /></Suspense>} />
            <Route path="/contracts/sale" element={<Suspense fallback={<PageLoader />}><ContractsPage contractScope="sale" /></Suspense>} />
            <Route path="/contracts" element={<Navigate to="/contracts/rental" replace />} />
            <Route path="/purchase-invoices" element={<Suspense fallback={<PageLoader />}><PurchaseInvoicesPage /></Suspense>} />
            <Route path="/stock-receipts" element={<Suspense fallback={<PageLoader />}><StockReceiptsPage /></Suspense>} />
          </Route>
          <Route element={<ProtectedRoute requiredPermission="checks_view"><MainLayout /></ProtectedRoute>}>
            <Route path="/checks" element={<Suspense fallback={<PageLoader />}><ChecksPage /></Suspense>} />
          </Route>
          <Route element={<ProtectedRoute requiredPermission="cash_view"><MainLayout /></ProtectedRoute>}>
            <Route path="/cash/accounts/:accountId" element={<Suspense fallback={<PageLoader />}><CashAccountDetailPage /></Suspense>} />
            <Route path="/cash" element={<Suspense fallback={<PageLoader />}><CashPage /></Suspense>} />
          </Route>
          <Route element={<ProtectedRoute adminOnly><MainLayout /></ProtectedRoute>}>
            <Route path="/system-settings" element={<Suspense fallback={<PageLoader />}><SystemSettingsPage /></Suspense>} />
          </Route>
          <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
            <Route path="/price-tiers" element={<Suspense fallback={<PageLoader />}><PriceTiersPage /></Suspense>} />
            <Route path="/pricing-rules" element={<Suspense fallback={<PageLoader />}><PricingRulesPage /></Suspense>} />
            <Route path="/users" element={<Suspense fallback={<PageLoader />}><UsersPage /></Suspense>} />
            <Route path="/audit-logs" element={<Suspense fallback={<PageLoader />}><AuditLogsPage /></Suspense>} />
            <Route path="/reports/rental-movement" element={<Suspense fallback={<PageLoader />}><RentalMovementReportPage /></Suspense>} />
          </Route>
          <Route element={<ProtectedRoute requiredPermission="contracts_view"><MainLayout /></ProtectedRoute>}>
            <Route path="/offer-management" element={<Suspense fallback={<PageLoader />}><OfferManagementPage /></Suspense>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <ToastContainer />
      </ContextMenuProvider>
    </HashRouter>
  );
}

export default App;

