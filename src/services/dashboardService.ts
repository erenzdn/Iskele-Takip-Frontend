import { apiClient } from './apiClient';

export interface DashboardMonthlyRevenuePoint {
  month: string;
  revenue: number;
  contractCount?: number;
}

export interface DashboardUpcomingExpiration {
  ContractId: number;
  ContractCode?: string | null;
  PlannedEndDate?: string | null;
  CustomerName?: string | null;
  NetTotal?: number | null;
  Currency?: string | null;
}

export interface DashboardRecentContract {
  ContractId: number;
  ContractCode?: string | null;
  StartDate?: string | null;
  NetTotal?: number | null;
  Currency?: string | null;
  Type?: string | null;
  CustomerName?: string | null;
}

export interface DashboardLowStockItem {
  ItemId: number;
  ItemCode?: string | null;
  ItemName: string;
  TotalStock: number;
  OnRent: number;
  AvailableStock?: number;
}

export interface DashboardSummary {
  activeContractsCount: number;
  completedContractsCount: number;
  totalCustomersCount: number;
  totalInventoryCount: number;
  itemsOnRentCount: number;
  totalStockSum: number;
  totalRevenue: number;
  monthlyRevenue: number;
  completedContractsThisMonth: number;
  monthlyRevenueSeries: DashboardMonthlyRevenuePoint[];
  upcomingExpirations: DashboardUpcomingExpiration[];
  recentContracts: DashboardRecentContract[];
  lowStockItems: DashboardLowStockItem[];
}

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeLowStockItem(raw: DashboardLowStockItem): DashboardLowStockItem {
  return {
    ...raw,
    TotalStock: toNumber(raw.TotalStock),
    OnRent: toNumber(raw.OnRent),
    AvailableStock:
      raw.AvailableStock != null
        ? toNumber(raw.AvailableStock)
        : toNumber(raw.TotalStock) - toNumber(raw.OnRent),
  };
}

export const dashboardService = {
  async getSummaryAsync(): Promise<DashboardSummary> {
    const raw = await apiClient.get<DashboardSummary>('/dashboard/summary');
    return {
      activeContractsCount: toNumber(raw?.activeContractsCount),
      completedContractsCount: toNumber(raw?.completedContractsCount),
      totalCustomersCount: toNumber(raw?.totalCustomersCount),
      totalInventoryCount: toNumber(raw?.totalInventoryCount),
      itemsOnRentCount: toNumber(raw?.itemsOnRentCount),
      totalStockSum: toNumber(raw?.totalStockSum),
      totalRevenue: toNumber(raw?.totalRevenue),
      monthlyRevenue: toNumber(raw?.monthlyRevenue),
      completedContractsThisMonth: toNumber(raw?.completedContractsThisMonth),
      monthlyRevenueSeries: Array.isArray(raw?.monthlyRevenueSeries) ? raw.monthlyRevenueSeries : [],
      upcomingExpirations: Array.isArray(raw?.upcomingExpirations) ? raw.upcomingExpirations : [],
      recentContracts: Array.isArray(raw?.recentContracts) ? raw.recentContracts : [],
      lowStockItems: Array.isArray(raw?.lowStockItems)
        ? raw.lowStockItems.map(normalizeLowStockItem)
        : [],
    };
  },
};
