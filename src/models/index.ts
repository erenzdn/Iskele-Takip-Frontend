// Entity Models
export interface Customer {
  CustomerId: number;
  Name: string;
  TaxId?: string;
  TaxOffice?: string;
  PhoneNumber?: string;
  Email?: string;
  Address?: string;
  CenterAuthorizedPerson?: string;
  CenterAuthorizedPhone?: string;
  CreatedAt?: string;
  CreatedByUserFullName?: string;
  CreatedByUserName?: string;
  LastModifiedAt?: string | null;
  LastModifiedByUserFullName?: string | null;
  LastModifiedByUserName?: string | null;
  Contracts?: Contract[];
  Sites?: ConstructionSite[];
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

export interface Inventory {
  ItemId: number;
  ItemCode?: string;
  ItemName: string;
  TotalStock: number;
  OnRent: number;
  DailyPrice: number;
  PurchasePrice: number;
  MonthlyListPrice?: number;
  UnitPrice?: number;
  MonthlyListPriceEur?: number;
  UnitPriceEur?: number;
  Categories?: MaterialCategory[];
  SubCategories?: SubCategory[];
  CreatedAt?: string;
  CreatedByUserFullName?: string;
  CreatedByUserName?: string;
  LastModifiedAt?: string | null;
  LastModifiedByUserFullName?: string | null;
  LastModifiedByUserName?: string | null;
  PriceTiers?: PriceTier[];
  ContractDetails?: ContractDetail[];
}

export type CurrencyCode = 'TRY' | 'EUR';

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
  SiteId?: number; // Şantiye ID (opsiyonel)
  StartDate: string; // ISO 8601 format
  PlannedEndDate: string; // ISO 8601 format
  ActualEndDate?: string; // ISO 8601 format
  InitialTotalPrice: number;
  FinalCalculatedPrice?: number;
  Iskonto?: number;  // yüzde
  VatRate?: number;  // yüzde
  Currency?: CurrencyCode;
  IsCompleted: boolean;
  CreatedAt?: string;
  CreatedByUserFullName?: string;
  CreatedByUserName?: string;
  LastModifiedAt?: string | null;
  LastModifiedByUserFullName?: string | null;
  LastModifiedByUserName?: string | null;
  Customer?: Customer;
  Site?: ConstructionSite; // Şantiye bilgisi
  ContractDetails?: ContractDetail[];
}

export interface ContractDetail {
  DetailId: number;
  ContractId: number;
  ItemId: number;
  WarehouseId?: number;
  RentedQuantity: number;
  ReturnedQuantity: number;
  DailyPriceAtRent: number;
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
  UserId: number;
  Username: string;
  FullName?: string;
  Email?: string;
  RoleId?: number;
  RoleName?: string;
  /** Backend tarafında alternatif alan adlarıyla gelebilir (örn. JWT payload -> role/roleId). */
  role?: string;
  roleId?: number;
  Permissions: string[];
}

export interface LoginResponse {
  token: string;
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
  DailyPriceAtRent: number;
  ItemName: string;
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
  DailyPriceAtRent: number;
  ItemName: string;
}

export interface ManualContractLineItem {
  kind: 'manual';
  /** UI için benzersiz anahtar (backend DetailId yoksa) */
  ClientId: string;
  DetailId?: number;
  IsManual: true;
  Description: string;
  RentedQuantity: number;
  DailyPriceAtRent: number;
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
  UniqueItems: number;     // Benzersiz ürün sayısı
  TotalQuantity: number;   // Toplam stok miktarı
  CreatedAt?: string;
  CreatedByUserFullName?: string;
  CreatedByUserName?: string;
  LastModifiedAt?: string | null;
  LastModifiedByUserFullName?: string | null;
  LastModifiedByUserName?: string | null;
}

export interface WarehouseStock {
  StockId: number;
  WarehouseId: number;
  ItemId: number;
  Quantity: number;
  ItemName: string;
  CategoryId: number;
  CategoryName?: string;
}

export interface WarehouseStockResponse {
  warehouse: Warehouse;
  stock: WarehouseStock[];
}

// Teklif (Quote) Modelleri
export enum QuoteStatus {
  Pending = 'pending',
  Accepted = 'accepted',
  Rejected = 'rejected',
}

export interface Quote {
  QuoteId: number;
  QuoteCode?: string;
  CustomerId: number;
  SiteId?: number;
  StartDate: string; // ISO 8601 format
  PlannedEndDate: string; // ISO 8601 format
  TotalPrice: number;
  Status: QuoteStatus;
  Notes?: string;
  Iskonto?: number;  // yüzde
  VatRate?: number;  // yüzde
  Currency?: CurrencyCode;
  CreatedAt: string; // ISO 8601 format
  UpdatedAt: string; // ISO 8601 format
  ConvertedContractId?: number;
  CustomerName?: string;
  Customer?: Customer;
  Site?: ConstructionSite;
  QuoteDetails?: QuoteDetail[];
}

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
  DailyPrice: number;
  ItemName?: string;
  CategoryId?: number;
}

// Teklif Detay Item (UI için)
export interface QuoteDetailItem {
  QuoteDetailId: number;
  Item?: Inventory;
  ItemId: number;
  Quantity: number;
  DailyPrice: number;
  ItemName: string;
}

export type QuoteLineItem = InventoryQuoteLineItem | ManualQuoteLineItem;

export interface InventoryQuoteLineItem {
  kind: 'inventory';
  QuoteDetailId: number;
  Item?: Inventory;
  ItemId: number;
  Quantity: number;
  DailyPrice: number;
  ItemName: string;
}

export interface ManualQuoteLineItem {
  kind: 'manual';
  /** UI için benzersiz anahtar (backend QuoteDetailId yoksa) */
  ClientId: string;
  QuoteDetailId?: number;
  is_manual: true;
  Description: string;
  Quantity: number;
  DailyPrice: number;
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

/** Envanter kalemi: ItemId + Quantity. Manuel kalem: IsManual + Description + Quantity (ItemId yok). */
export interface CreateStockReceiptItemRequest {
  ItemId?: number;
  Quantity: number;
  IsManual?: boolean;
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
  related_entity_id: string | null;
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
  related_entity_id?: string;
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
