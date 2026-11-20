import { apiClient } from './apiClient';

export type CurrencyAmounts = { TRY: number; EUR: number; USD: number };

export interface DashboardMonthlyRevenuePoint {
  /** 'YYYY-MM' */
  month: string;
  /** Kapanan kira + satış, ₺ karşılığı (kur yoksa ve döviz varsa null) */
  revenue: number | null;
  revenueByCurrency?: CurrencyAmounts;
  saleRevenue?: number | null;
  /** Kesilen faturalar, ₺ karşılığı */
  invoiced?: number | null;
  invoicedByCurrency?: CurrencyAmounts;
  /** O ay kapanan kira sözleşmesi adedi */
  contractCount?: number;
  newRentalContracts?: number;
  newSaleContracts?: number;
}

export interface DashboardUpcomingExpiration {
  ContractId: number;
  ContractCode?: string | null;
  PlannedEndDate?: string | null;
  CustomerId?: number | null;
  CustomerName?: string | null;
  NetTotal?: number | null;
  Currency?: string | null;
  DeliveryMode?: string | null;
  /** Negatif: gecikmiş gün */
  DaysRemaining?: number;
  OnSiteQuantity?: number;
}

export interface DashboardRecentContract {
  ContractId: number;
  ContractCode?: string | null;
  StartDate?: string | null;
  NetTotal?: number | null;
  Currency?: string | null;
  Type?: string | null;
  IsCompleted?: boolean | null;
  CustomerId?: number | null;
  CustomerName?: string | null;
}

export interface DashboardLowStockItem {
  ItemId: number;
  ItemCode?: string | null;
  ItemName: string;
  TotalStock: number;
  OnRent: number;
  Reserved?: number;
  AvailableStock?: number;
}

export interface DashboardTopItem {
  ItemId: number;
  ItemCode?: string | null;
  ItemName: string;
  TotalStock: number;
  OnRent: number;
  Reserved: number;
}

export interface DashboardTopCustomer {
  CustomerId: number;
  CustomerName?: string | null;
  ActiveContracts: number;
  OnSiteQuantity: number;
}

export interface DashboardPendingShipment {
  ContractId: number;
  ContractCode?: string | null;
  StartDate?: string | null;
  CustomerId?: number | null;
  CustomerName?: string | null;
  PendingQuantity: number;
  ShippedQuantity: number;
}

export interface DashboardUninvoicedContract {
  ContractId: number;
  ContractCode?: string | null;
  CustomerId?: number | null;
  CustomerName?: string | null;
  RentalStart?: string | null;
  LastInvoicedThrough?: string | null;
  DaysUninvoiced: number;
}

export interface DashboardCheckDue {
  CheckId: string;
  CheckNumber?: string | null;
  BankName?: string | null;
  Amount: number;
  Currency?: string | null;
  DueDate?: string | null;
  DaysRemaining: number;
  CustomerName?: string | null;
}

export interface DashboardSummary {
  generatedAt: string | null;
  exchangeRate: { UsdRate: number; EurRate: number } | null;

  activeContractsCount: number;
  activeCustomersCount: number;
  completedContractsCount: number;
  completedContractsThisMonth: number;
  totalCustomersCount: number;
  totalInventoryCount: number;
  itemsOnRentCount: number;
  totalStockSum: number;
  reservedStockSum: number;

  totalRevenue: number | null;
  totalRevenueByCurrency: CurrencyAmounts;
  rentalRevenue: number | null;
  saleRevenue: number | null;
  monthlyRevenue: number | null;
  monthlyRevenueByCurrency: CurrencyAmounts;
  lastMonthRevenue: number | null;
  invoicedThisMonth: number | null;
  invoicedLastMonth: number | null;
  newContractsThisMonth: number;
  newContractsLastMonth: number;

  /** Eskiden yeniye */
  monthlyRevenueSeries: DashboardMonthlyRevenuePoint[];

  upcomingExpirations: DashboardUpcomingExpiration[];
  overdueContractsCount: number;
  expiringIn7DaysCount: number;
  recentContracts: DashboardRecentContract[];
  lowStockItems: DashboardLowStockItem[];
  topItemsOnRent: DashboardTopItem[];
  topCustomers: DashboardTopCustomer[];
  pendingShipments: DashboardPendingShipment[];
  pendingShipmentsCount: number;
  uninvoicedContracts: DashboardUninvoicedContract[];
  uninvoicedContractsCount: number;
  pendingQuotesCount: number;
  pendingQuotesTotal: number | null;
  pendingQuotesByCurrency: CurrencyAmounts;
  /** checks_view yetkisi yoksa null */
  checksDueSoon: DashboardCheckDue[] | null;
  checksDueSoonCount: number;
}

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** null korunur: "kur yok, toplam hesaplanamadı" anlamına gelir. */
function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toAmounts(value: unknown): CurrencyAmounts {
  const v = (value ?? {}) as Partial<Record<keyof CurrencyAmounts, unknown>>;
  return { TRY: toNumber(v.TRY), EUR: toNumber(v.EUR), USD: toNumber(v.USD) };
}

function arr<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeLowStockItem(raw: DashboardLowStockItem): DashboardLowStockItem {
  const total = toNumber(raw.TotalStock);
  const onRent = toNumber(raw.OnRent);
  const reserved = toNumber(raw.Reserved);
  return {
    ...raw,
    TotalStock: total,
    OnRent: onRent,
    Reserved: reserved,
    AvailableStock: raw.AvailableStock != null ? toNumber(raw.AvailableStock) : total - onRent - reserved,
  };
}

function normalizeSeriesPoint(p: DashboardMonthlyRevenuePoint): DashboardMonthlyRevenuePoint {
  return {
    ...p,
    revenue: toNullableNumber(p.revenue),
    saleRevenue: toNullableNumber(p.saleRevenue),
    invoiced: toNullableNumber(p.invoiced),
    contractCount: toNumber(p.contractCount),
    newRentalContracts: toNumber(p.newRentalContracts),
    newSaleContracts: toNumber(p.newSaleContracts),
  };
}

export function normalizeDashboardSummary(raw: Partial<DashboardSummary> | null | undefined): DashboardSummary {
  const r = raw ?? {};
  // Eski sunucu sürümü seriyi yeniden eskiye döndürüyordu; her durumda eskiden yeniye sırala.
  const series = arr<DashboardMonthlyRevenuePoint>(r.monthlyRevenueSeries)
    .map(normalizeSeriesPoint)
    .sort((a, b) => a.month.localeCompare(b.month));
  return {
    generatedAt: r.generatedAt ?? null,
    exchangeRate: r.exchangeRate ?? null,
    activeContractsCount: toNumber(r.activeContractsCount),
    activeCustomersCount: toNumber(r.activeCustomersCount),
    completedContractsCount: toNumber(r.completedContractsCount),
    completedContractsThisMonth: toNumber(r.completedContractsThisMonth),
    totalCustomersCount: toNumber(r.totalCustomersCount),
    totalInventoryCount: toNumber(r.totalInventoryCount),
    itemsOnRentCount: toNumber(r.itemsOnRentCount),
    totalStockSum: toNumber(r.totalStockSum),
    reservedStockSum: toNumber(r.reservedStockSum),
    totalRevenue: toNullableNumber(r.totalRevenue),
    totalRevenueByCurrency: toAmounts(r.totalRevenueByCurrency),
    rentalRevenue: toNullableNumber(r.rentalRevenue),
    saleRevenue: toNullableNumber(r.saleRevenue),
    monthlyRevenue: toNullableNumber(r.monthlyRevenue),
    monthlyRevenueByCurrency: toAmounts(r.monthlyRevenueByCurrency),
    lastMonthRevenue: toNullableNumber(r.lastMonthRevenue),
    invoicedThisMonth: toNullableNumber(r.invoicedThisMonth),
    invoicedLastMonth: toNullableNumber(r.invoicedLastMonth),
    newContractsThisMonth: toNumber(r.newContractsThisMonth),
    newContractsLastMonth: toNumber(r.newContractsLastMonth),
    monthlyRevenueSeries: series,
    upcomingExpirations: arr<DashboardUpcomingExpiration>(r.upcomingExpirations),
    overdueContractsCount: toNumber(r.overdueContractsCount),
    expiringIn7DaysCount: toNumber(r.expiringIn7DaysCount),
    recentContracts: arr<DashboardRecentContract>(r.recentContracts),
    lowStockItems: arr<DashboardLowStockItem>(r.lowStockItems).map(normalizeLowStockItem),
    topItemsOnRent: arr<DashboardTopItem>(r.topItemsOnRent).map((i) => ({
      ...i,
      TotalStock: toNumber(i.TotalStock),
      OnRent: toNumber(i.OnRent),
      Reserved: toNumber(i.Reserved),
    })),
    topCustomers: arr<DashboardTopCustomer>(r.topCustomers).map((c) => ({
      ...c,
      ActiveContracts: toNumber(c.ActiveContracts),
      OnSiteQuantity: toNumber(c.OnSiteQuantity),
    })),
    pendingShipments: arr<DashboardPendingShipment>(r.pendingShipments).map((s) => ({
      ...s,
      PendingQuantity: toNumber(s.PendingQuantity),
      ShippedQuantity: toNumber(s.ShippedQuantity),
    })),
    pendingShipmentsCount: toNumber(r.pendingShipmentsCount),
    uninvoicedContracts: arr<DashboardUninvoicedContract>(r.uninvoicedContracts).map((u) => ({
      ...u,
      DaysUninvoiced: toNumber(u.DaysUninvoiced),
    })),
    uninvoicedContractsCount: toNumber(r.uninvoicedContractsCount),
    pendingQuotesCount: toNumber(r.pendingQuotesCount),
    pendingQuotesTotal: toNullableNumber(r.pendingQuotesTotal),
    pendingQuotesByCurrency: toAmounts(r.pendingQuotesByCurrency),
    checksDueSoon: Array.isArray(r.checksDueSoon)
      ? r.checksDueSoon.map((c) => ({ ...c, Amount: toNumber(c.Amount), DaysRemaining: toNumber(c.DaysRemaining) }))
      : null,
    checksDueSoonCount: toNumber(r.checksDueSoonCount),
  };
}

export const dashboardService = {
  async getSummaryAsync(): Promise<DashboardSummary> {
    const raw = await apiClient.get<Partial<DashboardSummary>>('/dashboard/summary');
    return normalizeDashboardSummary(raw);
  },
};
