# 📋 Sözleşme Uzatma ve Fatura Takibi - Frontend Entegrasyonu

> Backend'e eklenen sözleşme uzatma ve fatura takibi özellikleri frontend'e entegre edildi.

---

## 🎯 Yapılan Değişiklikler

### 1️⃣ Yeni Tipler ve Modeller (`src/models/index.ts`)

Backend API'den dönen yeni veri yapıları için TypeScript tipleri eklendi:

```typescript
// Sözleşme Uzatma Tipleri
export interface ContractExtension { ... }
export interface ContractExtensionHistory { ... }
export interface CreateExtensionRequest { ... }
export interface CancelExtensionRequest { ... }

// Fatura Takibi Tipleri
export interface ContractInvoice { ... }
export interface ContractInvoicingSummary { ... }
export interface CreateInvoiceRequest { ... }
export interface UpdateInvoiceRequest { ... }
```

### 2️⃣ API Servisleri (`src/services/contractService.ts`)

Backend endpoint'leri ile iletişim kuran yeni servis metodları:

#### Uzatma API'leri:
```typescript
getExtensionsAsync(contractId: number): Promise<ContractExtensionHistory>
createExtensionAsync(contractId: number, data: CreateExtensionRequest): Promise<ContractExtension>
cancelExtensionAsync(contractId: number, extensionId: number, data: CancelExtensionRequest): Promise<ContractExtension>
```

#### Fatura API'leri:
```typescript
getInvoicesAsync(contractId: number, includeDeleted?: boolean): Promise<ContractInvoice[]>
createInvoiceAsync(contractId: number, data: CreateInvoiceRequest): Promise<ContractInvoice>
updateInvoiceAsync(contractId: number, invoiceId: number, data: UpdateInvoiceRequest): Promise<ContractInvoice>
deleteInvoiceAsync(contractId: number, invoiceId: number): Promise<void>
getInvoicingSummaryAsync(contractId: number): Promise<ContractInvoicingSummary>
```

### 3️⃣ Yeni UI Panelleri

#### `ContractExtensionsPanel.tsx`
Sözleşme uzatma yönetimi için tam özellikli panel:

**Özellikler:**
- ✅ Orijinal ve güncel bitiş tarihlerini gösterme
- ✅ Toplam uzatma günü ve sayısı özeti
- ✅ Yeni uzatma oluşturma formu (sebep ve not ile)
- ✅ Uzatma geçmişi listesi
- ✅ Son uzatmayı iptal etme
- ✅ İzin kontrolü (`contracts_extend`)
- ✅ Otomatik sözleşme yenileme

**Kullanım:**
```tsx
<ContractExtensionsPanel
  contractId={123}
  contractCode="SZ-2026-0042"
  currentPlannedEndDate="2027-12-31"
  onExtensionCreated={() => { /* refresh */ }}
/>
```

#### `ContractInvoicesPanel.tsx`
Fatura takibi ve raporlama paneli:

**Özellikler:**
- ✅ Fatura listesi (oluşturma, düzenleme, silme)
- ✅ Aylık fatura özeti ve kırılımı
- ✅ Toplam faturalandırma istatistikleri
- ✅ Dönem bazlı fatura takibi
- ✅ Çoklu para birimi desteği (TRY, EUR, USD)
- ✅ İzin kontrolü (`contracts_invoice`)
- ✅ Soft delete (silinmiş faturalar korunur)

**Kullanım:**
```tsx
<ContractInvoicesPanel
  contractId={123}
  contractCode="SZ-2026-0042"
  contractCurrency="TRY"
/>
```

### 4️⃣ Modal Entegrasyonu (`ContractDetailModal.tsx`)

Sözleşme detay modalına yeni tab'lar eklendi:

```typescript
// Tab tipi güncellendi:
type ContractDetailTab = 
  | 'info' 
  | 'billing' 
  | 'return' 
  | 'returns' 
  | 'history' 
  | 'addenda' 
  | 'addendum-extras'
  | 'extensions'  // 🆕 Yeni!
  | 'invoices';   // 🆕 Yeni!
```

**Yeni Tab'lar:**

1. **"Uzatmalar" Tab'ı**
   - Sadece kiralama sözleşmelerinde gösterilir
   - `contracts_extend` veya `contracts_view` yetkisi gerekir
   - `ContractExtensionsPanel` render eder

2. **"Faturalar" Tab'ı**
   - Tüm sözleşme tiplerinde (kiralama ve satış)
   - `contracts_invoice` veya `contracts_view` yetkisi gerekir
   - `ContractInvoicesPanel` render eder

### 5️⃣ Liste Sayfası Güncellemesi (`ContractsPage.tsx`)

Sözleşme listesi sayfasından yeni tab'lara navigasyon desteği:

```typescript
// URL state üzerinden tab açma
navigate('/contracts', {
  state: {
    openContractId: 42,
    initialTab: 'extensions' // veya 'invoices'
  }
});
```

---

## 🔐 İzin Sistemi

Backend'deki izin yapısına uygun şekilde frontend'de kontroller eklendi:

### Yeni İzinler:
| İzin | Açıklama | Kullanım Alanı |
|------|----------|----------------|
| `contracts_extend` | Sözleşme uzatma ve iptal | Uzatmalar tab'ında form gösterilir |
| `contracts_invoice` | Fatura ekleme/düzenleme/silme | Faturalar tab'ında düzenleme butonları |

### İzin Kontrol Akışı:

```typescript
// ContractDetailModal.tsx
const canExtendContract = Boolean(currentUser?.permissions?.includes('contracts_extend'));
const canManageInvoices = Boolean(currentUser?.permissions?.includes('contracts_invoice'));

// Tab butonları sadece yetkili kullanıcılara gösterilir
{isRentalContract && !isNew && (canViewContracts || canExtendContract) && (
  <button onClick={() => setActiveTab('extensions')}>Uzatmalar</button>
)}

{!isNew && (canViewContracts || canManageInvoices) && (
  <button onClick={() => setActiveTab('invoices')}>Faturalar</button>
)}
```

---

## 📊 Kullanım Senaryoları

### Senaryo 1: Kiralama Sözleşmesini Uzatma

```
1. Kullanıcı aktif sözleşmeye tıklar
2. "Uzatmalar" tab'ına geçer
3. "+ Yeni Uzatma Ekle" butonuna tıklar
4. Form doldurulur:
   - Yeni Bitiş Tarihi: 2027-12-31
   - Sebep: "Proje süresi 3 ay uzadı"
   - Not: "Müşteri ile protokol yapıldı"
5. "Uzat" butonuna tıklanır
6. Backend otomatik olarak:
   ✓ Uzatma kaydı oluşturur
   ✓ Sözleşmenin PlannedEndDate'ini günceller
   ✓ Kaç gün uzatıldığını hesaplar
   ✓ Audit log kaydeder
7. UI güncellenir, toast mesajı gösterilir
```

### Senaryo 2: Aylık Fatura Takibi

```
1. Kullanıcı sözleşmeye girer
2. "Faturalar" tab'ına geçer
3. "+ Yeni Fatura Ekle" butonuna tıklar
4. Form doldurulur:
   - Fatura No: FT-2026-0042
   - Fatura Tarihi: 2026-11-05
   - Dönem: 2026-11-01 → 2026-11-30
   - Tutar: 45000.00
   - Para Birimi: TRY
   - Not: "Kasım ayı kiralama bedeli"
5. "Kaydet" butonuna tıklanır
6. Fatura listesine eklenir
7. "Aylık Özet" butonuyla kırılım görülebilir
```

### Senaryo 3: Yanlış Uzatmayı İptal Etme

```
1. Uzatmalar tab'ında geçmiş görüntülenir
2. En son uzatmanın yanında "İptal Et" butonu görünür
3. Butona tıklanır
4. İptal sebebi girilir (popup)
5. Backend:
   ✓ Uzatmayı "cancelled" durumuna alır
   ✓ PlannedEndDate'i önceki değere döndürür
   ✓ Uzatma kaydı silinmez (audit trail korunur)
6. UI güncellenir, iptal edilen uzatma soluk renkte gösterilir
```

---

## 🎨 UI/UX Özellikleri

### 💰 Fatura Durumu Kartı (Yeni!)

Faturalar panelinde ilk sırada gösterilen akıllı kart:

**Gösterilen Bilgiler:**
- **Sözleşme Tutarı**: Toplam sözleşme bedeli
- **Kesilen Fatura**: Şu ana kadar kesilen faturaların toplamı
- **Kalan Tutar**: Henüz faturalandırılmayan tutar
  - 🟡 Sarı: Kalan tutar var
  - 🟢 Yeşil: Tam olarak faturalandırılmış (0)
  - 🔴 Kırmızı: Fazla faturalandırılmış (eksi değer)
- **Tamamlanma**: Görsel progress bar ile yüzde gösterimi
  - 🟡 Sarı: %0-74 arası
  - 🔵 Mavi: %75-99 arası
  - 🟢 Yeşil: %100 ve üzeri

**Kiralama Sözleşmeleri için Ek Bilgiler:**
- 📅 **Başlangıç Tarihi**: Sözleşme başlangıç tarihi
- ⏱️ **Süre**: Kaç aylık kiralama (otomatik hesaplanan)
- 🏁 **Bitiş Tarihi**: Planlanan bitiş tarihi

**Örnek Gösterim (Kiralama):**
```
┌──────────────────────── Fatura Durumu ────────────────────────┐
│ 📅 Başlangıç: 01.01.2026  ⏱️ Süre: 12 ay  🏁 Bitiş: 31.12.2026 │
├────────────────────────────────────────────────────────────────┤
│  Sözleşme: ₺120.000   Kesilen: ₺80.000   Kalan: ₺40.000   67% │
└────────────────────────────────────────────────────────────────┘
```

**Akıllı Uyarılar:**
- ⚠️ Fazla faturalandırma: "Kesilen faturalar sözleşme tutarını aşıyor! Fazla: ₺5.000,00"
- ✓ Tam faturalandırma: "Sözleşme tutarının tamamı faturalandırıldı."

---

### Uzatmalar Paneli:

- **Özet Kartı**: Orijinal/güncel tarihler, toplam uzatma bilgisi
- **Renk Kodlaması**: 
  - Aktif uzatmalar: Normal görünüm
  - İptal edilenler: Soluk + kırmızı border
- **Son Uzatma Vurgusu**: Sadece en son uzatma iptal edilebilir
- **Responsive Form**: Daraltılabilir uzatma formu

### Faturalar Paneli:

- **Fatura Durumu Kartı**: 
  - Sözleşme tutarı vs kesilen fatura karşılaştırması
  - Kalan tutar hesaplama (sarı/yeşil/kırmızı renk kodlu)
  - Progress bar ile tamamlanma yüzdesi
  - Kiralama sözleşmeleri için: başlangıç tarihi ve kaç aylık olduğu
  - Otomatik uyarılar (fazla/eksik faturalandırma)
- **İstatistik Kartı**: Toplam tutar, fatura sayısı, son fatura tarihi
- **Aylık Kırılım**: Ay bazlı gruplama, her ay için fatura listesi
- **Grafik Hazır Veri**: `monthlyBreakdown` array'i chart kütüphaneleriyle uyumlu
- **Para Birimi Desteği**: ₺, €, $ sembolleri otomatik
- **CRUD İşlemleri**: Inline düzenleme ve silme butonları

---

## 🔧 Teknik Detaylar

### API İletişimi:

```typescript
// GET /contracts/:id/extensions
const history = await contractService.getExtensionsAsync(contractId);

// POST /contracts/:id/extensions
const extension = await contractService.createExtensionAsync(contractId, {
  newPlannedEndDate: '2027-12-31',
  reason: 'Proje uzadı',
  notes: 'Protokol yapıldı'
});

// DELETE /contracts/:id/extensions/:extensionId
await contractService.cancelExtensionAsync(contractId, extensionId, {
  reason: 'Yanlışlıkla girilmiş'
});

// GET /contracts/:id/invoices
const invoices = await contractService.getInvoicesAsync(contractId);

// POST /contracts/:id/invoices
const invoice = await contractService.createInvoiceAsync(contractId, {
  invoiceNumber: 'FT-2026-0042',
  invoiceDate: '2026-11-05',
  periodStart: '2026-11-01',
  periodEnd: '2026-11-30',
  amount: 45000.00,
  currency: 'TRY'
});

// GET /contracts/:id/invoicing-summary
const summary = await contractService.getInvoicingSummaryAsync(contractId);
```

### State Yönetimi:

- **Panel İçi State**: Her panel kendi verilerini yönetir
- **Parent Callback**: `onExtensionCreated` ile sözleşme yenilenir
- **Tab Geçişi**: Modal seviyesinde `activeTab` state'i
- **İzin Kontrolü**: `useAuthStore` hook'u ile runtime kontroller

### Hata Yönetimi:

```typescript
try {
  await contractService.createExtensionAsync(contractId, data);
  toast.success('Sözleşme uzatıldı!');
} catch (error) {
  console.error('Create extension error:', error);
  toast.error(getApiErrorMessage(error) || 'Uzatma oluşturulamadı.');
}
```

---

## ⚠️ Önemli Kurallar

### Uzatma Kuralları (Backend'den):
- ❌ Satış sözleşmeleri uzatılamaz (sadece kiralama)
- ❌ Tamamlanmış/iptal edilmiş sözleşmeler uzatılamaz
- ❌ Sadece **son uzatma** iptal edilebilir
- ✅ Yeni bitiş tarihi mevcut tarihten sonra olmalı

### Fatura Kuralları (Backend'den):
- ✅ Tutar ≥ 0
- ✅ Dönem bitiş ≥ dönem başlangıç
- ✅ Bir dönem için birden fazla fatura eklenebilir
- ✅ Soft delete (silinen faturalar `DeletedAt` ile işaretlenir)
- ❌ Silinen faturalar güncelle edilemez

---

## 📦 Dosya Yapısı

```
src/
├── models/
│   └── index.ts                                    # Yeni tipler eklendi
├── services/
│   └── contractService.ts                          # API metodları eklendi
├── components/
│   ├── modals/
│   │   └── ContractDetailModal.tsx                 # Tab'lar ve izinler eklendi
│   └── contracts/
│       ├── ContractExtensionsPanel.tsx             # 🆕 Yeni!
│       └── ContractInvoicesPanel.tsx               # 🆕 Yeni!
└── pages/
    └── ContractsPage.tsx                           # Tab navigasyon desteği
```

---

## 🚀 Test Senaryoları

### Uzatma Testi:
1. ✅ Kiralama sözleşmesinde "Uzatmalar" tab'ı görünüyor mu?
2. ✅ `contracts_extend` yetkisi olmayan kullanıcıya form gösterilmiyor mu?
3. ✅ Uzatma sonrası PlannedEndDate güncelliyor mu?
4. ✅ Geçmişteki tüm uzatmalar listeleniyor mu?
5. ✅ İptal edilen uzatma gri renkte gösteriliyor mu?
6. ✅ Sadece son uzatma için "İptal Et" butonu var mı?

### Fatura Testi:
1. ✅ Hem kiralama hem satış sözleşmelerinde "Faturalar" tab'ı var mı?
2. ✅ `contracts_invoice` yetkisi olmayan kullanıcı düzenleyemiyor mu?
3. ✅ Fatura ekleme/düzenleme/silme çalışıyor mu?
4. ✅ Aylık özet doğru hesaplanıyor mu?
5. ✅ Farklı para birimleri düzgün gösteriliyor mu?
6. ✅ Silinen fatura listeden kalkıyor mu?

---

## 🎉 Özet

Frontend entegrasyonu tamamlandı! Artık kullanıcılar:

✅ Kiralama sözleşmelerini kolayca uzatabilir  
✅ Uzatma geçmişini detaylı görebilir  
✅ Yanlış uzatmaları iptal edebilir  
✅ Kesilen faturaları sisteme kaydedebilir  
✅ Aylık fatura özetlerini görebilir  
✅ Dönem bazlı fatura takibi yapabilir  

**Backend API ile tam uyumlu çalışan, kullanıcı dostu, izin kontrollü bir sistem! 🚀**

---

## 📞 Geliştirme Notları

- Backend README: `c:\Users\msi-nb\source\repos\IskeleTakipAPI\CONTRACT_EXTENSIONS_INVOICES_README.md`
- Tüm endpoint'ler backend ile test edilmiştir
- İzin sistemi backend permission yapısıyla uyumludur
- UI/UX mevcut sistem tasarımıyla tutarlıdır

**Geliştirme Tarihi:** 7 Kasım 2026  
**Frontend Versiyon:** 1.0.0  
**Durum:** Production Ready ✅
