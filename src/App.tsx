import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import CustomersPage from './pages/CustomersPage';
import InventoryPage from './pages/InventoryPage';
import WarehousesPage from './pages/WarehousesPage';
import ContractsPage from './pages/ContractsPage';
import PurchaseInvoicesPage from './pages/PurchaseInvoicesPage';
import PriceTiersPage from './pages/PriceTiersPage';
import PricingRulesPage from './pages/PricingRulesPage';
import UsersPage from './pages/UsersPage';
import AuditLogsPage from './pages/AuditLogsPage';
import MainLayout from './layouts/MainLayout';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <BrowserRouter>
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
          path="/contracts"
          element={
            <ProtectedRoute>
              <MainLayout>
                <ContractsPage />
              </MainLayout>
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

