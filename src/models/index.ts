// Entity Models
export interface Customer {
  CustomerId: number;
  Name: string;
  TaxId?: string;
  PhoneNumber?: string;
  Email?: string;
  Address?: string;
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

export interface Inventory {
  ItemId: number;
  CategoryId: number;
  ItemName: string;
  TotalStock: number;
  OnRent: number;
  DailyPrice: number;
  PurchasePrice: number;
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
  RoleId: number;
  RoleName: string;
  Permissions: Record<string, string>;
}

export interface LoginResponse {
  token: string;
  user: LoginUserDto;
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
