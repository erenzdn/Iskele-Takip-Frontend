import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { dashboardService, type DashboardLowStockItem, type DashboardUpcomingExpiration } from '../services/dashboardService';

const MONTH_NAMES = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

function formatDashboardMonth(monthKey: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return monthKey;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return monthKey;
  return `${MONTH_NAMES[monthIndex]} ${year}`;
}

function formatUpcomingExpirationLabel(plannedEndDate?: string | null): string {
  if (!plannedEndDate) return '—';
  const end = new Date(plannedEndDate);
  end.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysRemaining = Math.floor((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (daysRemaining < 0) return `${Math.abs(daysRemaining)} gün gecikmiş!`;
  if (daysRemaining === 0) return 'Bugün bitiyor!';
  return `${daysRemaining} gün kaldı`;
}

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
  const navigate = useNavigate();
  const [activeContractsCount, setActiveContractsCount] = useState(0);
  const [totalCustomersCount, setTotalCustomersCount] = useState(0);
  const [itemsOnRentCount, setItemsOnRentCount] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [monthlyRevenue, setMonthlyRevenue] = useState(0);
  const [completedContractsThisMonth, setCompletedContractsThisMonth] = useState(0);
  const [totalInventoryCount, setTotalInventoryCount] = useState(0);
  const [completedContractsCount, setCompletedContractsCount] = useState(0);
  const [upcomingExpirations, setUpcomingExpirations] = useState<DashboardUpcomingExpiration[]>([]);
  const [recentContracts, setRecentContracts] = useState<
    Awaited<ReturnType<typeof dashboardService.getSummaryAsync>>['recentContracts']
  >([]);
  const [lowStockItems, setLowStockItems] = useState<DashboardLowStockItem[]>([]);
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
      const summary = await dashboardService.getSummaryAsync();

      setActiveContractsCount(summary.activeContractsCount);
      setCompletedContractsCount(summary.completedContractsCount);
      setTotalCustomersCount(summary.totalCustomersCount);
      setItemsOnRentCount(summary.itemsOnRentCount);
      setTotalRevenue(summary.totalRevenue);
      setMonthlyRevenue(summary.monthlyRevenue);
      setCompletedContractsThisMonth(summary.completedContractsThisMonth);
      setTotalInventoryCount(summary.totalInventoryCount);
      setTotalStockSum(summary.totalStockSum);

      const monthlyData = [...summary.monthlyRevenueSeries]
        .reverse()
        .slice(-6)
        .map((point) => ({
          ay: formatDashboardMonth(point.month),
          gelir: point.revenue ?? 0,
        }));
      setMonthlyRevenueData(monthlyData);

      setUpcomingExpirations(summary.upcomingExpirations.slice(0, 5));
      setRecentContracts(summary.recentContracts);
      setLowStockItems(summary.lowStockItems.slice(0, 5));
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

  const getAlertColor = (plannedEndDate?: string | null) => {
    if (!plannedEndDate) return 'bg-gray-500';
    const end = new Date(plannedEndDate);
    end.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysRemaining = Math.floor((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (daysRemaining < 0) return 'bg-error';
    if (daysRemaining <= 2) return 'bg-warning';
    return 'bg-primary';
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
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <ArrowClockwise size={32} className="text-text-secondary animate-spin" />
          <span className="text-text-secondary text-sm">Yükleniyor...</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-end">
        <button
          onClick={loadDashboardData}
          className="btn-primary flex items-center gap-2 py-2 px-3 text-sm"
        >
          <ArrowClockwise size={16} weight="bold" />
          Yenile
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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
        <button
          type="button"
          onClick={() => navigate('/inventory?stockStatus=onRent')}
          title="Envanterde kiradaki malzemeleri gör"
          className="card border-l-4 border-l-warning pl-6 text-left w-full hover:bg-background-hover transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-warning/10 text-warning">
              <Package size={22} weight="regular" />
            </div>
            <span className="text-text-secondary text-sm">Kirada Olan Malzeme</span>
          </div>
          <div className="text-2xl font-semibold tracking-tight">{itemsOnRentCount}</div>
          <div className="mt-1 text-xs text-text-secondary">Envanterde gör →</div>
        </button>
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
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
        <div className="card mb-6">
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
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
                  key={alert.ContractId}
                  className="py-3 border-b border-background-border last:border-0"
                >
                  <div className="font-medium text-sm mb-1">{alert.CustomerName || '—'}</div>
                  <div className="text-xs text-text-secondary mb-2">
                    {alert.PlannedEndDate ? formatDate(alert.PlannedEndDate) : '—'}
                  </div>
                  <span className={`badge ${getAlertColor(alert.PlannedEndDate)} text-white text-xs`}>
                    {formatUpcomingExpirationLabel(alert.PlannedEndDate)}
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
                    <div className="font-medium text-sm">{contract.CustomerName || '—'}</div>
                    <div className="text-xs text-text-secondary mt-0.5">
                      {contract.StartDate ? formatDate(contract.StartDate) : '—'}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-success font-semibold text-sm">
                      {formatCurrency(contract.NetTotal ?? 0)}
                    </span>
                    {contract.Type ? (
                      <span className="badge bg-primary text-white text-xs">{contract.Type}</span>
                    ) : null}
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
                    Müsait: {(item.AvailableStock ?? item.TotalStock - item.OnRent)} / Toplam: {item.TotalStock}
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
