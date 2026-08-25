// Entity Models
export interface Customer {
  CustomerId: number;
  Name: string;
  TaxId?: string;
  TaxOffice?: string;
  PhoneNumber?: string;
  Email?: string;
  Address?: string;
  /** Arşiv (soft delete). Doluysa müşteri listede görünmez; GET /customers/:id ile detay alınabilir. */
  DeletedAt?: string | null;
  deletedAt?: string | null;
  CreatedAt?: string;
  CreatedByUserFullName?: string;
  CreatedByUserName?: string;
  LastModifiedAt?: string | null;
  LastModifiedByUserFullName?: string | null;
  LastModifiedByUserName?: string | null;
  AuthorizedContacts?: AuthorizedContact[];
  Contracts?: Contract[];
  Sites?: ConstructionSite[];
}

/** Silinmiş / arşivlenmiş müşteri (DeletedAt dolu). */
export function pickCustomerDeletedAt(
  c: Pick<Customer, 'DeletedAt' | 'deletedAt'>
): string | null | undefined {
  return c.DeletedAt ?? c.deletedAt;
}

export function isCustomerArchived(c: Pick<Customer, 'DeletedAt' | 'deletedAt'>): boolean {
  const v = pickCustomerDeletedAt(c);
  return v != null && String(v).trim() !== '';
}

export interface AuthorizedContact {
  CustomerAuthorizedContactId?: number;
  Name: string;
  Phone?: string | null;
  Email?: string | null;
  Title?: string | null;
  IsPrimary?: boolean;
  OrderNo?: number;
}

export interface ConstructionSite {
  SiteId: number;
  CustomerId: number;
  SiteName: string;
  SiteAddress?: string;
  ResponsiblePerson?: string;
  ResponsiblePhone?: string;
  Customer?: Customer;
}

export interface MaterialCategory {
  CategoryId: number;
  CategoryName: string;
  RentalUnit?: string;
  Inventories?: Inventory[];
}

export interface SubCategory {
  SubCategoryId: number;
  CategoryId: number;
  SubCategoryName: string;
  CategoryName?: string;
}

export interface InventorySubCategory {
  InventorySubCategoryId: number;
  SubCategoryId: number;
  SubCategoryName: string;
  CategoryId: number;
  CategoryName?: string;
}

export interface Unit {
  UnitId: number;
  UnitName: string;
}

export interface Inventory {
  ItemId: number;
  /** Pasif / arşiv (soft delete). Doluysa ürün varsayılan listede görünmez. */
  DeletedAt?: string | null;
  deletedAt?: string | null;
  IsArchived?: boolean;
  isArchived?: boolean;
  ItemCode?: string;
  ItemName: string;
  ItemNameEn?: string | null;
  TotalStock: number;
  OnRent: number;
  DailyPrice: number;
  DailyPriceEur?: number | null;
  DailyPriceUsd?: number | null;
  PurchasePrice: number;
  MonthlyListPrice?: number;
  UnitPrice?: number;
  MonthlyListPriceEur?: number;
  UnitPriceEur?: number;
  MonthlyListPriceUsd?: number | null;
  UnitPriceUsd?: number | null;
  Weight?: number | null;
  UnitId?: number | null;
  UnitName?: string | null;
  Categories?: MaterialCategory[];
  SubCategories?: SubCategory[];
  /** Lean liste DTO — GET /inventory */
  CategoryIds?: number[];
  SubCategoryIds?: number[];
  CreatedAt?: string;
  CreatedByUserFullName?: string;
  CreatedByUserName?: string;
  LastModifiedAt?: string | null;
  LastModifiedByUserFullName?: string | null;
  LastModifiedByUserName?: string | null;
  PriceTiers?: PriceTier[];
  ContractDetails?: ContractDetail[];
}

/** Pasif / arşivlenmiş ürün (DeletedAt dolu veya IsArchived). */
export function pickInventoryDeletedAt(
  item: Pick<Inventory, 'DeletedAt' | 'deletedAt'>
): string | null | undefined {
  return item.DeletedAt ?? item.deletedAt;
}

export function isInventoryArchived(
  item: Pick<Inventory, 'DeletedAt' | 'deletedAt' | 'IsArchived' | 'isArchived'>
): boolean {
  if (item.IsArchived === true || item.isArchived === true) return true;
  const v = pickInventoryDeletedAt(item);
  return v != null && String(v).trim() !== '';
}

// Inventory - Item Movements (GET /inventory/:itemId/movements)
export interface InventoryItemMovementItemInfo {
  ItemId: number;
  ItemName: string;
  ItemCode?: string | null;
}

export interface InventoryItemMovementFilters {
  warehouseId?: number | null;
  dateFrom?: string | null; // YYYY-MM-DD or ISO 8601
  dateTo?: string | null; // YYYY-MM-DD or ISO 8601
  includeCompleted?: boolean | null;
}

export interface InventoryItemMovementContractCustomer {
  CustomerId: number;
  CustomerName: string;
}

export interface InventoryItemMovementContractSite {
  SiteId: number;
  SiteName: string;
}

export interface InventoryItemMovementDispatch {
  detailId: number;
  sourceWarehouseId: number;
  sourceWarehouseName: string;
  dispatchDate: string; // ISO 8601
  plannedEndDate?: string | null; // ISO 8601
  actualEndDate?: string | null; // ISO 8601
  rentedQuantity: number;
}

export interface InventoryItemMovementReturn {
  ReturnId: number;
  ReturnDate: string; // ISO 8601
  ReturnQuantity: number;
  returnWarehouseId?: number | null;
  returnWarehouseName?: string | null;
  LateDays?: number | null;
  LateFee?: number | null;
}

export interface InventoryItemMovementTotals {
  rented: number;
  returned: number;
  stillOut: number;
}

export interface InventoryItemMovementContractRow {
  ContractId: number;
  ContractCode?: string | null;
  Type?: ContractQuoteType | string | null;
  customer: InventoryItemMovementContractCustomer;
  site?: InventoryItemMovementContractSite | null;
  dispatch: InventoryItemMovementDispatch;
  returns: InventoryItemMovementReturn[];
  totals: InventoryItemMovementTotals;
  isCompleted: boolean;
}

export interface InventoryItemMovementSummary {
  totalContracts: number;
  totalDispatched: number;
  totalReturned: number;
  currentlyOnRent: number;
}

export interface InventoryItemMovementsResponse {
  item: InventoryItemMovementItemInfo;
  filters: InventoryItemMovementFilters;
  contracts: InventoryItemMovementContractRow[];
  summary: InventoryItemMovementSummary;
}

export type CurrencyCode = 'TRY' | 'EUR' | 'USD';

/** Teklif / sözleşme tipi (backend `Type`: RENTAL | SALE) */
export type ContractQuoteType = 'RENTAL' | 'SALE';

/** Kalem fiyat birimi (backend: DAY | EACH) */
export type PriceUnit = 'DAY' | 'EACH';

/** Fiyatın kaynağı (backend: INVENTORY | OVERRIDE | MANUAL) */
export type PriceSource = 'INVENTORY' | 'OVERRIDE' | 'MANUAL';

export function normalizeContractQuoteType(v: unknown): ContractQuoteType {
  const s = typeof v === 'string' ? v.toUpperCase() : '';
  return s === 'SALE' ? 'SALE' : 'RENTAL';
}

/** Liste/detay yanıtında PascalCase `Type` veya camelCase `type` gelebilir (ör. ASP.NET JSON). */
export function resolveContractQuoteType(row: unknown): ContractQuoteType {
  if (!row || typeof row !== 'object') return 'RENTAL';
  const o = row as Record<string, unknown>;
  return normalizeContractQuoteType(o.Type ?? o.type);
}

/** Alan yoksa veya boşsa `undefined` — UI state fallback için. */
export function tryResolveContractQuoteType(row: unknown): ContractQuoteType | undefined {
  if (!row || typeof row !== 'object') return undefined;
  const o = row as Record<string, unknown>;
  const raw = o.Type ?? o.type;
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
    return undefined;
  }
  return normalizeContractQuoteType(raw);
}

// Çek (Check) Modelleri
export type CheckStatus = 'PORTFOLIO' | 'CASHED' | 'RETURNED' | 'CANCELLED';

export interface Check {
  CheckId?: number;
  CustomerId?: number;
  CustomerName?: string;
  BankName: string;
  BranchName?: string;
  AccountNumber?: string;
  CheckNumber: string;
  Amount: number;
  Currency?: CurrencyCode;
  IssueDate: string;
  DueDate: string;
  Status?: CheckStatus;
  StatusLabel?: string;
  OwnerName?: string;
  Notes?: string;
  CreatedAt?: string;
  UpdatedAt?: string;
}

export interface CheckFilters {
  customerId?: number;
  status?: CheckStatus;
  dateFrom?: string;
  dateTo?: string;
}

export interface Contract {
  ContractId: number;
  ContractCode?: string;
  CustomerId: number;
  CustomerAuthorizedContactId?: number | null;
  SiteId?: number; // Şantiye ID (opsiyonel)
  StartDate: string; // ISO 8601 format
  /** Kiralama için dolu; satış sözleşmesinde backend null döner. */
  PlannedEndDate: string | null; // ISO 8601 format
  ActualEndDate?: string; // ISO 8601 format
  InitialTotalPrice: number;
  FinalCalculatedPrice?: number;
  NetTotal?: number;
  Iskonto?: number;  // yüzde
  VatRate?: number;  // yüzde
  Currency?: CurrencyCode;
  Type?: ContractQuoteType;
  /** Dil seçeneği (TR/EN) */
  Language?: 'TR' | 'EN';
  /** Liste yanıtında API'den (GET /contracts) */
  CustomerName?: string;
  IsCompleted: boolean;
  /** API bazen lifecycle status döner: active | completed | cancelled */
  Status?: string;
  status?: string;
  /** İptal zamanı (POST /contracts/:id/cancel). Doluysa sözleşme iptal edilmiştir. */
  CancelledAt?: string | null;
  /** İptal gerekçesi */
  CancellationReason?: string | null;
  /** Arşiv zamanı (POST /contracts/:id/archive). Doluysa varsayılan listede görünmez. */
  ArchivedAt?: string | null;
  archivedAt?: string | null;
  ArchivedByUserId?: number | null;
  ArchiveReason?: string | null;
  /** @deprecated Eski API — ArchivedAt kullanın */
  DeletedAt?: string | null;
  deletedAt?: string | null;
  CreatedAt?: string;
  CreatedByUserFullName?: string;
  CreatedByUserName?: string;
  LastModifiedAt?: string | null;
  LastModifiedByUserFullName?: string | null;
  LastModifiedByUserName?: string | null;
  Customer?: Customer;
  Site?: ConstructionSite; // Şantiye bilgisi
  ContractDetails?: ContractDetail[];
  /** Kaynak teklif (dönüşümle oluşan sözleşmelerde); manuel sözleşmede null */
  SourceQuoteId?: number | null;
  SourceQuoteCode?: string | null;
}

export interface ContractDetail {
  DetailId: number;
  ContractId: number;
  ItemId: number;
  WarehouseId?: number;
  RentedQuantity: number;
  ReturnedQuantity: number;
  /** Hesaplamada kullanılan snapshot birim fiyat (DAY/EACH ile birlikte) */
  UnitPriceSnapshot: number;
  PriceUnit: PriceUnit;
  /** Sadece RENTAL: kullanıcının girdiği aylık override (varsa) */
  MonthlyPriceOverride?: number | null;
  PriceSource: PriceSource;
  /** Kiralama sözleşmesinde satır bazlı ücret başlangıç tarihi (ISO 8601) */
  EffectiveStartDate?: string;
  /** listContractDetails: override varsa override, yoksa orijinal kod */
  ItemCode?: string;
  /** Satır bazlı ürün kodu override (envanter satırları için). */
  ItemCodeOverride?: string | null;
  Contract?: Contract;
  Item?: Inventory;
}

export interface PriceTier {
  TierId: number;
  ItemId: number;
  MinDays: number;
  MaxDays: number;
  PriceMultiplier: number;
  Item?: Inventory;
}

export enum PricingRuleType {
  EarlyReturnMultiplier = 1,
  LateReturnPenalty = 2,
  BulkDiscount = 3,
  LongTermDiscount = 4,
  MinimumRentalFee = 5,
}

export interface PricingRule {
  RuleId: number;
  RuleName: string;
  RuleType: PricingRuleType;
  Value: number;
  MinDays?: number;
  MaxDays?: number;
  MinQuantity?: number;
  IsActive: boolean;
  Description?: string;
  CreatedAt: string; // ISO 8601 format
}

// DTO Models
export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginUserDto {
  userId: number;
  username: string;
  fullName?: string;
  email?: string;
  roleId?: number;
  roleName?: string;
  /** Backend tarafında alternatif alan adlarıyla gelebilir (örn. JWT payload). */
  role?: string;
  permissions: string[];
}

export interface LoginResponse {
  accessToken: string;
  user: LoginUserDto;
}

// Kullanıcı (liste/detay) - GET /users, GET /users/:id
export interface User {
  UserId: number;
  Username: string;
  FullName: string;
  Email?: string;
  RoleId?: number;
  IsActive: boolean;
  CreatedAt?: string;
  LastLoginAt?: string;
  Permissions: string[];
}

// GET /permissions yanıtı
export interface PermissionDefinition {
  key: string;
  displayName: string;
  description?: string;
}

export interface PermissionCategory {
  key: string;
  displayName: string;
  permissions: PermissionDefinition[];
}

export interface PermissionsResponse {
  categories: PermissionCategory[];
}

// Audit Log - GET /audit-logs
export enum AuditAction {
  Create = 0,
  Update = 1,
  Delete = 2,
}

export interface AuditLog {
  LogId: number;
  UserId: number;
  TableName: string;
  RecordId: number;
  Action: AuditAction;
  OldValues?: string | null;
  NewValues?: string | null;
  ChangedColumns?: string | null;
  Timestamp: string;
  IpAddress?: string | null;
  UserAgent?: string | null;
  UserName?: string | null;
  UserFullName?: string | null;
}

export enum PriceBreakdownType {
  BasePrice = 0,
  TierMultiplier = 1,
  EarlyReturnAdjustment = 2,
  LateReturnPenalty = 3,
  BulkDiscount = 4,
  LongTermDiscount = 5,
  MinimumFee = 6,
}

export interface PriceBreakdownItem {
  Description: string;
  Amount: number;
  Type: PriceBreakdownType;
}

export interface PriceCalculationResult {
  BasePrice: number;
  DiscountAmount: number;
  PenaltyAmount: number;
  FinalPrice: number;
  TotalDays: number;
  PlannedDays: number;
  DaysDifference: number;
  IsEarlyReturn: boolean;
  IsLateReturn: boolean;
  Breakdown: PriceBreakdownItem[];
  CalculatedAt: string; // ISO 8601 format
}

// ViewModel Helper Classes
export enum AlertType {
  Warning = 0,
  Critical = 1,
  Overdue = 2,
}

export interface ContractAlert {
  Contract: Contract;
  DaysRemaining: number;
  AlertType: AlertType;
  AlertMessage: string;
}

export interface ContractDetailItem {
  DetailId: number;
  Item?: Inventory;
  ItemId: number;
  WarehouseId: number;
  WarehouseName?: string;
  RentedQuantity: number;
  ReturnedQuantity: number;
  UnitPriceSnapshot: number;
  PriceUnit: PriceUnit;
  MonthlyPriceOverride?: number | null;
  PriceSource: PriceSource;
  ItemName: string;
  ItemNameEn?: string | null;
  /** listContractDetails: override varsa override, yoksa orijinal kod */
  ItemCode?: string;
  ItemCodeOverride?: string | null;
}

// Manuel kalem destekli satır tipleri (UI için)
export type ContractLineItem = InventoryContractLineItem | ManualContractLineItem;

export interface InventoryContractLineItem {
  kind: 'inventory';
  DetailId: number;
  Item?: Inventory;
  ItemId: number;
  WarehouseId: number;
  WarehouseName?: string;
  RentedQuantity: number;
  ReturnedQuantity: number;
  UnitPriceSnapshot: number;
  PriceUnit: PriceUnit;
  MonthlyPriceOverride?: number | null;
  PriceSource: PriceSource;
  /** Backend'den gelirse UI'da gösterilir (ISO 8601) */
  EffectiveStartDate?: string;
  ItemName: string;
  ItemNameEn?: string | null;
  /** Backend'den gelen çözümlenmiş kod (override dahil) */
  ItemCode?: string;
  /** UI state: satır bazlı ürün kodu override */
  ItemCodeOverride?: string | null;
}

export interface ManualContractLineItem {
  kind: 'manual';
  /** UI için benzersiz anahtar (backend DetailId yoksa) */
  ClientId: string;
  DetailId?: number;
  IsManual: true;
  Description: string;
  RentedQuantity: number;
  UnitPriceSnapshot: number;
  PriceUnit: PriceUnit;
  PriceSource: PriceSource;
}

export interface PricingRuleTypeItem {
  Type: PricingRuleType;
  Name: string;
  Description: string;
}

// Sözleşme İade Response
export interface ReturnItemResponse {
  DetailId: number;
  RentedQuantity: number;
  ReturnedQuantity: number;
  RemainingOnRent: number;
  ReturnDate: string;
  LateDays: number;
  LateFee: number;
  WarehouseId: number;
  ContractCompleted: boolean;
}

// Sözleşme İade Geçmişi
export interface ContractReturn {
  ReturnId: number;
  ContractId: number;
  ItemId: number;
  ItemName: string;
  WarehouseId?: number;
  WarehouseName?: string;
  ReturnQuantity: number;
  ReturnDate: string;
  LateDays: number;
  LateFee: number;
  CreatedAt: string;
  IsNonPhysicalSettlement?: boolean;
  SettlementReason?: string | null;
  SettlementCharge?: number;
  InventoryUnitPriceSnapshot?: number | null;
  PriceBasis?: string | null;
}

export interface SettleNonReturnRequest {
  itemId: number;
  returnQuantity: number;
  settlementReason: 'SALE' | 'DEFECT';
  priceBasis: 'TRY' | 'USD' | 'EUR';
  warehouseId?: number;
  settlementChargeOverride?: number | string;
}

// Sözleşme Fiyat Hesaplama
export interface ContractPriceCalculation {
  contractId: number;
  plannedDays: number;
  basePrice: number;
  totalLateFee: number;
  finalPrice: number;
  returns: {
    ReturnId: number;
    ItemId: number;
    ReturnQuantity: number;
    ReturnDate: string;
    LateDays: number;
    LateFee: number;
  }[];
}

// Alış Faturası
export interface PurchaseInvoice {
  InvoiceId: number;
  InvoiceDate: string; // ISO 8601 format
  EntryDate: string; // ISO 8601 format
  CustomerId: number;
  CustomerName?: string; // GET'te döner
  Description?: string;
  Subtotal: number;
  VatAmount: number;
  TotalAmount: number;
  Iskonto?: number;  // yüzde
  VatRate?: number;  // yüzde
  DocumentNo?: string;
  ItemId?: number;
  ItemName?: string;
  WarehouseId?: number;
  WarehouseName?: string;
  Quantity?: number;
  Currency?: string;
  ExchangeRate?: number;
  CreatedAt?: string;
  CreatedByUserFullName?: string;
  CreatedByUserName?: string;
  LastModifiedAt?: string | null;
  LastModifiedByUserFullName?: string | null;
  LastModifiedByUserName?: string | null;
  Customer?: Customer;
}

// Depo Yönetimi
export interface Warehouse {
  WarehouseId: number;
  WarehouseName: string;
  Address?: string;
  Description?: string;
  /** Pasif / arşiv (soft delete). Doluysa depo varsayılan listede görünmez. */
  DeletedAt?: string | null;
  deletedAt?: string | null;
  UniqueItems: number;     // Benzersiz ürün sayısı
  TotalQuantity: number;   // Toplam stok miktarı
  CreatedAt?: string;
  CreatedByUserFullName?: string;
  CreatedByUserName?: string;
  LastModifiedAt?: string | null;
  LastModifiedByUserFullName?: string | null;
  LastModifiedByUserName?: string | null;
}

/** Silinmiş / pasif depo (DeletedAt dolu). */
export function pickWarehouseDeletedAt(
  w: Pick<Warehouse, 'DeletedAt' | 'deletedAt'>
): string | null | undefined {
  return w.DeletedAt ?? w.deletedAt;
}

export function isWarehouseArchived(w: Pick<Warehouse, 'DeletedAt' | 'deletedAt'>): boolean {
  const v = pickWarehouseDeletedAt(w);
  return v != null && String(v).trim() !== '';
}

export function filterActiveWarehouses(warehouses: Warehouse[]): Warehouse[] {
  return warehouses.filter((w) => !isWarehouseArchived(w));
}

/** Backend warehouse API hata kodları */
export type WarehouseApiErrorCode =
  | 'WAREHOUSE_HAS_STOCK'
  | 'WAREHOUSE_HAS_ACTIVE_RENTALS'
  | 'WAREHOUSE_IN_USE'
  | 'WAREHOUSE_INACTIVE';

export interface ApiErrorResponse {
  message: string;
  code?: WarehouseApiErrorCode | string;
}

export interface WarehouseStock {
  StockId: number;
  WarehouseId: number;
  ItemId: number;
  Quantity: number;
  ItemName: string;
  CategoryId: number;
  CategoryName?: string;
  IsArchived?: boolean;
  isArchived?: boolean;
}

export interface WarehouseStockResponse {
  warehouse: Warehouse;
  stock: WarehouseStock[];
}

// Warehouse Movements (GET /warehouses/:warehouseId/movements)
export interface WarehouseMovementWarehouseInfo {
  WarehouseId: number;
  WarehouseName: string;
  Address?: string | null;
}

export interface WarehouseMovementFilters {
  itemId?: number | null;
  dateFrom?: string | null; // YYYY-MM-DD or ISO 8601
  dateTo?: string | null; // YYYY-MM-DD or ISO 8601
  includeCompleted?: boolean | null;
}

export interface WarehouseMovementItemInfo {
  ItemId: number;
  ItemName: string;
  ItemCode?: string | null;
}

export interface WarehouseMovementContractInfo {
  ContractId: number;
  ContractCode?: string | null;
  Type?: ContractQuoteType | string | null;
  isCompleted: boolean;
}

export interface WarehouseMovementCustomerInfo {
  CustomerId: number;
  CustomerName: string;
}

export interface WarehouseMovementSiteInfo {
  SiteId: number;
  SiteName: string;
}

export interface WarehouseMovementDispatchInfo {
  dispatchDate: string; // ISO 8601
  plannedEndDate?: string | null; // ISO 8601
  actualEndDate?: string | null; // ISO 8601
  rentedQuantity: number;
}

export interface WarehouseMovementReturnInfo {
  ReturnId: number;
  ReturnDate: string; // ISO 8601
  ReturnQuantity: number;
  returnWarehouseId?: number | null;
  returnWarehouseName?: string | null;
  LateDays?: number | null;
  LateFee?: number | null;
}

export interface WarehouseMovementTotals {
  rented: number;
  returned: number;
  stillOut: number;
}

export interface WarehouseMovementRow {
  detailId: number;
  item: WarehouseMovementItemInfo;
  contract: WarehouseMovementContractInfo;
  customer: WarehouseMovementCustomerInfo;
  site?: WarehouseMovementSiteInfo | null;
  dispatch: WarehouseMovementDispatchInfo;
  returns: WarehouseMovementReturnInfo[];
  totals: WarehouseMovementTotals;
}

export interface WarehouseMovementsSummary {
  totalMovements: number;
  uniqueItems: number;
  uniqueCustomers: number;
  totalDispatched: number;
  totalReturned: number;
  currentlyOut: number;
}

export interface WarehouseMovementsResponse {
  warehouse: WarehouseMovementWarehouseInfo;
  filters: WarehouseMovementFilters;
  movements: WarehouseMovementRow[];
  summary: WarehouseMovementsSummary;
}

// Teklif (Quote) Modelleri
export enum QuoteStatus {
  Draft = 'draft',
  Pending = 'pending',
  Accepted = 'accepted',
  Rejected = 'rejected',
}

export interface Quote {
  QuoteId: number;
  QuoteCode?: string;
  /** Teklif konusu (backend: Subject, nullable, max 255) */
  Subject?: string | null;
  CustomerId: number | null;
  CustomerAuthorizedContactId?: number | null;
  SiteId?: number;
  /** Kiralama: ISO 8601; gün-only teklifte API null dönebilir */
  StartDate?: string | null;
  /** Kiralama için dolu; satış teklifinde API boş dönebilir; gün-only teklifte null olabilir */
  PlannedEndDate?: string | null;
  /** Kiralama (RENTAL): teklif süresi gün; GET listesi/detay */
  RentalDurationDays?: number | null;
  TotalPrice: number;
  NetTotal?: number;
  Status: QuoteStatus;
  Notes?: string;
  Iskonto?: number;  // yüzde
  VatRate?: number;  // yüzde
  Currency?: CurrencyCode;
  Type?: ContractQuoteType;
  /** Dil seçeneği (TR/EN) */
  Language?: 'TR' | 'EN';
  CreatedAt: string; // ISO 8601 format
  UpdatedAt: string; // ISO 8601 format
  ConvertedContractId?: number;
  ConvertedAt?: string | null;
  /** API flag; yoksa ConvertedContractId ile türetilir */
  IsConverted?: boolean;
  /** Red gerekçesi (Status === rejected) */
  RejectionReason?: string | null;
  CustomerName?: string;
  Customer?: Customer;
  Site?: ConstructionSite;
  QuoteDetails?: QuoteDetail[];
}

export const isContractCancelled = (
  c: Pick<Contract, 'CancelledAt'> & { cancelledAt?: string | null }
): boolean => {
  const v = c.CancelledAt ?? c.cancelledAt;
  if (v == null) return false;
  const s = String(v).trim();
  return s !== '' && s.toLowerCase() !== 'null';
};

function parseContractLifecycleStatus(
  c: Pick<Contract, 'IsCompleted' | 'CancelledAt'> & {
    Status?: string;
    status?: string;
  }
): 'active' | 'completed' | 'cancelled' | null {
  const raw = c.Status ?? c.status;
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  if (s === 'completed' || s === 'complete') return 'completed';
  if (s === 'active') return 'active';
  return null;
}

function hasContractActualEndDate(
  c: Pick<Contract, 'ActualEndDate'> & { actualEndDate?: string | null }
): boolean {
  const v = c.ActualEndDate ?? c.actualEndDate;
  if (v == null) return false;
  const s = String(v).trim();
  return s !== '' && s.toLowerCase() !== 'null';
}

function normalizeContractIsCompleted(
  c: Pick<Contract, 'IsCompleted'> & {
    isCompleted?: boolean | string | number | null;
    Status?: string;
    status?: string;
  }
): boolean {
  const lifecycle = parseContractLifecycleStatus(c);
  if (lifecycle === 'completed') return true;
  if (lifecycle === 'active' || lifecycle === 'cancelled') return false;

  const v: unknown = c.IsCompleted ?? c.isCompleted;
  if (v === true) return true;
  if (v === false || v == null) return false;
  if (typeof v === 'number') return v === 1;
  if (typeof v === 'string') {
    const lower = v.trim().toLowerCase();
    if (lower === 'true' || lower === '1') return true;
    if (lower === 'false' || lower === '0' || lower === '') return false;
  }
  return false;
}

export const isContractCompleted = (
  c: Pick<Contract, 'IsCompleted' | 'ActualEndDate' | 'CancelledAt'> & {
    isCompleted?: boolean | string | number | null;
    actualEndDate?: string | null;
    Status?: string;
    status?: string;
  }
): boolean => {
  if (isContractCancelled(c)) return false;
  if (normalizeContractIsCompleted(c)) return true;
  return hasContractActualEndDate(c);
};

export const isContractActive = (
  c: Pick<Contract, 'IsCompleted' | 'CancelledAt' | 'ArchivedAt' | 'DeletedAt' | 'ActualEndDate'> & {
    isCompleted?: boolean | string | number | null;
    cancelledAt?: string | null;
    archivedAt?: string | null;
    deletedAt?: string | null;
    actualEndDate?: string | null;
    Status?: string;
    status?: string;
  }
): boolean => {
  if (isContractArchived(c)) return false;
  if (isContractCancelled(c)) return false;
  const lifecycle = parseContractLifecycleStatus(c);
  if (lifecycle === 'cancelled' || lifecycle === 'completed') return false;
  if (lifecycle === 'active') return true;
  return !isContractCompleted(c);
};

export type ContractStatusFilter = 'active' | 'completed' | 'cancelled' | 'archived';
export type ContractUiStatus = ContractStatusFilter;

export const getContractUiStatus = (
  c: Pick<Contract, 'IsCompleted' | 'CancelledAt' | 'ArchivedAt' | 'DeletedAt' | 'ActualEndDate'> & {
    isCompleted?: boolean | string | number | null;
    cancelledAt?: string | null;
    archivedAt?: string | null;
    deletedAt?: string | null;
    actualEndDate?: string | null;
    Status?: string;
    status?: string;
  }
): ContractUiStatus => {
  if (isContractArchived(c)) return 'archived';
  if (isContractCancelled(c)) return 'cancelled';
  if (isContractCompleted(c)) return 'completed';
  return 'active';
};

/** Tamamlanan veya iptal edilmiş; arşivlenebilir (aktif veya zaten arşivlenmiş değil). */
export const isContractArchivable = (
  c: Parameters<typeof getContractUiStatus>[0]
): boolean => {
  const status = getContractUiStatus(c);
  return status === 'completed' || status === 'cancelled';
};

export function pickContractDeletedAt(
  c: Pick<Contract, 'DeletedAt' | 'deletedAt'>
): string | null | undefined {
  return c.DeletedAt ?? c.deletedAt;
}

export function pickContractArchivedAt(
  c: Pick<Contract, 'ArchivedAt' | 'archivedAt' | 'DeletedAt' | 'deletedAt'>
): string | null | undefined {
  const archived = c.ArchivedAt ?? c.archivedAt;
  if (archived != null) {
    const s = String(archived).trim();
    if (s !== '' && s.toLowerCase() !== 'null') return archived;
  }
  return pickContractDeletedAt(c);
}

export function isContractArchived(
  c: Pick<Contract, 'ArchivedAt' | 'archivedAt' | 'DeletedAt' | 'deletedAt'>
): boolean {
  const v = pickContractArchivedAt(c);
  if (v == null) return false;
  const s = String(v).trim();
  return s !== '' && s.toLowerCase() !== 'null';
}

export const isQuoteConverted = (
  q: Pick<Quote, 'ConvertedContractId' | 'IsConverted'>
): boolean => q.IsConverted === true || q.ConvertedContractId != null;

export interface QuotePackage {
  PackageId: string | number;
  PackageName: string;
  Description?: string;
  DefaultDiscount?: number;
  CreatedAt?: string;
  UpdatedAt?: string;
}

export interface QuotePackageItem {
  ProductId?: number;
  ItemId?: number;
  ItemName?: string;
  Quantity: number;
}

export interface QuotePackageDetail extends QuotePackage {
  items?: QuotePackageItem[];
  Items?: QuotePackageItem[];
}

export interface QuoteDetail {
  QuoteDetailId: number;
  QuoteId: number;
  ItemId: number;
  Quantity: number;
  UnitPriceSnapshot: number;
  PriceUnit: PriceUnit;
  MonthlyPriceOverride?: number | null;
  PriceSource: PriceSource;
  ItemName?: string;
  /** Satır bazlı ürün adı override (envanter satırları için). */
  ItemNameOverride?: string | null;
  /** listQuoteDetails: override varsa override, yoksa orijinal kod */
  ItemCode?: string;
  /** Satır bazlı ürün kodu override (envanter satırları için). */
  ItemCodeOverride?: string | null;
  ItemNameEn?: string | null;
  CategoryId?: number;
}

// Teklif Detay Item (UI için)
export interface QuoteDetailItem {
  QuoteDetailId: number;
  Item?: Inventory;
  ItemId: number;
  Quantity: number;
  UnitPriceSnapshot: number;
  PriceUnit: PriceUnit;
  MonthlyPriceOverride?: number | null;
  PriceSource: PriceSource;
  ItemName: string;
  ItemNameOverride?: string | null;
  ItemCode?: string;
  ItemCodeOverride?: string | null;
  ItemNameEn?: string | null;
}

export type QuoteLineItem = InventoryQuoteLineItem | ManualQuoteLineItem;

export interface InventoryQuoteLineItem {
  kind: 'inventory';
  QuoteDetailId: number;
  Item?: Inventory;
  ItemId: number;
  Quantity: number;
  UnitPriceSnapshot: number;
  PriceUnit: PriceUnit;
  MonthlyPriceOverride?: number | null;
  PriceSource: PriceSource;
  /** UI state: SALE için birim fiyat override */
  OverrideUnitPrice?: number;
  /** UI state: RENTAL için aylık fiyat override */
  OverrideMonthlyPrice?: number;
  ItemName: string;
  /** UI state: satır bazlı ürün adı override */
  ItemNameOverride?: string | null;
  /** Backend'den gelen çözümlenmiş kod (override dahil) */
  ItemCode?: string;
  /** UI state: satır bazlı ürün kodu override */
  ItemCodeOverride?: string | null;
  ItemNameEn?: string | null;
}

export interface ManualQuoteLineItem {
  kind: 'manual';
  /** UI için benzersiz anahtar (backend QuoteDetailId yoksa) */
  ClientId: string;
  QuoteDetailId?: number;
  is_manual: true;
  Description: string;
  Quantity: number;
  UnitPriceSnapshot: number;
  PriceUnit: PriceUnit;
  PriceSource: PriceSource;
}

// Sözleşme Şablon Modelleri
export interface ContractTemplate {
  TemplateId: number;
  UserId: number;
  TemplateName: string;
  Content: any; // TipTap JSON formatı
  IsDefault: boolean;
  CreatedAt: string;
  UpdatedAt: string;
}

// Teklif Şablon Modelleri
export interface QuoteTemplate {
  TemplateId: number;
  UserId: number;
  TemplateName: string;
  Content: any; // TipTap JSON formatı
  IsDefault: boolean;
  CreatedAt: string;
  UpdatedAt: string;
}

// Rapor Şablon Modelleri
export interface ReportTemplate {
  TemplateId: number;
  UserId: number;
  TemplateName: string;
  Content: any; // TipTap JSON formatı
  IsDefault: boolean;
  CreatedAt: string;
  UpdatedAt: string;
}

export interface TemplateImage {
  ImageId: number;
  UserId: number;
  FileName: string;
  MimeType: string;
  FileSize: number;
  CreatedAt: string;
}

export interface ImageUsageStats {
  imageCount: number;
  totalSize: number;
  maxSize: number;
  remainingSize: number;
  usagePercent: number;
}

// Rental Movement Report (reports_view)
export interface RentalMovementItem {
  product_id: number;
  product_name: string;
  dispatched: number;
  returned: number;
  current_on_site: number;
}

export interface RentalMovementSummaryCustomer {
  customer_name: string;
  total_active_contracts: number;
}

export interface RentalMovementSummarySite {
  site_name: string;
  customer_name: string;
  total_active_contracts: number;
}

export interface RentalMovementSummaryGlobal {
  total_customers: number;
  total_contracts: number;
  total_active_contracts: number;
}

export type RentalMovementSummary =
  | RentalMovementSummaryCustomer
  | RentalMovementSummarySite
  | RentalMovementSummaryGlobal;

export interface RentalMovementReportResponse {
  summary: RentalMovementSummary;
  items: RentalMovementItem[];
}

// Stok Fişleri (stock-receipts)
export type ReceiptType = 'IN' | 'OUT' | 'CONSUMPTION' | 'TRANSFER';
export type StockReceiptStatus = 'ACTIVE' | 'CANCELLED';

export interface StockReceipt {
  ReceiptId: string;
  ReceiptNo: string;
  ReceiptType: ReceiptType;
  WarehouseId: number;
  TargetWarehouseId?: number | null;
  Description?: string | null;
  Status: StockReceiptStatus;
  CreatedBy?: number | null;
  CreatedAt?: string | null;
  UpdatedAt?: string | null;
  WarehouseName?: string | null;
  TargetWarehouseName?: string | null;
  CreatedByName?: string | null;
  ItemCount?: number | null;
}

export interface StockReceiptItem {
  ItemLineId: string;
  ReceiptId: string;
  ItemId?: number | null;
  ItemName?: string | null;
  Quantity: number;
  IsManual?: boolean;
  Description?: string | null;
}

export interface StockReceiptDetail extends StockReceipt {
  items: StockReceiptItem[];
}

export interface CreateStockReceiptItemRequest {
  ItemId: number;
  Quantity: number;
  Description?: string;
}

export interface CreateStockReceiptRequest {
  ReceiptType: ReceiptType;
  WarehouseId: number;
  TargetWarehouseId?: number | null;
  Description?: string | null;
  items: CreateStockReceiptItemRequest[];
}

export interface CashAccount {
  id: string;
  name: string;
  type: 'CASH' | 'BANK';
  currency: 'TRY' | 'USD' | 'EUR' | 'GBP';
  branch_name: string | null;
  account_no: string | null;
  current_balance: number;
  allow_negative_balance: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CashTransaction {
  id: string;
  receipt_no: string;
  cash_account_id: string;
  target_account_id: string | null;
  type:
    | 'TAHSILAT'
    | 'ODEME'
    | 'VIRMAN'
    | 'MASRAF'
    | 'GELIR'
    | 'DOVIZ_TAKAS';
  status: 'DRAFT' | 'APPROVED' | 'CANCELLED';
  amount: number;
  exchange_rate: number;
  related_entity_type: 'CUSTOMER' | 'SUPPLIER' | 'STAFF' | 'OTHER' | null;
  related_entity_id: string | number | null;
  customer_name: string | null;
  transaction_date: string;
  description: string | null;
  receipt_pdf_path: string | null;
  cancelled_by_transaction_id: string | null;
  cancels_transaction_id: string | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateCashTransactionDto {
  cash_account_id: string;
  type: CashTransaction['type'];
  amount: number;
  target_account_id?: string;
  exchange_rate?: number;
  related_entity_type?: CashTransaction['related_entity_type'];
  related_entity_id?: string | number;
  transaction_date?: string;
  description?: string;
}

export interface ListTransactionsParams {
  cash_account_id?: string;
  status?: CashTransaction['status'];
  type?: CashTransaction['type'];
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface ListTransactionsResponse {
  items: CashTransaction[];
  total: number;
  limit: number;
  offset: number;
}

// --- Sözleşme Zeyilname (Ek Protokol) ---

export type AddendumStatus = 'draft' | 'pending' | 'approved' | 'rejected';

export type ChangeType = 'ADD' | 'INCREASE' | 'DECREASE' | 'PRICE_CHANGE';

export interface AddendumDetail {
  DetailId: number;
  AddendumId: number;
  ChangeType: ChangeType;
  ContractDetailId?: number | null;
  ItemId?: number | null;
  WarehouseId?: number | null;
  IsManual?: boolean;
  Description?: string | null;
  QuantityChange?: number | null;
  NewUnitPrice?: number | null;
  NewMonthlyOverride?: number | null;
  /** Liste/detay zenginleştirmeleri (backend opsiyonel) */
  ItemName?: string | null;
  ItemCode?: string | null;
  WarehouseName?: string | null;
  ContractDetailDescription?: string | null;
}

export interface Addendum {
  AddendumId: number;
  ContractId: number;
  AddendumNo?: number | null;
  AddendumCode?: string | null;
  Status: AddendumStatus;
  EffectiveDate: string;
  Reason?: string | null;
  RejectionReason?: string | null;
  CreatedAt?: string;
  UpdatedAt?: string;
  SubmittedAt?: string | null;
  ApprovedAt?: string | null;
  RejectedAt?: string | null;
  CreatedByUserId?: number | null;
  CreatedByName?: string | null;
  ApprovedByUserId?: number | null;
  ApprovedByName?: string | null;
  RejectedByUserId?: number | null;
  RejectedByName?: string | null;
  details?: AddendumDetail[];
  Details?: AddendumDetail[];
}
