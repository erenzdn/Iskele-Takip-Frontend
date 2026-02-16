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
  CategoryId: number;
  ItemName: string;
  TotalStock: number;
  OnRent: number;
  DailyPrice: number;
  PurchasePrice: number;
  MonthlyListPrice?: number;
  UnitPrice?: number;
  SubCategories?: SubCategory[];
  CreatedAt?: string;
  CreatedByUserFullName?: string;
  CreatedByUserName?: string;
  LastModifiedAt?: string | null;
  LastModifiedByUserFullName?: string | null;
  LastModifiedByUserName?: string | null;
  Category?: MaterialCategory;
  PriceTiers?: PriceTier[];
  ContractDetails?: ContractDetail[];
}

export interface Contract {
  ContractId: number;
  CustomerId: number;
  SiteId?: number; // Şantiye ID (opsiyonel)
  StartDate: string; // ISO 8601 format
  PlannedEndDate: string; // ISO 8601 format
  ActualEndDate?: string; // ISO 8601 format
  InitialTotalPrice: number;
  FinalCalculatedPrice?: number;
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
  RentedQuantity: number;
  ReturnedQuantity: number;
  DailyPriceAtRent: number;
  ItemName: string;
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
  CustomerId: number;
  SiteId?: number;
  StartDate: string; // ISO 8601 format
  PlannedEndDate: string; // ISO 8601 format
  TotalPrice: number;
  Status: QuoteStatus;
  Notes?: string;
  CreatedAt: string; // ISO 8601 format
  UpdatedAt: string; // ISO 8601 format
  ConvertedContractId?: number;
  CustomerName?: string;
  Customer?: Customer;
  Site?: ConstructionSite;
  QuoteDetails?: QuoteDetail[];
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
