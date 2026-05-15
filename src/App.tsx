import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import CustomersPage from './pages/CustomersPage';
import InventoryPage from './pages/InventoryPage';
import ItemMovementsPage from './pages/ItemMovementsPage';
import WarehousesPage from './pages/WarehousesPage';
import WarehouseDetailPage from './pages/WarehouseDetailPage';
import ContractsPage from './pages/ContractsPage';
import PurchaseInvoicesPage from './pages/PurchaseInvoicesPage';
import PriceTiersPage from './pages/PriceTiersPage';
import PricingRulesPage from './pages/PricingRulesPage';
import UsersPage from './pages/UsersPage';
import AuditLogsPage from './pages/AuditLogsPage';
import RentalMovementReportPage from './pages/RentalMovementReportPage';
import StockReceiptsPage from './pages/StockReceiptsPage';
import ChecksPage from './pages/ChecksPage';
import CashPage from './pages/CashPage';
import CashAccountDetailPage from './pages/CashAccountDetailPage';
import SystemSettingsPage from './pages/SystemSettingsPage';
import OfferManagementPage from './pages/OfferManagementPage';
import MainLayout from './layouts/MainLayout';
import ProtectedRoute from './components/ProtectedRoute';
import ToastContainer from './components/ToastContainer';
import { ContextMenuProvider } from './context-menu';

function App() {
  return (
    <HashRouter>
      <ContextMenuProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <DashboardPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/customers"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <CustomersPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/inventory"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <InventoryPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/inventory/:itemId/movements"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <ItemMovementsPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/warehouses"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <WarehousesPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/warehouses/:id"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <WarehouseDetailPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/contracts/rental"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <ContractsPage contractScope="rental" />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/contracts/sale"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <ContractsPage contractScope="sale" />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/contracts"
            element={
              <ProtectedRoute>
                <Navigate to="/contracts/rental" replace />
              </ProtectedRoute>
            }
          />
          <Route
            path="/purchase-invoices"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <PurchaseInvoicesPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/stock-receipts"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <StockReceiptsPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/checks"
            element={
              <ProtectedRoute requiredPermission="checks_view">
                <MainLayout>
                  <ChecksPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/cash/accounts/:accountId"
            element={
              <ProtectedRoute requiredPermission="cash_view">
                <MainLayout>
                  <CashAccountDetailPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/cash"
            element={
              <ProtectedRoute requiredPermission="cash_view">
                <MainLayout>
                  <CashPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/system-settings"
            element={
              <ProtectedRoute adminOnly>
                <MainLayout>
                  <SystemSettingsPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/price-tiers"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <PriceTiersPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/pricing-rules"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <PricingRulesPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/users"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <UsersPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/audit-logs"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <AuditLogsPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/offer-management"
            element={
              <ProtectedRoute requiredPermission="contracts_view">
                <MainLayout>
                  <OfferManagementPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports/rental-movement"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <RentalMovementReportPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <ToastContainer />
      </ContextMenuProvider>
    </HashRouter>
  );
}

export default App;

