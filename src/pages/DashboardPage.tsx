import { useEffect, useState, useMemo } from 'react';
import {
  ClipboardText,
  Users,
  Package,
  CurrencyCircleDollar,
  ChartBar,
  Warning,
  ArrowClockwise,
  FileText,
  TrendUp,
} from '@phosphor-icons/react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { contractService } from '../services/contractService';
import { customerService } from '../services/customerService';
import { inventoryService } from '../services/inventoryService';
import { Contract, Customer, Inventory, ContractAlert, AlertType } from '../models';

const MONTH_NAMES = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

/** Klas yatay dağılım çubuğu - sade ve profesyonel */
function DistributionBar({
  segments,
  height = 10,
}: {
  segments: { label: string; value: number; color: string }[];
  height?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) {
    return (
      <div
        className="w-full rounded-full bg-background-border"
        style={{ height }}
      />
    );
  }
  return (
    <div className="w-full flex overflow-hidden rounded-full" style={{ height }}>
      {segments
        .filter((s) => s.value > 0)
        .map((seg) => (
          <div
            key={seg.label}
            className="transition-all duration-300"
            style={{
              width: `${(seg.value / total) * 100}%`,
              backgroundColor: seg.color,
            }}
          />
        ))}
    </div>
  );
}

export default function DashboardPage() {
  const [activeContractsCount, setActiveContractsCount] = useState(0);
  const [totalCustomersCount, setTotalCustomersCount] = useState(0);
  const [itemsOnRentCount, setItemsOnRentCount] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [monthlyRevenue, setMonthlyRevenue] = useState(0);
  const [completedContractsThisMonth, setCompletedContractsThisMonth] = useState(0);
  const [totalInventoryCount, setTotalInventoryCount] = useState(0);
  const [completedContractsCount, setCompletedContractsCount] = useState(0);
  const [upcomingExpirations, setUpcomingExpirations] = useState<ContractAlert[]>([]);
  const [recentContracts, setRecentContracts] = useState<Contract[]>([]);
  const [lowStockItems, setLowStockItems] = useState<Inventory[]>([]);
  const [monthlyRevenueData, setMonthlyRevenueData] = useState<{ ay: string; gelir: number }[]>([]);
  const [totalStockSum, setTotalStockSum] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsMounted(true), 100);
    return () => clearTimeout(timer);
  }, []);

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

      const customerMap = new Map<number, Customer>();
      customers.forEach((c) => customerMap.set(c.CustomerId, c));
      const contractsWithCustomers = contracts.map((contract) => ({
        ...contract,
        Customer: customerMap.get(contract.CustomerId),
      }));

      const activeContracts = contractsWithCustomers.filter((c) => !c.IsCompleted);
      const completedContracts = contractsWithCustomers.filter((c) => c.IsCompleted);

      setActiveContractsCount(activeContracts.length);
      setCompletedContractsCount(completedContracts.length);
      setTotalCustomersCount(customers.length);

      const totalOnRent = inventory.reduce((sum, item) => sum + item.OnRent, 0);
      setItemsOnRentCount(totalOnRent);

      const totalRev = completedContracts.reduce(
        (sum, c) => sum + (c.FinalCalculatedPrice || 0),
        0
      );
      setTotalRevenue(totalRev);

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

      const totalStock = inventory.reduce((s, i) => s + i.TotalStock, 0);
      setTotalStockSum(totalStock);

      // Son 6 ay gelir verisi
      const monthlyData: { ay: string; gelir: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(thisYear, thisMonth - i, 1);
        const month = d.getMonth();
        const year = d.getFullYear();
        const revenue = completedContracts
          .filter((c) => {
            if (!c.ActualEndDate) return false;
            const endDate = new Date(c.ActualEndDate);
            return endDate.getMonth() === month && endDate.getFullYear() === year;
          })
          .reduce((sum, c) => sum + (c.FinalCalculatedPrice || 0), 0);
        monthlyData.push({ ay: `${MONTH_NAMES[month]} ${year}`, gelir: revenue });
      }
      setMonthlyRevenueData(monthlyData);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const alerts: ContractAlert[] = [];

      for (const contract of activeContracts) {
        if (!contract.PlannedEndDate) continue;
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

      alerts.sort((a, b) => {
        if (a.AlertType !== b.AlertType) return a.AlertType - b.AlertType;
        return a.DaysRemaining - b.DaysRemaining;
      });

      setUpcomingExpirations(alerts.slice(0, 5));

      const recent = contractsWithCustomers
        .sort((a, b) => new Date(b.StartDate).getTime() - new Date(a.StartDate).getTime())
        .slice(0, 5);
      setRecentContracts(recent);

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
        return 'bg-error';
      case AlertType.Critical:
        return 'bg-warning';
      case AlertType.Warning:
        return 'bg-primary';
      default:
        return 'bg-gray-500';
    }
  };

  const contractStatusData = useMemo(
    () => [
      { name: 'Aktif', value: activeContractsCount, color: 'var(--color-primary)' },
      { name: 'Tamamlanan', value: completedContractsCount, color: 'var(--color-success)' },
    ],
    [activeContractsCount, completedContractsCount]
  );

  const stockChartData = useMemo(
    () => [
      { name: 'Kirada', value: itemsOnRentCount, color: 'var(--color-primary)' },
      { name: 'Müsait', value: Math.max(0, totalStockSum - itemsOnRentCount), color: 'var(--color-success)' },
    ],
    [itemsOnRentCount, totalStockSum]
  );

  const chartColors = {
    primary: 'var(--color-primary)',
    success: 'var(--color-success)',
    warning: 'var(--color-warning)',
    grid: 'var(--color-border-muted)',
    axis: 'var(--color-border)',
    textPrimary: 'var(--color-text-primary)',
    textSecondary: 'var(--color-text-secondary)',
    panel: 'var(--color-bg-panel)',
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <ArrowClockwise size={32} className="text-text-secondary animate-spin" />
          <span className="text-text-secondary text-sm">Yükleniyor...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary mb-1">Dashboard</h1>
          <p className="text-text-secondary text-sm">Genel bakış ve istatistikler</p>
        </div>
        <button
          onClick={loadDashboardData}
          className="btn-primary flex items-center gap-2"
        >
          <ArrowClockwise size={18} weight="bold" />
          Yenile
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="card border-l-4 border-l-success pl-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-success/10 text-success">
              <ClipboardText size={22} weight="regular" />
            </div>
            <span className="text-text-secondary text-sm">Aktif Sözleşmeler</span>
          </div>
          <div className="text-2xl font-semibold tracking-tight">{activeContractsCount}</div>
        </div>
        <div className="card border-l-4 border-l-primary pl-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Users size={22} weight="regular" />
            </div>
            <span className="text-text-secondary text-sm">Toplam Müşteri</span>
          </div>
          <div className="text-2xl font-semibold tracking-tight">{totalCustomersCount}</div>
        </div>
        <div className="card border-l-4 border-l-warning pl-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-warning/10 text-warning">
              <Package size={22} weight="regular" />
            </div>
            <span className="text-text-secondary text-sm">Kirada Olan Malzeme</span>
          </div>
          <div className="text-2xl font-semibold tracking-tight">{itemsOnRentCount}</div>
        </div>
        <div className="card border-l-4 border-l-[#a855f7] pl-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-purple/10 text-purple">
              <CurrencyCircleDollar size={22} weight="regular" />
            </div>
            <span className="text-text-secondary text-sm">Toplam Gelir</span>
          </div>
          <div className="text-2xl font-semibold tracking-tight">{formatCurrency(totalRevenue)}</div>
        </div>
      </div>

      {/* Grafikler */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2 card">
          <div className="flex items-center gap-2 mb-6">
            <ChartBar size={20} weight="regular" className="text-primary" />
            <h2 className="text-lg font-semibold">Aylık Gelir Trendi</h2>
          </div>
          <div className="h-[260px] w-full min-w-0">
            {isMounted && (
              <ResponsiveContainer width="100%" height={260} minWidth={0} minHeight={0}>
                <BarChart data={monthlyRevenueData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
                  <XAxis
                    dataKey="ay"
                    tick={{ fill: chartColors.textSecondary, fontSize: 12 }}
                    axisLine={{ stroke: chartColors.axis }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: chartColors.textSecondary, fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => (v >= 1000 ? `${v / 1000}K` : String(v))}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: chartColors.panel,
                      border: `1px solid ${chartColors.axis}`,
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: chartColors.textPrimary }}
                    itemStyle={{ color: chartColors.textPrimary }}
                    formatter={(value: number | undefined) => [value != null ? formatCurrency(value) : '0', 'Gelir']}
                    labelFormatter={(label) => label}
                  />
                  <Bar dataKey="gelir" fill={chartColors.primary} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 mb-5">
            <TrendUp size={20} weight="regular" className="text-primary" />
            <h2 className="text-lg font-semibold">Sözleşme Durumu</h2>
          </div>
          <div className="space-y-4">
            <DistributionBar
              segments={contractStatusData.map((d) => ({
                label: d.name,
                value: d.value,
                color: d.color,
              }))}
              height={12}
            />
            <div className="flex flex-wrap gap-6 text-sm">
              {contractStatusData.map((d) => (
                <div key={d.name} className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: d.color }}
                  />
                  <span className="text-text-secondary">{d.name}</span>
                  <span className="font-semibold tabular-nums">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Stok Kullanım Özeti */}
      {totalStockSum > 0 && (
        <div className="card mb-8">
          <div className="flex items-center gap-2 mb-5">
            <Package size={20} weight="regular" className="text-primary" />
            <h2 className="text-lg font-semibold">Stok Kullanım Özeti</h2>
          </div>
          <div className="flex flex-col md:flex-row md:items-center md:gap-8 gap-4">
            <div className="flex-1 min-w-0">
              <DistributionBar
                segments={stockChartData.map((d) => ({
                  label: d.name,
                  value: d.value,
                  color: d.color,
                }))}
                height={12}
              />
            </div>
            <div className="flex flex-wrap gap-6 text-sm shrink-0">
              {stockChartData.map((d) => (
                <div key={d.name} className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: d.color }}
                  />
                  <span className="text-text-secondary">{d.name}</span>
                  <span className="font-semibold tabular-nums">{d.value}</span>
                </div>
              ))}
              {totalStockSum > 0 && (
                <div className="text-text-secondary">
                  Toplam: <span className="font-semibold text-text-primary tabular-nums">{totalStockSum}</span> adet
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bu Ay Özeti + Dikkat Gerektiren */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2 card">
          <h2 className="text-lg font-semibold mb-4">Bu Ay Özeti</h2>
          <div className="grid grid-cols-3 gap-6">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                <CurrencyCircleDollar size={18} weight="regular" />
              </div>
              <div>
                <div className="text-xs text-text-secondary uppercase tracking-wider mb-1">Aylık Gelir</div>
                <div className="text-xl font-semibold">{formatCurrency(monthlyRevenue)}</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-success/10 text-success shrink-0">
                <ClipboardText size={18} weight="regular" />
              </div>
              <div>
                <div className="text-xs text-text-secondary uppercase tracking-wider mb-1">Tamamlanan Sözleşme</div>
                <div className="text-xl font-semibold">{completedContractsThisMonth}</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-warning/10 text-warning shrink-0">
                <Package size={18} weight="regular" />
              </div>
              <div>
                <div className="text-xs text-text-secondary uppercase tracking-wider mb-1">Toplam Envanter</div>
                <div className="text-xl font-semibold">{totalInventoryCount}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Warning size={20} weight="regular" className="text-warning" />
            <h2 className="text-lg font-semibold">Dikkat Gerektiren Sözleşmeler</h2>
          </div>
          {upcomingExpirations.length === 0 ? (
            <div className="text-text-secondary text-sm py-4">Tüm sözleşmeler zamanında</div>
          ) : (
            <div className="space-y-4">
              {upcomingExpirations.map((alert) => (
                <div
                  key={alert.Contract.ContractId}
                  className="py-3 border-b border-background-border last:border-0"
                >
                  <div className="font-medium text-sm mb-1">{alert.Contract.Customer?.Name}</div>
                  <div
                    className="text-xs text-text-secondary mb-2"
                    title={alert.Contract.Type === 'SALE' ? 'Satışlarda planlanan bitiş tarihi kullanılmaz.' : undefined}
                  >
                    {alert.Contract.Type === 'SALE' ? '—' : alert.Contract.PlannedEndDate ? formatDate(alert.Contract.PlannedEndDate) : '—'}
                  </div>
                  <span className={`badge ${getAlertColor(alert.AlertType)} text-white text-xs`}>
                    {alert.AlertMessage}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Son Sözleşmeler + Düşük Stok */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <FileText size={20} weight="regular" className="text-primary" />
            <h2 className="text-lg font-semibold">Son Sözleşmeler</h2>
          </div>
          {recentContracts.length === 0 ? (
            <div className="text-text-secondary text-sm py-4">Henüz sözleşme yok</div>
          ) : (
            <div className="space-y-0">
              {recentContracts.map((contract) => (
                <div
                  key={contract.ContractId}
                  className="py-3 border-b border-background-border last:border-0 flex items-center justify-between gap-4"
                >
                  <div>
                    <div className="font-medium text-sm">{contract.Customer?.Name}</div>
                    <div className="text-xs text-text-secondary mt-0.5">
                      {contract.Type === 'SALE'
                        ? `${formatDate(contract.StartDate)}`
                        : `${formatDate(contract.StartDate)} – ${contract.PlannedEndDate ? formatDate(contract.PlannedEndDate) : '—'}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-success font-semibold text-sm">
                      {formatCurrency(contract.InitialTotalPrice)}
                    </span>
                    <span
                      className={`badge text-xs ${
                        contract.IsCompleted ? 'bg-success' : 'bg-primary'
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
          <div className="flex items-center gap-2 mb-4">
            <Warning size={20} weight="regular" className="text-warning" />
            <h2 className="text-lg font-semibold">Düşük Stok Uyarıları</h2>
          </div>
          {lowStockItems.length === 0 ? (
            <div className="text-text-secondary text-sm py-4">Tüm stoklar yeterli</div>
          ) : (
            <div className="space-y-0">
              {lowStockItems.map((item) => (
                <div
                  key={item.ItemId}
                  className="py-3 border-b border-background-border last:border-0"
                >
                  <div className="font-medium text-sm">{item.ItemName}</div>
                  <div className="text-xs text-text-secondary mt-0.5">
                    Müsait: {item.TotalStock - item.OnRent} / Toplam: {item.TotalStock}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
