# Backend Geliştirme Talebi: Sözleşme Uzatma ve Faturalama Takibi

## 📋 Özet

İskele Takip Electron uygulaması için iki yeni özellik talep edilmektedir:
1. **Kiralama Sözleşmesi Uzatma** - Sözleşme bitiş tarihinin uzatılması ve geçmişinin tutulması
2. **Gelişmiş Faturalama Takibi** - Aylık fatura kesim detayları, sayıları ve tutarları

---

## 🔧 Özellik 1: Kiralama Sözleşmesi Uzatma (Contract Extension)

### Gereksinimler

#### 1.1 Yeni Tablo: `ContractExtensions`

```sql
CREATE TABLE ContractExtensions (
    ExtensionId INT PRIMARY KEY IDENTITY(1,1),
    ContractId INT NOT NULL FOREIGN KEY REFERENCES Contracts(ContractId),
    
    -- Uzatma öncesi değerler
    PreviousPlannedEndDate DATETIME NOT NULL,
    
    -- Uzatma sonrası değerler  
    NewPlannedEndDate DATETIME NOT NULL,
    
    -- Uzatma detayları
    ExtensionDays INT NOT NULL,  -- Kaç gün uzatıldı
    Reason NVARCHAR(500) NULL,   -- Uzatma gerekçesi
    
    -- Fiyat değişikliği (opsiyonel)
    PriceAdjustment DECIMAL(18,2) NULL,  -- Uzatma için ek ücret varsa
    NewMonthlyRate DECIMAL(18,2) NULL,   -- Yeni aylık oran (değiştiyse)
    
    -- Meta bilgiler
    CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CreatedByUserId INT NOT NULL FOREIGN KEY REFERENCES Users(UserId),
    Notes NVARCHAR(1000) NULL,
    
    -- Durum
    Status NVARCHAR(20) NOT NULL DEFAULT 'active',  -- active, cancelled
    CancelledAt DATETIME NULL,
    CancelledByUserId INT NULL,
    CancellationReason NVARCHAR(500) NULL
);

CREATE INDEX IX_ContractExtensions_ContractId ON ContractExtensions(ContractId);
CREATE INDEX IX_ContractExtensions_CreatedAt ON ContractExtensions(CreatedAt);
```

#### 1.2 API Endpoints

##### `POST /contracts/{contractId}/extensions`
Yeni uzatma oluşturur.

**Request Body:**
```json
{
  "newPlannedEndDate": "2027-03-15T00:00:00.000Z",
  "reason": "Müşteri talebi üzerine proje süresi uzadı",
  "priceAdjustment": 5000.00,
  "newMonthlyRate": null,
  "notes": "Ek protokol imzalandı"
}
```

**Alternatif (gün bazlı):**
```json
{
  "extensionDays": 30,
  "reason": "1 ay uzatma",
  "priceAdjustment": null,
  "notes": null
}
```

**Response (201 Created):**
```json
{
  "extensionId": 1,
  "contractId": 42,
  "previousPlannedEndDate": "2027-02-15T00:00:00.000Z",
  "newPlannedEndDate": "2027-03-15T00:00:00.000Z",
  "extensionDays": 28,
  "reason": "Müşteri talebi üzerine proje süresi uzadı",
  "priceAdjustment": 5000.00,
  "createdAt": "2027-01-10T14:30:00.000Z",
  "createdByName": "Ahmet Yılmaz"
}
```

**Validasyonlar:**
- `newPlannedEndDate` mevcut `PlannedEndDate`'den sonra olmalı
- Sözleşme `cancelled` veya `archived` durumunda olmamalı
- Sözleşme `RENTAL` tipinde olmalı (satış sözleşmeleri uzatılamaz)
- `ActualEndDate` (gerçek bitiş) varsa uzatma yapılamamalı (tamamlanmış sözleşme)

##### `GET /contracts/{contractId}/extensions`
Sözleşmenin uzatma geçmişini döner.

**Response:**
```json
{
  "contractId": 42,
  "originalPlannedEndDate": "2027-01-15T00:00:00.000Z",
  "currentPlannedEndDate": "2027-03-15T00:00:00.000Z",
  "totalExtensionDays": 59,
  "extensions": [
    {
      "extensionId": 1,
      "previousPlannedEndDate": "2027-01-15T00:00:00.000Z",
      "newPlannedEndDate": "2027-02-15T00:00:00.000Z",
      "extensionDays": 31,
      "reason": "İlk uzatma",
      "priceAdjustment": null,
      "status": "active",
      "createdAt": "2027-01-10T10:00:00.000Z",
      "createdByName": "Ahmet Yılmaz"
    },
    {
      "extensionId": 2,
      "previousPlannedEndDate": "2027-02-15T00:00:00.000Z",
      "newPlannedEndDate": "2027-03-15T00:00:00.000Z",
      "extensionDays": 28,
      "reason": "İkinci uzatma",
      "priceAdjustment": 5000.00,
      "status": "active",
      "createdAt": "2027-02-01T14:30:00.000Z",
      "createdByName": "Mehmet Demir"
    }
  ]
}
```

##### `DELETE /contracts/{contractId}/extensions/{extensionId}`
Son uzatmayı iptal eder (sadece en son uzatma iptal edilebilir).

**Request Body:**
```json
{
  "cancellationReason": "Müşteri iptal etti"
}
```

**Response (200):**
```json
{
  "extensionId": 2,
  "status": "cancelled",
  "cancelledAt": "2027-02-05T09:00:00.000Z",
  "revertedPlannedEndDate": "2027-02-15T00:00:00.000Z"
}
```

**Validasyonlar:**
- Sadece en son uzatma iptal edilebilir (chain bütünlüğü için)
- Uzatma tarihinden sonra fatura kesilmişse iptal edilememeli

#### 1.3 Contract Tablosu Güncellemesi

Uzatma oluşturulduğunda `Contracts` tablosundaki `PlannedEndDate` otomatik güncellenmeli.

```sql
-- Extension oluşturulunca
UPDATE Contracts 
SET PlannedEndDate = @NewPlannedEndDate,
    LastModifiedAt = GETUTCDATE()
WHERE ContractId = @ContractId;

-- Extension iptal edilince
UPDATE Contracts 
SET PlannedEndDate = @PreviousPlannedEndDate,
    LastModifiedAt = GETUTCDATE()
WHERE ContractId = @ContractId;
```

#### 1.4 Audit Log Entegrasyonu

Her uzatma işlemi için audit log kaydı:
```json
{
  "action": "CONTRACT_EXTENSION_CREATED",
  "entityType": "Contract",
  "entityId": 42,
  "changes": {
    "PlannedEndDate": {
      "old": "2027-02-15",
      "new": "2027-03-15"
    },
    "extensionId": 2,
    "extensionDays": 28
  }
}
```

---

## 🔧 Özellik 2: Gelişmiş Faturalama Takibi

### Mevcut Durumun Analizi

Mevcut sistemde:
- `BillingPeriod` yapısı dönem bazlı tahakkuk hesaplıyor
- `MarkBilledPeriod` ile dönem faturalandı işaretlenebiliyor
- `billedAmount` ve `variance` takip ediliyor

### Yeni Gereksinimler

#### 2.1 Yeni Tablo: `ContractInvoices` (Fatura Kayıtları)

```sql
CREATE TABLE ContractInvoices (
    InvoiceRecordId INT PRIMARY KEY IDENTITY(1,1),
    ContractId INT NOT NULL FOREIGN KEY REFERENCES Contracts(ContractId),
    
    -- Fatura bilgileri
    InvoiceNumber NVARCHAR(50) NULL,        -- Harici fatura numarası (opsiyonel)
    InvoiceDate DATE NOT NULL,              -- Fatura tarihi
    
    -- Dönem bilgileri
    PeriodStart DATE NOT NULL,              -- Hangi dönem için
    PeriodEnd DATE NOT NULL,
    PeriodMonth INT NOT NULL,               -- Ay (1-12)
    PeriodYear INT NOT NULL,                -- Yıl
    ContractMonth INT NOT NULL,             -- Sözleşmenin kaçıncı ayı (1, 2, 3...)
    
    -- Tutar bilgileri
    ExpectedAmount DECIMAL(18,2) NOT NULL,  -- Kesilmesi gereken (tahakkuk)
    InvoicedAmount DECIMAL(18,2) NOT NULL,  -- Kesilen fatura tutarı
    Variance DECIMAL(18,2) AS (InvoicedAmount - ExpectedAmount) PERSISTED,
    
    -- Para birimi
    Currency NVARCHAR(3) NOT NULL DEFAULT 'TRY',
    
    -- Detaylar
    Notes NVARCHAR(1000) NULL,
    
    -- Meta
    CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CreatedByUserId INT NOT NULL,
    LastModifiedAt DATETIME NULL,
    
    -- Silme (soft delete)
    DeletedAt DATETIME NULL,
    DeletedByUserId INT NULL
);

CREATE INDEX IX_ContractInvoices_ContractId ON ContractInvoices(ContractId);
CREATE INDEX IX_ContractInvoices_Period ON ContractInvoices(PeriodYear, PeriodMonth);
CREATE INDEX IX_ContractInvoices_ContractMonth ON ContractInvoices(ContractId, ContractMonth);
```

#### 2.2 Yeni API Endpoints

##### `GET /contracts/{contractId}/invoicing-summary`
Sözleşmenin faturalama özeti.

**Response:**
```json
{
  "contractId": 42,
  "contractCode": "SZ-2026-0042",
  "currency": "TRY",
  "startDate": "2026-06-01",
  "plannedEndDate": "2027-03-15",
  "currentContractMonth": 8,
  "totalContractMonths": 10,
  
  "summary": {
    "totalExpected": 450000.00,      // Bugüne kadar toplam tahakkuk
    "totalInvoiced": 420000.00,      // Bugüne kadar toplam kesilen
    "totalVariance": -30000.00,      // Fark (negatif = eksik faturalandı)
    "invoiceCount": 7,               // Toplam kesilen fatura sayısı
    "currentMonthDue": 55000.00,     // Bu ay kesilmesi gereken
    "currentMonthInvoiced": 0.00,    // Bu ay kesilen
    "overdueAmount": 30000.00        // Geçmiş dönemlerden kalan
  },
  
  "monthlyBreakdown": [
    {
      "contractMonth": 1,
      "periodMonth": 6,
      "periodYear": 2026,
      "periodStart": "2026-06-01",
      "periodEnd": "2026-06-30",
      "expectedAmount": 45000.00,
      "invoicedAmount": 45000.00,
      "variance": 0.00,
      "invoiceCount": 1,
      "status": "fully_invoiced",
      "invoices": [
        {
          "invoiceRecordId": 1,
          "invoiceNumber": "FT-2026-0123",
          "invoiceDate": "2026-07-05",
          "amount": 45000.00
        }
      ]
    },
    {
      "contractMonth": 2,
      "periodMonth": 7,
      "periodYear": 2026,
      "periodStart": "2026-07-01",
      "periodEnd": "2026-07-31",
      "expectedAmount": 60000.00,
      "invoicedAmount": 55000.00,
      "variance": -5000.00,
      "invoiceCount": 2,
      "status": "partially_invoiced",
      "invoices": [
        {
          "invoiceRecordId": 2,
          "invoiceNumber": "FT-2026-0156",
          "invoiceDate": "2026-08-01",
          "amount": 30000.00
        },
        {
          "invoiceRecordId": 3,
          "invoiceNumber": "FT-2026-0167",
          "invoiceDate": "2026-08-15",
          "amount": 25000.00
        }
      ]
    },
    {
      "contractMonth": 8,
      "periodMonth": 1,
      "periodYear": 2027,
      "periodStart": "2027-01-01",
      "periodEnd": "2027-01-31",
      "expectedAmount": 55000.00,
      "invoicedAmount": 0.00,
      "variance": -55000.00,
      "invoiceCount": 0,
      "status": "not_invoiced",
      "invoices": []
    }
  ],
  
  "warnings": [
    "3. ayda 5.000 TL eksik faturalandı",
    "8. ay henüz faturalanmadı"
  ]
}
```

##### `POST /contracts/{contractId}/invoices`
Yeni fatura kaydı ekler.

**Request Body:**
```json
{
  "invoiceNumber": "FT-2027-0045",
  "invoiceDate": "2027-01-10",
  "periodStart": "2027-01-01",
  "periodEnd": "2027-01-31",
  "invoicedAmount": 55000.00,
  "notes": "Ocak 2027 dönemi faturası"
}
```

**Response (201):**
```json
{
  "invoiceRecordId": 15,
  "contractId": 42,
  "contractMonth": 8,
  "periodMonth": 1,
  "periodYear": 2027,
  "expectedAmount": 55000.00,
  "invoicedAmount": 55000.00,
  "variance": 0.00,
  "createdAt": "2027-01-10T15:30:00.000Z"
}
```

**Validasyonlar:**
- `periodStart` ve `periodEnd` sözleşme tarihleri içinde olmalı
- `invoicedAmount` >= 0 olmalı
- `invoiceDate` mantıklı bir aralıkta olmalı

##### `PUT /contracts/{contractId}/invoices/{invoiceRecordId}`
Fatura kaydını günceller.

##### `DELETE /contracts/{contractId}/invoices/{invoiceRecordId}`
Fatura kaydını siler (soft delete).

##### `GET /contracts/{contractId}/invoices`
Sözleşmenin tüm fatura kayıtlarını listeler.

**Query Parameters:**
- `periodYear`: Yıla göre filtre
- `periodMonth`: Aya göre filtre
- `contractMonth`: Sözleşme ayına göre filtre
- `includeDeleted`: Silinen kayıtları da dahil et

#### 2.3 Mevcut Billing Endpoint'lerin Güncellenmesi

##### `GET /contracts/{contractId}/billing-summary` (Güncelleme)

Mevcut response'a ek alanlar:

```json
{
  "asOf": "2027-01-10T23:59:59.999Z",
  "dueNow": 30000.00,
  "currentPeriodProjection": { ... },
  "warnings": [ ... ],
  
  // YENİ ALANLAR
  "invoicingStats": {
    "currentContractMonth": 8,
    "totalInvoiceCount": 7,
    "currentMonthInvoiceCount": 0,
    "lastInvoiceDate": "2026-12-15",
    "averageMonthlyInvoiced": 52500.00
  }
}
```

#### 2.4 Helper Fonksiyon: Sözleşme Ayı Hesaplama

```csharp
public int CalculateContractMonth(DateTime contractStartDate, DateTime targetDate)
{
    // Sözleşme başlangıcından itibaren kaçıncı ay
    int months = ((targetDate.Year - contractStartDate.Year) * 12) 
                 + targetDate.Month - contractStartDate.Month + 1;
    return Math.Max(1, months);
}
```

---

## 📊 Faturalama Durumları (Status)

| Status | Açıklama | Koşul |
|--------|----------|-------|
| `not_invoiced` | Faturalanmadı | `invoicedAmount = 0` |
| `partially_invoiced` | Kısmen faturalandı | `0 < invoicedAmount < expectedAmount` |
| `fully_invoiced` | Tam faturalandı | `invoicedAmount = expectedAmount` |
| `over_invoiced` | Fazla faturalandı | `invoicedAmount > expectedAmount` |
| `in_progress` | Dönem devam ediyor | Dönem henüz kapanmadı |

---

## 🔐 Yetkilendirme

### Yeni Permissions

```csharp
// Extension (Uzatma)
"contracts_extend"      // Sözleşme uzatabilir
"contracts_extend_view" // Uzatma geçmişini görüntüleyebilir

// Invoicing (Faturalama)
"contracts_invoice_create"  // Fatura kaydı ekleyebilir
"contracts_invoice_update"  // Fatura kaydı düzenleyebilir
"contracts_invoice_delete"  // Fatura kaydı silebilir
"contracts_invoice_view"    // Fatura kayıtlarını görüntüleyebilir
```

### Permission Mapping

| Endpoint | Gereken Yetki |
|----------|---------------|
| `POST /contracts/:id/extensions` | `contracts_extend` |
| `GET /contracts/:id/extensions` | `contracts_extend_view` veya `contracts_view` |
| `DELETE /contracts/:id/extensions/:eid` | `contracts_extend` |
| `POST /contracts/:id/invoices` | `contracts_invoice_create` |
| `PUT /contracts/:id/invoices/:iid` | `contracts_invoice_update` |
| `DELETE /contracts/:id/invoices/:iid` | `contracts_invoice_delete` |
| `GET /contracts/:id/invoices` | `contracts_invoice_view` veya `contracts_view` |
| `GET /contracts/:id/invoicing-summary` | `contracts_invoice_view` veya `contracts_view` |

---

## 🔄 Migration Script

```sql
-- 1. ContractExtensions tablosu
CREATE TABLE ContractExtensions ( ... );

-- 2. ContractInvoices tablosu  
CREATE TABLE ContractInvoices ( ... );

-- 3. Mevcut BilledPeriods verilerini migrate et (opsiyonel)
INSERT INTO ContractInvoices (ContractId, InvoiceDate, PeriodStart, PeriodEnd, ...)
SELECT 
    bp.ContractId,
    bp.MarkedAt AS InvoiceDate,
    bp.PeriodStart,
    bp.PeriodEnd,
    ...
FROM BilledPeriods bp;

-- 4. Yeni permissions ekle
INSERT INTO Permissions (PermissionName, Description) VALUES
('contracts_extend', 'Sözleşme uzatma yetkisi'),
('contracts_extend_view', 'Sözleşme uzatma geçmişi görüntüleme'),
('contracts_invoice_create', 'Fatura kaydı ekleme'),
('contracts_invoice_update', 'Fatura kaydı düzenleme'),
('contracts_invoice_delete', 'Fatura kaydı silme'),
('contracts_invoice_view', 'Fatura kayıtları görüntüleme');

-- 5. Admin rolüne yetkileri ekle
INSERT INTO RolePermissions (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Roles r, Permissions p
WHERE r.RoleName = 'Admin' 
  AND p.PermissionName IN ('contracts_extend', 'contracts_extend_view', 
                           'contracts_invoice_create', 'contracts_invoice_update',
                           'contracts_invoice_delete', 'contracts_invoice_view');
```

---

## 📝 İş Kuralları

### Sözleşme Uzatma

1. **Sadece aktif kiralama sözleşmeleri** uzatılabilir
2. **Tamamlanmış sözleşmeler** (ActualEndDate dolu) uzatılamaz
3. **İptal edilmiş** sözleşmeler uzatılamaz
4. Uzatma tarihi **mevcut PlannedEndDate'den sonra** olmalı
5. Uzatma iptal edilirse, **sadece son uzatma** iptal edilebilir
6. Uzatma tarihinden sonra **fatura kesilmişse** iptal edilemez

### Faturalama

1. Fatura kaydı **sözleşme dönemleri içinde** olmalı
2. Bir dönem için **birden fazla fatura** kesilebilir
3. **Negatif tutar** girilemez
4. **Gelecek dönemler** için fatura önceden kesilebilir
5. Silinen faturalar **soft delete** ile saklanır
6. **ContractMonth** otomatik hesaplanır

---

## 🎯 Frontend Entegrasyonu İçin Notlar

### Yeni UI Bileşenleri

1. **ContractExtensionPanel** - Uzatma geçmişi ve yeni uzatma ekleme
2. **ContractInvoicingSummaryPanel** - Faturalama özeti dashboard
3. **AddInvoiceRecordModal** - Fatura kaydı ekleme modalı
4. **ExtensionHistoryDrawer** - Uzatma geçmişi drawer

### Model Güncellemeleri (Frontend)

```typescript
// models/index.ts'e eklenecek

export interface ContractExtension {
  ExtensionId: number;
  ContractId: number;
  PreviousPlannedEndDate: string;
  NewPlannedEndDate: string;
  ExtensionDays: number;
  Reason?: string | null;
  PriceAdjustment?: number | null;
  Status: 'active' | 'cancelled';
  CreatedAt: string;
  CreatedByName?: string;
  CancelledAt?: string | null;
  CancellationReason?: string | null;
}

export interface ContractExtensionHistory {
  contractId: number;
  originalPlannedEndDate: string;
  currentPlannedEndDate: string;
  totalExtensionDays: number;
  extensions: ContractExtension[];
}

export interface ContractInvoiceRecord {
  InvoiceRecordId: number;
  ContractId: number;
  InvoiceNumber?: string | null;
  InvoiceDate: string;
  PeriodStart: string;
  PeriodEnd: string;
  PeriodMonth: number;
  PeriodYear: number;
  ContractMonth: number;
  ExpectedAmount: number;
  InvoicedAmount: number;
  Variance: number;
  Notes?: string | null;
  CreatedAt: string;
}

export type InvoicingStatus = 
  | 'not_invoiced' 
  | 'partially_invoiced' 
  | 'fully_invoiced' 
  | 'over_invoiced' 
  | 'in_progress';

export interface MonthlyInvoicingBreakdown {
  contractMonth: number;
  periodMonth: number;
  periodYear: number;
  periodStart: string;
  periodEnd: string;
  expectedAmount: number;
  invoicedAmount: number;
  variance: number;
  invoiceCount: number;
  status: InvoicingStatus;
  invoices: Pick<ContractInvoiceRecord, 
    'InvoiceRecordId' | 'InvoiceNumber' | 'InvoiceDate' | 'InvoicedAmount'>[];
}

export interface ContractInvoicingSummary {
  contractId: number;
  contractCode: string;
  currency: CurrencyCode;
  startDate: string;
  plannedEndDate: string;
  currentContractMonth: number;
  totalContractMonths: number;
  summary: {
    totalExpected: number;
    totalInvoiced: number;
    totalVariance: number;
    invoiceCount: number;
    currentMonthDue: number;
    currentMonthInvoiced: number;
    overdueAmount: number;
  };
  monthlyBreakdown: MonthlyInvoicingBreakdown[];
  warnings: string[];
}
```

---

## ✅ Kabul Kriterleri

### Sözleşme Uzatma
- [ ] Uzatma oluşturulabilir ve PlannedEndDate güncellenir
- [ ] Uzatma geçmişi görüntülenebilir
- [ ] Son uzatma iptal edilebilir
- [ ] Validasyonlar çalışır (aktif sözleşme, doğru tarih vs.)
- [ ] Audit log kaydedilir

### Faturalama Takibi
- [ ] Fatura kaydı eklenebilir
- [ ] Aylık kırılım görüntülenebilir
- [ ] Sözleşme ayı (contractMonth) doğru hesaplanır
- [ ] Durum (status) doğru belirlenir
- [ ] Toplam/ortalama istatistikler doğru hesaplanır
- [ ] Uyarılar (eksik fatura vs.) gösterilir

---

## 📌 Öncelik Sırası

1. **Yüksek**: ContractExtensions tablosu ve CRUD endpoints
2. **Yüksek**: ContractInvoices tablosu ve CRUD endpoints  
3. **Orta**: Invoicing summary endpoint
4. **Orta**: Mevcut billing-summary güncelleme
5. **Düşük**: Migration script (mevcut BilledPeriods verisi için)

---

*Bu döküman frontend ihtiyaçlarına göre hazırlanmıştır. Backend implementasyonunda uygun görülen değişiklikler yapılabilir, ancak API contract'ı (request/response format) frontend uyumluluğu için korunmalıdır.*
