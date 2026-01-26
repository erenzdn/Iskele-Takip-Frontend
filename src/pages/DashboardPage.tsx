import { useEffect, useState } from 'react';
import { contractService } from '../services/contractService';
import { customerService } from '../services/customerService';
import { inventoryService } from '../services/inventoryService';
import { Contract, Customer, Inventory, ContractAlert, AlertType } from '../models';

export default function DashboardPage() {
  const [activeContractsCount, setActiveContractsCount] = useState(0);
  const [totalCustomersCount, setTotalCustomersCount] = useState(0);
  const [itemsOnRentCount, setItemsOnRentCount] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [monthlyRevenue, setMonthlyRevenue] = useState(0);
  const [completedContractsThisMonth, setCompletedContractsThisMonth] = useState(0);
  const [totalInventoryCount, setTotalInventoryCount] = useState(0);
  const [upcomingExpirations, setUpcomingExpirations] = useState<ContractAlert[]>([]);
  const [recentContracts, setRecentContracts] = useState<Contract[]>([]);
  const [lowStockItems, setLowStockItems] = useState<Inventory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const [contracts, customers, inventory] = await Promise.all([
        contractService.getAllAsync(),
        customerService.getAllAsync(),
        inventoryService.getAllAsync(),
      ]);

      // Customer bilgilerini contracts'a ekle (API nested döndürmüyor)
      const customerMap = new Map<number, Customer>();
      customers.forEach((c) => customerMap.set(c.CustomerId, c));
      const contractsWithCustomers = contracts.map((contract) => ({
        ...contract,
        Customer: customerMap.get(contract.CustomerId),
      }));

      // Calculate statistics
      const activeContracts = contractsWithCustomers.filter((c) => !c.IsCompleted);
      setActiveContractsCount(activeContracts.length);
      setTotalCustomersCount(customers.length);

      const totalOnRent = inventory.reduce((sum, item) => sum + item.OnRent, 0);
      setItemsOnRentCount(totalOnRent);

      const completedContracts = contractsWithCustomers.filter((c) => c.IsCompleted);
      const totalRev = completedContracts.reduce(
        (sum, c) => sum + (c.FinalCalculatedPrice || 0),
        0
      );
      setTotalRevenue(totalRev);

      // This month calculations
      const now = new Date();
      const thisMonth = now.getMonth();
      const thisYear = now.getFullYear();

      const completedThisMonth = completedContracts.filter((c) => {
        if (!c.ActualEndDate) return false;
        const endDate = new Date(c.ActualEndDate);
        return endDate.getMonth() === thisMonth && endDate.getFullYear() === thisYear;
      });

      setCompletedContractsThisMonth(completedThisMonth.length);
      const monthlyRev = completedThisMonth.reduce(
        (sum, c) => sum + (c.FinalCalculatedPrice || 0),
        0
      );
      setMonthlyRevenue(monthlyRev);
      setTotalInventoryCount(inventory.length);

      // Upcoming expirations
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const alerts: ContractAlert[] = [];
      
      for (const contract of activeContracts) {
        const plannedEnd = new Date(contract.PlannedEndDate);
        plannedEnd.setHours(0, 0, 0, 0);
        const daysRemaining = Math.floor(
          (plannedEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );

        let alertType: AlertType;
        if (daysRemaining < 0) {
          alertType = AlertType.Overdue;
        } else if (daysRemaining <= 2) {
          alertType = AlertType.Critical;
        } else if (daysRemaining <= 7) {
          alertType = AlertType.Warning;
        } else {
          continue;
        }

        const alertMessage =
          alertType === AlertType.Overdue
            ? `${Math.abs(daysRemaining)} gün gecikmiş!`
            : daysRemaining === 0
            ? 'Bugün bitiyor!'
            : `${daysRemaining} gün kaldı`;

        alerts.push({
          Contract: contract as Contract,
          DaysRemaining: daysRemaining,
          AlertType: alertType,
          AlertMessage: alertMessage,
        });
      }

      // Sort: Overdue first, then by days remaining
      alerts.sort((a, b) => {
        if (a.AlertType !== b.AlertType) {
          return a.AlertType - b.AlertType;
        }
        return a.DaysRemaining - b.DaysRemaining;
      });

      setUpcomingExpirations(alerts.slice(0, 5));

      // Recent contracts
      const recent = contractsWithCustomers
        .sort((a, b) => new Date(b.StartDate).getTime() - new Date(a.StartDate).getTime())
        .slice(0, 5);
      setRecentContracts(recent);

      // Low stock items
      const lowStock = inventory
        .filter(
          (item) =>
            item.TotalStock > 0 &&
            item.TotalStock - item.OnRent <= item.TotalStock * 0.2
        )
        .slice(0, 5);
      setLowStockItems(lowStock);
    } catch (error) {
      console.error('Dashboard load error:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return `₺${amount.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('tr-TR');
  };

  const getAlertColor = (type: AlertType) => {
    switch (type) {
      case AlertType.Overdue:
        return 'bg-red-500';
      case AlertType.Critical:
        return 'bg-warning';
      case AlertType.Warning:
        return 'bg-primary';
      default:
        return 'bg-gray-500';
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-text-secondary">Yükleniyor...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
        <p className="text-text-secondary">Genel bakış ve istatistikler</p>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-4 gap-6 mb-8">
        <div className="card bg-green-600">
          <div className="text-4xl mb-2">📋</div>
          <div className="text-3xl font-bold mb-1">{activeContractsCount}</div>
          <div className="text-sm opacity-90">Aktif Sözleşmeler</div>
        </div>
        <div className="card bg-primary">
          <div className="text-4xl mb-2">👥</div>
          <div className="text-3xl font-bold mb-1">{totalCustomersCount}</div>
          <div className="text-sm opacity-90">Toplam Müşteri</div>
        </div>
        <div className="card bg-warning">
          <div className="text-4xl mb-2">📦</div>
          <div className="text-3xl font-bold mb-1">{itemsOnRentCount}</div>
          <div className="text-sm opacity-90">Kirada Olan Malzeme</div>
        </div>
        <div className="card bg-purple">
          <div className="text-4xl mb-2">💰</div>
          <div className="text-3xl font-bold mb-1">{formatCurrency(totalRevenue)}</div>
          <div className="text-sm opacity-90">Toplam Gelir</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* This Month Summary */}
        <div className="col-span-2 card">
          <h2 className="text-xl font-bold mb-4">Bu Ay Özeti</h2>
          <div className="space-y-4">
            <div>
              <div className="text-sm text-text-secondary mb-1">Aylık Gelir</div>
              <div className="text-2xl font-bold">{formatCurrency(monthlyRevenue)}</div>
            </div>
            <div>
              <div className="text-sm text-text-secondary mb-1">Tamamlanan Sözleşme</div>
              <div className="text-2xl font-bold">{completedContractsThisMonth}</div>
            </div>
            <div>
              <div className="text-sm text-text-secondary mb-1">Toplam Envanter</div>
              <div className="text-2xl font-bold">{totalInventoryCount}</div>
            </div>
          </div>
        </div>

        {/* Upcoming Expirations */}
        <div className="card">
          <h2 className="text-xl font-bold mb-4">Dikkat Gerektiren Sözleşmeler</h2>
          {upcomingExpirations.length === 0 ? (
            <div className="text-text-secondary text-sm">Tüm sözleşmeler zamanında</div>
          ) : (
            <div className="space-y-3">
              {upcomingExpirations.map((alert) => (
                <div key={alert.Contract.ContractId} className="border-b border-background-border pb-3">
                  <div className="font-medium mb-1">{alert.Contract.Customer?.Name}</div>
                  <div className="text-sm text-text-secondary mb-2">
                    {formatDate(alert.Contract.PlannedEndDate)}
                  </div>
                  <span className={`badge ${getAlertColor(alert.AlertType)} text-white`}>
                    {alert.AlertMessage}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Contracts & Low Stock */}
      <div className="grid grid-cols-2 gap-6 mt-6">
        <div className="card">
          <h2 className="text-xl font-bold mb-4">Son Sözleşmeler</h2>
          {recentContracts.length === 0 ? (
            <div className="text-text-secondary text-sm">Henüz sözleşme yok</div>
          ) : (
            <div className="space-y-3">
              {recentContracts.map((contract) => (
                <div key={contract.ContractId} className="border-b border-background-border pb-3">
                  <div className="font-medium mb-1">{contract.Customer?.Name}</div>
                  <div className="text-sm text-text-secondary mb-2">
                    {formatDate(contract.StartDate)} - {formatDate(contract.PlannedEndDate)}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-green-500 font-bold">
                      {formatCurrency(contract.InitialTotalPrice)}
                    </span>
                    <span
                      className={`badge ${
                        contract.IsCompleted ? 'bg-green-600' : 'bg-blue-600'
                      } text-white`}
                    >
                      {contract.IsCompleted ? 'Tamamlandı' : 'Aktif'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="text-xl font-bold mb-4">Düşük Stok Uyarıları</h2>
          {lowStockItems.length === 0 ? (
            <div className="text-text-secondary text-sm">Tüm stoklar yeterli</div>
          ) : (
            <div className="space-y-3">
              {lowStockItems.map((item) => (
                <div key={item.ItemId} className="border-b border-background-border pb-3">
                  <div className="font-medium mb-1">{item.ItemName}</div>
                  <div className="text-sm text-text-secondary">
                    Müsait: {item.TotalStock - item.OnRent} / Toplam: {item.TotalStock}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6">
        <button onClick={loadDashboardData} className="btn-primary">
          Yenile
        </button>
      </div>
    </div>
  );
}

