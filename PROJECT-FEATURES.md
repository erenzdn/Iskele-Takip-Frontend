# İskeleTakip Desktop - Proje Özellikleri ve Yapabildikleri

Bu dokümantasyon, İskeleTakip Desktop uygulamasının **tüm özelliklerini, yapabildiklerini ve teknik detaylarını** içerir. Electron'a geçiş için referans dokümantasyonu olarak hazırlanmıştır.

---

## 📋 İçindekiler

1. [Genel Mimari](#genel-mimari)
2. [Kimlik Doğrulama ve Güvenlik](#kimlik-doğrulama-ve-güvenlik)
3. [Dashboard (Ana Ekran)](#dashboard-ana-ekran)
4. [Müşteri Yönetimi](#müşteri-yönetimi)
5. [Envanter Yönetimi](#envanter-yönetimi)
6. [Sözleşme Yönetimi](#sözleşme-yönetimi)
7. [Fiyat Tarifeleri](#fiyat-tarifeleri)
8. [Fiyatlandırma Kuralları](#fiyatlandırma-kuralları)
9. [UI/UX Özellikleri](#uiux-özellikleri)
10. [API Entegrasyonu](#api-entegrasyonu)
11. [Veri Modelleri](#veri-modelleri)
12. [Teknik Detaylar](#teknik-detaylar)

---

## 🏗️ Genel Mimari

### Proje Yapısı

- **IskeleTakip.Core**: Domain entity'leri ve modeller
- **IskeleTakip.Data**: EF Core DbContext (artık kullanılmıyor, sadece referans)
- **IskeleTakip.Services**: İş mantığı ve API client'ları
- **IskeleTakip.Desktop**: Avalonia UI katmanı

### Mimari Desenler

- **MVVM (Model-View-ViewModel)**: Tüm ekranlar MVVM pattern'i kullanıyor
- **Dependency Injection**: Microsoft.Extensions.DependencyInjection ile servis yönetimi
- **Repository Pattern**: Service interface'leri üzerinden veri erişimi
- **API-First Architecture**: Tüm veri işlemleri harici REST API üzerinden

### Teknoloji Stack

- **.NET 8.0**: Ana framework
- **Avalonia UI 11.3.9**: Cross-platform desktop UI framework
- **CommunityToolkit.Mvvm**: MVVM helper'ları (ObservableProperty, RelayCommand)
- **System.Text.Json**: JSON serialization
- **HttpClient**: API iletişimi

---

## 🔐 Kimlik Doğrulama ve Güvenlik

### Login Ekranı

**Dosya**: `Views/LoginWindow.axaml`, `ViewModels/LoginViewModel.cs`

**Özellikler**:
- Kullanıcı adı ve şifre girişi
- Hata mesajı gösterimi (kırmızı text)
- Loading state (IsBusy) - buton disable olur
- Varsayılan değerler: `admin` / `123456`

**ViewModel Property'leri**:
- `Username: string` (varsayılan: "admin")
- `Password: string` (varsayılan: "123456")
- `ErrorMessage: string?`
- `IsBusy: bool`

**Komutlar**:
- `LoginCommand`: `IAuthService.LoginAsync` çağırır, başarılı olursa `DashboardViewModel`'e yönlendirir

**API Endpoint**:
- `POST /auth/login`
- Request Body: `{ "username": "...", "password": "..." }`
- Response: `{ "token": "<JWT>", "user": { ... } }`

**Token Yönetimi**:
- Token `ITokenStore` (InMemoryTokenStore) içinde saklanır
- Tüm API isteklerinde `Authorization: Bearer <token>` header'ı otomatik eklenir
- Token expire olursa kullanıcıdan tekrar login istenir

---

## 📊 Dashboard (Ana Ekran)

**Dosya**: `Views/DashboardView.axaml`, `ViewModels/DashboardViewModel.cs`

### İstatistik Kartları

1. **Aktif Sözleşmeler**
   - Sayı: `ActiveContractsCount: int`
   - Renk: Yeşil (#22c55e)
   - İkon: 📋

2. **Toplam Müşteri**
   - Sayı: `TotalCustomersCount: int`
   - Renk: Mavi (#3b82f6)
   - İkon: 👥

3. **Kirada Olan Malzeme**
   - Sayı: `ItemsOnRentCount: int` (tüm envanterdeki `OnRent` toplamı)
   - Renk: Turuncu (#f59e0b)
   - İkon: 📦

4. **Toplam Gelir**
   - Tutar: `TotalRevenue: decimal` (tamamlanan sözleşmelerin `FinalCalculatedPrice` toplamı)
   - Format: `₺{0:N0}`
   - Renk: Mor (#a855f7)
   - İkon: 💰

### Bu Ay Özeti (Büyük Panel)

**Bileşenler**:
- **Aylık Gelir**: `MonthlyRevenue: decimal` (bu ay tamamlanan sözleşmelerin toplam fiyatı)
- **Tamamlanan Sözleşme**: `CompletedContractsThisMonth: int` (bu ay `ActualEndDate` olan sözleşmeler)
- **Toplam Envanter**: `TotalInventoryCount: int` (tüm envanter kalem sayısı)

**Hesaplama Mantığı**:
```csharp
var thisMonth = DateTime.Now.Month;
var thisYear = DateTime.Now.Year;
var completedThisMonth = completedContracts
    .Where(c => c.ActualEndDate.HasValue && 
               c.ActualEndDate.Value.Month == thisMonth && 
               c.ActualEndDate.Value.Year == thisYear)
    .ToList();
```

### Dikkat Gerektiren Sözleşmeler (Sol Panel)

**Veri Kaynağı**: `UpcomingExpirations: ObservableCollection<ContractAlert>`

**Alert Tipleri**:
- **Overdue (Gecikmiş)**: `PlannedEndDate < DateTime.Today`
  - Renk: Kırmızı (#ef4444)
  - Mesaj: `"{Math.Abs(DaysRemaining)} gün gecikmiş!"`
  
- **Critical (Kritik)**: `PlannedEndDate - DateTime.Today <= 2 gün`
  - Renk: Turuncu (#f59e0b)
  - Mesaj: `"Bugün bitiyor!"` veya `"{DaysRemaining} gün kaldı"`
  
- **Warning (Uyarı)**: `PlannedEndDate - DateTime.Today <= 7 gün` (ama > 2)
  - Renk: Mavi (#3b82f6)
  - Mesaj: `"{DaysRemaining} gün kaldı"`

**Gösterilen Bilgiler**:
- Müşteri adı
- Bitiş tarihi (dd.MM.yyyy formatında)
- Alert mesajı (renkli badge)

**Sıralama**: Önce gecikmişler, sonra yaklaşanlar (tarihe göre artan)

**Limit**: En fazla 5 adet gösterilir

### Son Sözleşmeler (Sağ Panel)

**Veri Kaynağı**: `RecentContracts: ObservableCollection<Contract>`

**Gösterilen Bilgiler**:
- Müşteri adı
- Tarih aralığı: `StartDate - PlannedEndDate` (dd.MM.yyyy formatında)
- Toplam tutar: `InitialTotalPrice` (₺{0:N0} formatında, yeşil renk)
- Durum badge: "Aktif" (mavi) veya "Tamamlandı" (yeşil)

**Sıralama**: `StartDate`'e göre azalan (en yeni önce)

**Limit**: En fazla 5 adet gösterilir

### Düşük Stok Uyarıları

**Veri Kaynağı**: `LowStockItems: ObservableCollection<Inventory>`

**Hesaplama Mantığı**:
```csharp
var lowStock = inventory
    .Where(i => i.TotalStock > 0 && 
               (i.TotalStock - i.OnRent) <= i.TotalStock * 0.2m)
    .Take(5)
    .ToList();
```

**Kriter**: Müsait stok (TotalStock - OnRent) toplam stokun %20'sinin altındaysa

**Limit**: En fazla 5 adet gösterilir

### Komutlar

- `RefreshCommand`: Tüm dashboard verilerini yeniden yükler

---

## 👥 Müşteri Yönetimi

**Dosya**: `Views/CustomersView.axaml`, `ViewModels/CustomersViewModel.cs`

### Liste Görünümü

**Tablo Kolonları**:
1. **Müşteri Adı** (2x genişlik)
   - `Name`
   - Alt satırda: `TaxId` (varsa, "VN: {TaxId}" formatında, gri)

2. **Telefon** (1x genişlik)
   - `PhoneNumber`

3. **E-posta** (1.5x genişlik)
   - `Email` (opacity: 0.8)

4. **Sözleşme Sayısı** (1x genişlik, ortalanmış)
   - `Contracts.Count` (mavi badge içinde)

**Boş Durum**: 
- İkon: 👥
- Mesaj: "Henüz müşteri bulunmuyor"
- Alt mesaj: "Yeni müşteri eklemek için yukarıdaki butonu kullanın"

### Arama Özelliği

**Input**: `SearchText: string`

**Arama Kriterleri**:
- Müşteri adı (`Name.Contains`)
- E-posta (`Email.Contains`)
- Telefon (`PhoneNumber.Contains`)

**Komut**: `SearchCommand`
- Boşsa: Tüm listeyi yükler
- Doluysa: `ICustomerService.SearchAsync(SearchText)` çağırır

### Müşteri Detay Penceresi

**Dosya**: `Views/CustomerDetailWindow.axaml`, `ViewModels/CustomerDetailViewModel.cs`

**Form Alanları**:
1. **Müşteri Adı** (zorunlu)
   - `Name: string`
   - Watermark: "Müşteri veya firma adını girin"

2. **Vergi Numarası** (opsiyonel)
   - `TaxId: string`
   - Watermark: "Vergi numarası (opsiyonel)"

3. **Telefon Numarası** (opsiyonel)
   - `PhoneNumber: string`
   - Watermark: "0xxx xxx xx xx"

4. **E-posta Adresi** (opsiyonel)
   - `Email: string`
   - Watermark: "ornek@email.com"

5. **Adres** (opsiyonel)
   - `Address: string`
   - Multi-line (AcceptsReturn, TextWrapping)
   - Height: 100px
   - Watermark: "Tam adres bilgisi"

**Görüntüleme Modu** (IsReadOnly = true):
- Tüm alanlar readonly
- "Düzenle" butonu gösterilir
- İstatistik paneli gösterilir:
  - Toplam Sözleşme: `TotalContracts: int`
  - Aktif Sözleşme: `ActiveContracts: int`
  - Müşteri ID: `CustomerId: int`

**Düzenleme Modu** (IsReadOnly = false):
- Tüm alanlar düzenlenebilir
- "Kaydet" butonu gösterilir
- "Sil" butonu gösterilir (sadece mevcut müşteri için)

**Butonlar**:
- **Sil** (kırmızı, danger class): Sadece mevcut müşteri için, `CanDelete` true ise
- **İptal** (gri, secondary class): Pencereyi kapatır
- **Düzenle** (mavi, primary class): `IsReadOnly = false` yapar
- **Kaydet** (mavi, primary class): 
  - Yeni müşteri: `ICustomerService.CreateAsync`
  - Mevcut müşteri: `ICustomerService.UpdateAsync`

**Window Özellikleri**:
- Width: 550px
- Height: 650px
- CanResize: false
- WindowStartupLocation: CenterOwner

### Komutlar

- `AddNewCommand`: Yeni müşteri dialog'u açar
- `OpenCustomerDetailAsync(Customer)`: Müşteri detay dialog'u açar
- `SearchCommand`: Arama yapar
- `RefreshCommand`: Listeyi yeniler

### API Endpoint'leri

- `GET /customers`: Tüm müşterileri getirir
- `GET /customers/{id}`: Tek müşteri getirir
- `POST /customers`: Yeni müşteri oluşturur
  - Body: `{ "Name": "...", "TaxId": "...?", "PhoneNumber": "...?", "Email": "...?", "Address": "...?" }`
  - Response: `{ "CustomerId": <id> }`
- `PATCH /customers/{id}`: Müşteri günceller
- `DELETE /customers/{id}`: Müşteri siler (204 No Content)

---

## 📦 Envanter Yönetimi

**Dosya**: `Views/InventoryView.axaml`, `ViewModels/InventoryViewModel.cs`

### Liste Görünümü

**Tablo Kolonları**:
1. **Malzeme Adı** (2x genişlik)
   - `ItemName`
   - Alt satırda: `PurchasePrice` ("Alış: ₺{0:N2}" formatında, gri)

2. **Kategori** (1x genişlik)
   - `Category.CategoryName`

3. **Stok** (1x genişlik, ortalanmış)
   - `TotalStock` (kalın, büyük font)

4. **Kirada** (1x genişlik, ortalanmış)
   - `OnRent` (turuncu renk, #f59e0b)

5. **Günlük Fiyat** (1x genişlik, sağa hizalı)
   - `DailyPrice` (₺{0:N2} formatında, yeşil, kalın)

6. **Durum** (80px genişlik, ortalanmış)
   - Badge: `OnRent/TotalStock` formatında (mavi arka plan, #60a5fa renk)

**Boş Durum**:
- İkon: 📦
- Mesaj: "Henüz envanter kalemi bulunmuyor"
- Alt mesaj: "Önce kategori, sonra malzeme ekleyin"

### Filtreleme

**Kategori Filtresi**:
- ComboBox: `Categories: ObservableCollection<MaterialCategory>`
- Seçilen: `SelectedCategory: MaterialCategory?`
- Placeholder: "Tüm Kategoriler"
- Komut: `FilterByCategoryCommand`
  - Seçili kategori yoksa: Tüm listeyi yükler
  - Seçili kategori varsa: `IInventoryService.GetByCategoryAsync(categoryId)` çağırır

### Kategori Yönetimi

**Dialog**: `Views/CategoryDetailWindow.axaml`

**Form Alanları**:
1. **Kategori Adı** (zorunlu)
   - `CategoryName: string`
   - Watermark: "Örn: Cephe İskelesi"

2. **Kiralama Birimi** (opsiyonel)
   - `RentalUnit: string?`
   - Watermark: "Örn: adet, metre, m²"

**Butonlar**:
- İptal: Pencereyi kapatır
- Kaydet: `IInventoryService.CreateCategoryAsync` çağırır

**Window Özellikleri**:
- Width: 450px
- Height: 350px
- CanResize: false

### Malzeme Detay Penceresi

**Dosya**: `Views/InventoryDetailWindow.axaml`, `ViewModels/InventoryDetailViewModel.cs`

**Form Alanları**:
1. **Malzeme Adı** (zorunlu)
   - `ItemName: string`
   - Watermark: "Örn: Cephe İskelesi 1.5m"

2. **Kategori** (zorunlu)
   - `SelectedCategory: MaterialCategory?`
   - ComboBox: `Categories: ObservableCollection<MaterialCategory>`
   - Placeholder: "Kategori seçin"

3. **Stok Bilgileri** (yan yana 2 kolon)
   - **Toplam Stok**: `TotalStock: int` (NumericUpDown, min: 0)
   - **Kirada Olan**: `OnRent: int` (NumericUpDown, min: 0)

4. **Fiyat Bilgileri** (yan yana 2 kolon)
   - **Günlük Kira**: `DailyPrice: decimal` (NumericUpDown, min: 0, format: N2)
   - **Alış Fiyatı**: `PurchasePrice: decimal` (NumericUpDown, min: 0, format: N2)

**Görüntüleme Modu** (IsReadOnly = true):
- Tüm alanlar readonly
- "Düzenle" butonu gösterilir
- İstatistik paneli gösterilir:
  - **Toplam**: `TotalStock` (mavi)
  - **Kirada**: `OnRent` (turuncu)
  - **Müsait**: `AvailableStock = TotalStock - OnRent` (yeşil)

**Düzenleme Modu** (IsReadOnly = false):
- Tüm alanlar düzenlenebilir
- "Kaydet" butonu gösterilir
- "Sil" butonu gösterilir (sadece mevcut malzeme için)

**Butonlar**:
- **Sil** (kırmızı): Sadece mevcut malzeme için
- **İptal** (gri): Pencereyi kapatır
- **Düzenle** (mavi): `IsReadOnly = false` yapar
- **Kaydet** (mavi):
  - Yeni malzeme: `IInventoryService.CreateAsync`
  - Mevcut malzeme: `IInventoryService.UpdateAsync`

**Window Özellikleri**:
- Width: 550px
- Height: 700px
- CanResize: false

### Komutlar

- `AddNewItemCommand`: Yeni malzeme dialog'u açar
- `OpenItemDetailAsync(Inventory)`: Malzeme detay dialog'u açar
- `AddCategoryCommand`: Yeni kategori dialog'u açar
- `FilterByCategoryCommand`: Kategoriye göre filtreler
- `RefreshCommand`: Listeyi yeniler, kategori filtresini temizler

### API Endpoint'leri

**Envanter**:
- `GET /inventory`: Tüm envanter kalemlerini getirir
- `GET /inventory/{id}`: Tek kalem getirir
- `POST /inventory`: Yeni kalem oluşturur
  - Body: `{ "CategoryId": 1, "ItemName": "...", "TotalStock": 100, "OnRent": 0, "DailyPrice": 5.0, "PurchasePrice": 7.0 }`
  - Response: `{ "ItemId": <id> }`
- `PATCH /inventory/{id}`: Kalem günceller
- `DELETE /inventory/{id}`: Kalem siler
- `GET /inventory/{id}/price-tiers`: İlgili fiyat kademelerini getirir

**Kategoriler**:
- `GET /categories`: Tüm kategorileri getirir
- `POST /categories`: Yeni kategori oluşturur
  - Body: `{ "CategoryName": "...", "RentalUnit": "...?" }`
  - Response: `{ "CategoryId": <id> }`
- `PATCH /categories/{id}`: Kategori günceller
- `DELETE /categories/{id}`: Kategori siler

---

## 📋 Sözleşme Yönetimi

**Dosya**: `Views/ContractsView.axaml`, `ViewModels/ContractsViewModel.cs`

### Liste Görünümü

**Tablo Kolonları**:
1. **ID** (80px genişlik)
   - `ContractId` (#{ContractId} formatında)

2. **Müşteri** (2x genişlik)
   - `Customer.Name` (kalın)
   - Alt satırda: `Customer.PhoneNumber` (gri, küçük)

3. **Başlangıç** (1x genişlik)
   - `StartDate` (dd.MM.yyyy formatında)

4. **Bitiş** (1x genişlik)
   - `PlannedEndDate` (dd.MM.yyyy formatında)

5. **Tutar** (1x genişlik, sağa hizalı)
   - `InitialTotalPrice` (₺{0:N2} formatında, yeşil, kalın)

6. **Durum** (100px genişlik, ortalanmış)
   - Badge: "Aktif" (mavi arka plan, #1e3a5f) veya "Tamamlandı" (yeşil arka plan, #14532d)
   - Text: Beyaz veya açık yeşil (#86efac)

**Boş Durum**:
- İkon: 📋
- Mesaj: "Henüz sözleşme bulunmuyor"
- Alt mesaj: "Yeni bir kiralama sözleşmesi oluşturun"

### Filtreleme

**Durum Filtresi**:
- ComboBox: `StatusFilters: ObservableCollection<string>`
  - "Tümü"
  - "Aktif"
  - "Tamamlanan"
- Seçilen: `FilterStatus: string` (varsayılan: "Tümü")
- Komut: `FilterByStatusCommand`
  - "Aktif": `IContractService.GetActiveContractsAsync()` (IsCompleted = false)
  - "Tamamlanan": `IContractService.GetCompletedContractsAsync()` (IsCompleted = true)
  - "Tümü": `IContractService.GetAllAsync()`

### Sözleşme Detay Penceresi

**Dosya**: `Views/ContractDetailWindow.axaml`, `ViewModels/ContractDetailViewModel.cs`

**Form Alanları**:
1. **Müşteri Seçimi** (zorunlu)
   - `SelectedCustomer: Customer?`
   - ComboBox: `Customers: ObservableCollection<Customer>`
   - Placeholder: "Müşteri seçin"

2. **Tarihler** (yan yana 2 kolon)
   - **Başlangıç Tarihi**: `StartDate: DateTime` (DatePicker, varsayılan: DateTime.Today)
   - **Planlanan Bitiş**: `PlannedEndDate: DateTime` (DatePicker, varsayılan: DateTime.Today.AddDays(30))

3. **Süre Bilgisi** (info paneli, mavi arka plan)
   - **Planlanan Süre**: `PlannedDays: int` (hesaplanan: `(PlannedEndDate - StartDate).TotalDays`)
   - **Gerçekleşen Süre**: `ActualDays: int` (sadece tamamlanan sözleşmeler için görünür)
   - **Durum**: "Aktif" veya "Tamamlandı"

4. **Malzeme Ekleme** (sadece düzenleme modunda görünür)
   - ComboBox: `AvailableItems: ObservableCollection<Inventory>`
   - NumericUpDown: Miktar (varsayılan: 1, min: 1)
   - "Ekle" butonu: Seçili malzemeyi ve miktarı `ContractItems` listesine ekler
   - Eğer aynı malzeme zaten varsa, miktarı artırır

5. **Kiralanan Malzemeler Listesi**
   - Her item için:
     - Malzeme adı (`ItemName`)
     - Günlük fiyat (`DailyPriceAtRent`, ₺{0:N2}/gün formatında)
     - Miktar (`RentedQuantity`, "{0} adet" formatında)
     - Toplam (`DailyPriceAtRent * RentedQuantity`, ₺{0:N2} formatında, yeşil)
     - Sil butonu (✕, kırmızı)

6. **Fiyat Özeti**
   - **Toplam Tutar**: `InitialTotalPrice: decimal`
   - Hesaplama: `ContractItems.Sum(ci => ci.DailyPriceAtRent * ci.RentedQuantity * PlannedDays)`
   - Format: ₺{0:N2}, büyük font, yeşil renk
   - Alt açıklama: "(Planlanan süre üzerinden)"

7. **Final Tutar** (sadece tamamlanan sözleşmeler için görünür)
   - `FinalCalculatedPrice: decimal?`
   - Yeşil arka plan (#14532d), açık yeşil text (#86efac)
   - Alt açıklama: "(Gerçekleşen süre üzerinden)"

**Görüntüleme Modu** (IsReadOnly = true):
- Tüm alanlar readonly
- "Düzenle" butonu gösterilir
- Malzeme ekleme paneli gizlenir

**Düzenleme Modu** (IsReadOnly = false):
- Tüm alanlar düzenlenebilir
- "Kaydet" butonu gösterilir
- "Sil" butonu gösterilir (sadece mevcut sözleşme için, tamamlanmamışsa)
- "Tamamla" butonu gösterilir (sadece mevcut sözleşme için, tamamlanmamışsa)

**Butonlar**:
- **Sil** (kırmızı): Sadece mevcut ve tamamlanmamış sözleşme için (`CanDelete`)
- **Tamamla** (yeşil, success class): `IContractService.CompleteContractAsync(contractId, DateTime.Today)` çağırır
- **İptal** (gri): Pencereyi kapatır
- **Düzenle** (mavi): `IsReadOnly = false` yapar
- **Kaydet** (mavi):
  - Yeni sözleşme: `IContractService.CreateAsync`
  - Mevcut sözleşme: `IContractService.UpdateAsync`

**Window Özellikleri**:
- Width: 750px
- Height: 850px
- CanResize: false

**ContractDetailViewModel Özellikleri**:
- `ContractItems: ObservableCollection<ContractDetailItem>`
  - `DetailId: int`
  - `Item: Inventory?`
  - `ItemId: int`
  - `RentedQuantity: int`
  - `ReturnedQuantity: int`
  - `DailyPriceAtRent: decimal`
  - `ItemName: string` (computed: `Item?.ItemName ?? "Bilinmiyor"`)

### Komutlar

- `AddNewContractCommand`: Yeni sözleşme dialog'u açar
- `OpenContractDetailAsync(Contract)`: Sözleşme detay dialog'u açar
- `FilterByStatusCommand`: Duruma göre filtreler
- `RefreshCommand`: Listeyi yeniler, filtreyi "Tümü" yapar

### API Endpoint'leri

- `GET /contracts`: Tüm sözleşmeleri getirir
- `GET /contracts/{id}`: Tek sözleşme getirir (detaylarıyla birlikte)
  - Response: `{ ..., details: [ { DetailId, ContractId, ItemId, RentedQuantity, ReturnedQuantity, DailyPriceAtRent } ] }`
- `POST /contracts`: Yeni sözleşme oluşturur
  - Body:
    ```json
    {
      "CustomerId": 1,
      "StartDate": "2025-12-20T00:00:00Z",
      "PlannedEndDate": "2025-12-30T00:00:00Z",
      "InitialTotalPrice": 1000.00,
      "IsCompleted": false,
      "details": [
        { "ItemId": 1, "RentedQuantity": 10, "ReturnedQuantity": 0, "DailyPriceAtRent": 5.0 }
      ]
    }
    ```
  - Response: `{ "ContractId": <id> }`
- `PATCH /contracts/{id}`: Sözleşme günceller
- `DELETE /contracts/{id}`: Sözleşme siler
- `CompleteContractAsync`: `PATCH /contracts/{id}` ile `ActualEndDate` ve `IsCompleted = true` set eder

---

## 💰 Fiyat Tarifeleri

**Dosya**: `Views/PriceTiersView.axaml`, `ViewModels/PriceTiersViewModel.cs`

### Liste Görünümü

**Tablo Kolonları**:
1. **Malzeme** (2x genişlik)
   - `Item.ItemName` (kalın)
   - Alt satırda: `Item.DailyPrice` ("Günlük: ₺{0:N2}" formatında, gri)

2. **Min Gün** (1x genişlik, ortalanmış)
   - `MinDays` ("{0} gün" formatında)

3. **Max Gün** (1x genişlik, ortalanmış)
   - `MaxDays` ("{0} gün" formatında)

4. **Çarpan** (1x genişlik, ortalanmış)
   - `PriceMultiplier` (x{0:N2} formatında, mavi badge içinde)

**Boş Durum**:
- İkon: 💰
- Mesaj: "Henüz fiyat tarifesi bulunmuyor"
- Alt mesaj: "Süreye göre fiyat çarpanları tanımlayın"

### Filtreleme

**Malzeme Filtresi**:
- ComboBox: `InventoryItems: ObservableCollection<Inventory>`
- Seçilen: `SelectedInventoryFilter: Inventory?`
- Placeholder: "Tüm Malzemeler"
- Komut: `FilterByItemCommand`
  - Seçili malzeme yoksa: Tüm listeyi yükler
  - Seçili malzeme varsa: `IPriceTierService.GetByItemAsync(itemId)` çağırır

### Fiyat Tarifesi Detay Penceresi

**Dosya**: `Views/PriceTierDetailWindow.axaml`

**Form Alanları**:
1. **Malzeme Seçimi** (zorunlu)
   - ComboBox: `InventoryItems`
   - Placeholder: "Malzeme seçin"
   - Item template: `ItemName (₺DailyPrice/gün)` formatında

2. **Gün Aralığı** (yan yana 2 kolon)
   - **Minimum Gün**: NumericUpDown (varsayılan: 1, min: 1)
   - **Maksimum Gün**: NumericUpDown (varsayılan: 30, min: 1)

3. **Fiyat Çarpanı** (zorunlu)
   - NumericUpDown (varsayılan: 1.0, min: 0.1, max: 10, increment: 0.1, format: N2)

4. **Açıklama Paneli** (mavi arka plan, #1e3a5f)
   - Başlık: "ℹ️ Fiyat Çarpanı Nasıl Çalışır?"
   - Açıklama: "Kiralama süresi bu aralığa düştüğünde, günlük fiyat bu çarpan ile çarpılır."
   - Örnek: "1.0 = Normal fiyat, 0.8 = %20 indirim, 1.2 = %20 zam"

**Butonlar**:
- **Sil** (kırmızı): Sadece mevcut tarife için (code-behind'da kontrol edilir)
- **İptal** (gri): Pencereyi kapatır
- **Kaydet** (mavi): 
  - Yeni tarife: `IPriceTierService.CreateAsync`
  - Mevcut tarife: `IPriceTierService.UpdateAsync`

**Window Özellikleri**:
- Width: 500px
- Height: 550px
- CanResize: false

### Komutlar

- `AddNewPriceTierCommand`: Yeni tarife dialog'u açar
- `OpenPriceTierDetailAsync(PriceTier)`: Tarife detay dialog'u açar
- `FilterByItemCommand`: Malzemeye göre filtreler
- `RefreshCommand`: Listeyi yeniler, filtreyi temizler

### API Endpoint'leri

- `GET /price-tiers?itemId=`: Tüm tarifeleri veya belirli malzeme için tarifeleri getirir
- `GET /price-tiers/{id}`: Tek tarife getirir
- `POST /price-tiers`: Yeni tarife oluşturur
  - Body: `{ "ItemId": 1, "MinDays": 1, "MaxDays": 7, "PriceMultiplier": 1.0 }`
  - Response: `{ "TierId": <id> }`
- `PATCH /price-tiers/{id}`: Tarife günceller
- `DELETE /price-tiers/{id}`: Tarife siler

### Fiyat Hesaplama Mantığı

`IPriceTierService.GetPriceMultiplierForDaysAsync(itemId, days)`:
1. `GetByItemAsync(itemId)` çağırır
2. `MinDays <= days <= MaxDays` koşulunu sağlayan tarifeyi bulur
3. Bulursa `PriceMultiplier` döner, bulamazsa `1.0` döner

---

## ⚙️ Fiyatlandırma Kuralları

**Dosya**: `Views/PricingRulesView.axaml`, `ViewModels/PricingRulesViewModel.cs`

### Liste Görünümü

**Tablo Kolonları**:
1. **Kural Adı** (2x genişlik)
   - `RuleName` (kalın)
   - Alt satırda: `Description` (gri, karakter ellipsis ile kesilir)

2. **Tür** (1x genişlik)
   - `RuleType` (mavi badge içinde, converter ile Türkçe isim)
   - Converter: `RuleTypeNameConverter`
     - `EarlyReturnMultiplier` → "Erken İade"
     - `LateReturnPenalty` → "Geç İade"
     - `BulkDiscount` → "Toplu İndirim"
     - `LongTermDiscount` → "Uzun Süre"
     - `MinimumRentalFee` → "Min. Ücret"

3. **Değer** (1x genişlik, ortalanmış)
   - `Value` (yeşil, kalın, converter ile formatlanmış)
   - Converter: `RuleValueFormatConverter`
     - `EarlyReturnMultiplier` / `LateReturnPenalty` → `x{Value:N2}`
     - `BulkDiscount` / `LongTermDiscount` → `%{Value:N0}`
     - `MinimumRentalFee` → `₺{Value:N2}`

4. **Koşul** (1x genişlik, ortalanmış)
   - `MinDays+ gün / MinQuantity+ adet` formatında
   - Fallback: "-" (null ise)

5. **Durum** (100px genişlik, ortalanmış)
   - ToggleSwitch: `IsActive: bool`
   - OnContent: "Aktif", OffContent: "Pasif"
   - Toggle edildiğinde: `ToggleRuleActiveCommand` çağrılır

**Boş Durum**:
- İkon: ⚙️
- Mesaj: "Henüz fiyatlandırma kuralı bulunmuyor"
- Alt mesaj: "Yeni bir kural ekleyerek başlayın"

### Bilgi Paneli

**İçerik**:
- İkon: ℹ️
- Başlık: "Fiyatlandırma Kuralları Nasıl Çalışır?"
- Açıklama: "Kurallar sözleşme fiyatı hesaplanırken otomatik olarak uygulanır. Birden fazla kural aynı anda aktif olabilir."

### Fiyatlandırma Kuralı Detay Penceresi

**Dosya**: `Views/PricingRuleDetailWindow.axaml`

**Form Alanları**:
1. **Kural Adı** (zorunlu)
   - TextBox
   - Watermark: "Örn: Uzun Süreli Kiralama İndirimi"

2. **Kural Türü** (zorunlu)
   - ComboBox: `RuleTypes: ObservableCollection<PricingRuleTypeItem>`
   - Placeholder: "Kural türü seçin"
   - Item template:
     - Name (kalın)
     - Description (gri, küçük)
   - SelectionChanged event: `OnRuleTypeChanged` (değer label ve hint'i günceller)

3. **Değer** (zorunlu)
   - NumericUpDown (varsayılan: 1.0, min: 0, increment: 0.1, format: N2)
   - Label: `ValueLabel` (dinamik olarak değişebilir)
   - Hint: `ValueHint` (kural türüne göre açıklama)

4. **Koşullar** (opsiyonel, border içinde)
   - **Minimum Gün**: NumericUpDown (nullable, min: 1, watermark: "Yok")
   - **Maksimum Gün**: NumericUpDown (nullable, min: 1, watermark: "Yok")
   - **Minimum Miktar**: NumericUpDown (nullable, min: 1, watermark: "Yok")

5. **Açıklama** (opsiyonel)
   - TextBox (multi-line, height: 80px, TextWrapping)
   - Watermark: "Bu kuralın ne işe yaradığını açıklayın..."

6. **Kural Durumu** (border içinde)
   - ToggleSwitch: `IsActive` (varsayılan: true)
   - OnContent: "Aktif", OffContent: "Pasif"
   - Açıklama: "Pasif kurallar fiyat hesaplamasında kullanılmaz"

**Kural Türleri** (`PricingRuleTypeItem`):
1. **Erken İade Çarpanı** (`EarlyReturnMultiplier`)
   - Açıklama: "Erken iade durumunda uygulanacak fiyat çarpanı"
   - Değer formatı: Çarpan (örn: 1.2 = %20 fazla)

2. **Geç İade Cezası** (`LateReturnPenalty`)
   - Açıklama: "Geç iade durumunda uygulanacak ceza çarpanı"
   - Değer formatı: Çarpan (örn: 1.5 = %50 fazla)

3. **Toplu Kiralama İndirimi** (`BulkDiscount`)
   - Açıklama: "Belirli miktarın üzerinde indirim yüzdesi"
   - Değer formatı: Yüzde (örn: 10 = %10 indirim)

4. **Uzun Süreli İndirim** (`LongTermDiscount`)
   - Açıklama: "Belirli gün sayısının üzerinde indirim yüzdesi"
   - Değer formatı: Yüzde (örn: 15 = %15 indirim)

5. **Minimum Kiralama Ücreti** (`MinimumRentalFee`)
   - Açıklama: "Minimum alınacak kiralama ücreti"
   - Değer formatı: Tutar (örn: 100.00 = ₺100.00)

**Butonlar**:
- **Sil** (kırmızı): Sadece mevcut kural için (code-behind'da kontrol edilir)
- **İptal** (gri): Pencereyi kapatır
- **Kaydet** (mavi):
  - Yeni kural: `IPriceCalculationService.CreatePricingRuleAsync`
  - Mevcut kural: `IPriceCalculationService.UpdatePricingRuleAsync`

**Window Özellikleri**:
- Width: 550px
- Height: 650px
- CanResize: false

### Komutlar

- `AddNewRuleCommand`: Yeni kural dialog'u açar
- `OpenRuleDetailAsync(PricingRule)`: Kural detay dialog'u açar
- `ToggleRuleActiveAsync(PricingRule)`: Kuralın aktif/pasif durumunu değiştirir
- `RefreshCommand`: Listeyi yeniler

### API Endpoint'leri

- `GET /pricing-rules`: Tüm kuralları getirir
- `POST /pricing-rules`: Yeni kural oluşturur
  - Body:
    ```json
    {
      "RuleName": "...",
      "RuleType": 1,
      "Value": 0.1,
      "MinDays": 3,
      "MaxDays": 10,
      "MinQuantity": 1,
      "IsActive": true,
      "Description": "...?"
    }
    ```
  - Response: `{ "RuleId": <id> }`
- `PATCH /pricing-rules/{id}`: Kural günceller
- `DELETE /pricing-rules/{id}`: Kural siler

---

## 🎨 UI/UX Özellikleri

### Renk Paleti

**Ana Renkler**:
- Arka Plan: `#0f0f1a` (ana pencere), `#1a1a2e` (paneller), `#16162a` (sidebar, listeler)
- Birincil: `#3b82f6` (mavi, butonlar, vurgular)
- Başarı: `#22c55e` (yeşil, tamamlanan durumlar, fiyatlar)
- Uyarı: `#f59e0b` (turuncu, kirada olan malzemeler)
- Hata: `#dc2626` (kırmızı, sil butonları, gecikmiş sözleşmeler)
- Bilgi: `#60a5fa` (açık mavi, ikincil vurgular)
- Mor: `#a855f7` (toplam gelir kartı)

**Sidebar**:
- Arka Plan: `#16162a`
- Border: `#1e1e3a`
- Buton hover: `#2a2a4a`
- Buton seçili: `#3b82f6`
- Text: `#a0a0a0` (normal), `#ffffff` (hover/seçili)

### Tipografi

- Başlıklar: 28px, Bold
- Alt başlıklar: 13px, opacity 0.6
- Normal text: 14px
- Küçük text: 11-12px
- İstatistik sayıları: 36px, Bold (kartlarda), 20-24px (detaylarda)

### Buton Stilleri

**Primary (Mavi)**:
- Background: `#3b82f6`
- Hover: `#2563eb`
- Padding: 16px 10px (normal), 20px 12px (büyük)
- CornerRadius: 6-8px
- FontWeight: SemiBold

**Secondary (Gri)**:
- Background: `#374151`
- Hover: `#4b5563`
- Padding: 12px 8px

**Danger (Kırmızı)**:
- Background: `#dc2626`
- Hover: `#b91c1c`

**Success (Yeşil)**:
- Background: `#16a34a`
- Sadece "Tamamla" butonunda kullanılıyor

### Border ve Corner Radius

- Paneller: 12px corner radius
- Butonlar: 6-8px corner radius
- Badge'ler: 12px corner radius
- Input'lar: 6px corner radius

### Boş Durum (Empty State)

**Ortak Özellikler**:
- Büyük emoji ikon (48px)
- Ana mesaj (16px, opacity 0.5)
- Alt mesaj (12px, opacity 0.3)
- Ortalanmış, dikey olarak ortada

### Loading State

- `IsBusy: bool` property'si ile kontrol edilir
- Butonlar disable olur
- Şu an spinner/loading indicator yok (gelecekte eklenebilir)

### Responsive Design

- Minimum pencere boyutları:
  - MainWindow: 1000x600px
  - DetailWindow'lar: 450-750px genişlik, 300-850px yükseklik
- ScrollViewer kullanımı: Uzun içerikler için otomatik scroll

---

## 🔌 API Entegrasyonu

### Base URL

- Konfigürasyon: `appsettings.json` → `ExternalApi:BaseUrl`
- Varsayılan: `http://localhost:3000`

### Authentication

**Token Yönetimi**:
- `ITokenStore` interface'i (sadece `Token: string?` property'si)
- `InMemoryTokenStore` implementasyonu (singleton, RAM'de saklar)
- Tüm API isteklerinde `Authorization: Bearer <token>` header'ı otomatik eklenir

**Token Alma**:
- `POST /auth/login` → `{ "token": "...", "user": {...} }`
- Token `ITokenStore.Token` içine yazılır
- Token expire olursa kullanıcıdan tekrar login istenir

### API Client Yapısı

**Base Class**: `ApiClientBase`
- `HttpClient` + `IConfiguration` + `ITokenStore` alır
- `BaseAddress` otomatik set edilir
- `CreateRequest(HttpMethod, string)`: Token header'ını otomatik ekler
- `SendAsync(HttpRequestMessage)`: İstek/cevap loglarını konsola yazar

**Log Formatı**:
```
[API REQUEST] METHOD URL
[API REQUEST BODY] {...}
[API RESPONSE] StatusCode for URL
```

### Servis Implementasyonları

Tüm servisler `ApiClientBase`'den türer ve aynı pattern'i kullanır:

1. **AuthService**: Login işlemi
2. **CustomerApiService**: `/customers` endpoint'leri
3. **InventoryApiService**: `/inventory`, `/categories` endpoint'leri
4. **ContractApiService**: `/contracts` endpoint'leri
5. **PriceTierApiService**: `/price-tiers` endpoint'leri
6. **PriceCalculationApiService**: `/pricing-rules` endpoint'leri

### Hata Yönetimi

- `response.EnsureSuccessStatusCode()`: HTTP hata kodlarında exception fırlatır
- Try-catch blokları ViewModel'lerde, hata mesajları Debug.WriteLine ile loglanır
- UI'da kullanıcıya hata mesajı gösterilir (ör: Login ekranında "Giriş başarısız...")

### JSON Serialization

- `System.Text.Json` kullanılıyor
- `PropertyNameCaseInsensitive = true` (API PascalCase, C# camelCase uyumluluğu)
- DateTime formatı: ISO 8601 (API'den string olarak gelir, otomatik deserialize edilir)

---

## 📊 Veri Modelleri

### Entity'ler (IskeleTakip.Core.Entities)

#### Customer
```csharp
public class Customer
{
    public int CustomerId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? TaxId { get; set; }
    public string? PhoneNumber { get; set; }
    public string? Email { get; set; }
    public string? Address { get; set; }
    public virtual ICollection<Contract> Contracts { get; set; } = new List<Contract>();
}
```

#### Inventory
```csharp
public class Inventory
{
    public int ItemId { get; set; }
    public int CategoryId { get; set; }
    public string ItemName { get; set; } = string.Empty;
    public int TotalStock { get; set; }
    public int OnRent { get; set; }
    public decimal DailyPrice { get; set; }
    public decimal PurchasePrice { get; set; }
    public virtual MaterialCategory Category { get; set; } = null!;
    public virtual ICollection<PriceTier> PriceTiers { get; set; } = new List<PriceTier>();
    public virtual ICollection<ContractDetail> ContractDetails { get; set; } = new List<ContractDetail>();
}
```

#### MaterialCategory
```csharp
public class MaterialCategory
{
    public int CategoryId { get; set; }
    public string CategoryName { get; set; } = string.Empty;
    public string? RentalUnit { get; set; } // adet, metre, m2 vb.
    public virtual ICollection<Inventory> Inventories { get; set; } = new List<Inventory>();
}
```

#### Contract
```csharp
public class Contract
{
    public int ContractId { get; set; }
    public int CustomerId { get; set; }
    public DateTime StartDate { get; set; }
    public DateTime PlannedEndDate { get; set; }
    public DateTime? ActualEndDate { get; set; }
    public decimal InitialTotalPrice { get; set; }
    public decimal? FinalCalculatedPrice { get; set; }
    public bool IsCompleted { get; set; } = false;
    public virtual Customer Customer { get; set; } = null!;
    public virtual ICollection<ContractDetail> ContractDetails { get; set; } = new List<ContractDetail>();
}
```

#### ContractDetail
```csharp
public class ContractDetail
{
    public int DetailId { get; set; }
    public int ContractId { get; set; }
    public int ItemId { get; set; }
    public int RentedQuantity { get; set; }
    public int ReturnedQuantity { get; set; } = 0;
    public decimal DailyPriceAtRent { get; set; }
    public virtual Contract Contract { get; set; } = null!;
    public virtual Inventory Item { get; set; } = null!;
}
```

#### PriceTier
```csharp
public class PriceTier
{
    public int TierId { get; set; }
    public int ItemId { get; set; }
    public int MinDays { get; set; }
    public int MaxDays { get; set; }
    public decimal PriceMultiplier { get; set; }
    public virtual Inventory Item { get; set; } = null!;
}
```

#### PricingRule
```csharp
public class PricingRule
{
    public int RuleId { get; set; }
    public string RuleName { get; set; } = string.Empty;
    public PricingRuleType RuleType { get; set; }
    public decimal Value { get; set; }
    public int? MinDays { get; set; }
    public int? MaxDays { get; set; }
    public int? MinQuantity { get; set; }
    public bool IsActive { get; set; } = true;
    public string? Description { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public enum PricingRuleType
{
    EarlyReturnMultiplier = 1,  // Erken iade çarpanı
    LateReturnPenalty = 2,      // Geç iade cezası
    BulkDiscount = 3,           // Toplu kiralama indirimi
    LongTermDiscount = 4,       // Uzun süreli indirim
    MinimumRentalFee = 5         // Minimum kiralama ücreti
}
```

### Modeller (IskeleTakip.Core.Models)

#### LoginResponse
```csharp
public class LoginResponse
{
    public string Token { get; set; } = string.Empty;
    public LoginUserDto User { get; set; } = null!;
}

public class LoginUserDto
{
    public int UserId { get; set; }
    public string Username { get; set; } = string.Empty;
    public int RoleId { get; set; }
    public string RoleName { get; set; } = string.Empty;
    public Dictionary<string, string> Permissions { get; set; } = new();
}
```

#### PriceCalculationResult
```csharp
public class PriceCalculationResult
{
    public decimal BasePrice { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal PenaltyAmount { get; set; }
    public decimal FinalPrice { get; set; }
    public int TotalDays { get; set; }
    public int PlannedDays { get; set; }
    public int DaysDifference { get; set; }
    public bool IsEarlyReturn => DaysDifference > 0;
    public bool IsLateReturn => DaysDifference < 0;
    public List<PriceBreakdownItem> Breakdown { get; set; } = new();
    public DateTime CalculatedAt { get; set; } = DateTime.Now;
}

public class PriceBreakdownItem
{
    public string Description { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public PriceBreakdownType Type { get; set; }
}

public enum PriceBreakdownType
{
    BasePrice,
    TierMultiplier,
    EarlyReturnAdjustment,
    LateReturnPenalty,
    BulkDiscount,
    LongTermDiscount,
    MinimumFee
}
```

### ViewModel Helper Sınıfları

#### ContractAlert
```csharp
public class ContractAlert
{
    public Contract Contract { get; set; } = null!;
    public int DaysRemaining { get; set; }
    public AlertType AlertType { get; set; }
    public string AlertMessage => AlertType switch
    {
        AlertType.Overdue => $"{Math.Abs(DaysRemaining)} gün gecikmiş!",
        AlertType.Critical => DaysRemaining == 0 ? "Bugün bitiyor!" : $"{DaysRemaining} gün kaldı",
        AlertType.Warning => $"{DaysRemaining} gün kaldı",
        _ => ""
    };
}

public enum AlertType
{
    Warning,
    Critical,
    Overdue
}
```

#### ContractDetailItem
```csharp
public partial class ContractDetailItem : ObservableObject
{
    public int DetailId { get; set; }
    public Inventory? Item { get; set; }
    public int ItemId { get; set; }
    public int RentedQuantity { get; set; }
    public int ReturnedQuantity { get; set; }
    public decimal DailyPriceAtRent { get; set; }
    public string ItemName => Item?.ItemName ?? "Bilinmiyor";
}
```

#### PricingRuleTypeItem
```csharp
public class PricingRuleTypeItem
{
    public PricingRuleType Type { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
}
```

---

## 🔧 Teknik Detaylar

### Dependency Injection

**Kayıtlar** (`App.axaml.cs`):
```csharp
services.AddSingleton<IConfiguration>(configuration);
services.AddSingleton<ITokenStore, InMemoryTokenStore>();
services.AddSingleton<INavigationService, NavigationService>(...);
services.AddHttpClient<IAuthService, AuthService>();
services.AddHttpClient<ICustomerService, CustomerApiService>();
services.AddHttpClient<IInventoryService, InventoryApiService>();
services.AddHttpClient<IContractService, ContractApiService>();
services.AddHttpClient<IPriceTierService, PriceTierApiService>();
services.AddHttpClient<IPriceCalculationService, PriceCalculationApiService>();
services.AddTransient<MainWindowViewModel>();
services.AddTransient<LoginViewModel>();
services.AddTransient<DashboardViewModel>();
// ... diğer ViewModel'ler
```

### Navigation Service

**Interface**:
```csharp
public interface INavigationService
{
    ViewModelBase CurrentView { get; }
    void NavigateTo<TViewModel>() where TViewModel : ViewModelBase;
}
```

**Kullanım**:
- `MainWindowViewModel` içinde `CurrentView` property'si `NavigationService.CurrentView`'i dinler
- `NavigateTo<TViewModel>()` ile farklı ekranlara geçilir
- ViewLocator otomatik olarak ViewModel → View mapping yapar

### ViewLocator

**Mantık**:
- ViewModel sınıf adındaki "ViewModel" kısmı "View" ile değiştirilir
- Örnek: `DashboardViewModel` → `DashboardView`
- Reflection ile view instance'ı oluşturulur

### Converter'lar

#### ContractStatusConverters
- `ContractStatusBackgroundConverter`: IsCompleted'a göre arka plan rengi
- `ContractStatusForegroundConverter`: IsCompleted'a göre text rengi
- `ContractStatusTextConverter`: IsCompleted'a göre "Aktif" / "Tamamlandı" text'i

#### DashboardConverters
- `AlertTypeToColorConverter`: AlertType'a göre renk (#ef4444, #f59e0b, #3b82f6)
- `BoolToStatusColorConverter`: IsCompleted'a göre renk
- `BoolToStatusTextConverter`: IsCompleted'a göre text

#### PricingRuleConverters
- `RuleTypeNameConverter`: PricingRuleType'a göre Türkçe isim
- `RuleValueFormatConverter`: RuleType ve Value'ya göre formatlanmış değer (x1.20, %10, ₺100.00)

### Event-Based Dialog Yönetimi

**Pattern**:
- ViewModel'lerde `event Func<..., Task<object?>>? ShowXxxDialog` tanımlanır
- View (code-behind) bu event'i handle eder ve gerçek dialog penceresini açar
- Dialog sonucu ViewModel'e geri döner

**Örnek**:
```csharp
// ViewModel
public event Func<Customer?, bool, Task<object?>>? ShowCustomerDialog;

// View (code-behind)
if (vm.ShowCustomerDialog != null)
{
    var result = await vm.ShowCustomerDialog(customer, isNew);
    // result'ı handle et
}
```

### ObservableCollection Kullanımı

Tüm listeler `ObservableCollection<T>` kullanır:
- UI otomatik olarak değişiklikleri algılar
- Add/Remove/Update işlemleri anında UI'da görünür
- `RefreshCommand` ile tüm liste yeniden yüklenir

### Async/Await Pattern

Tüm veri yükleme ve API çağrıları async:
- `LoadXxxAsync()` metodları ViewModel constructor'larında `_ = LoadXxxAsync();` şeklinde çağrılır (fire-and-forget)
- Komutlar `async Task` döner
- Hata yönetimi try-catch ile yapılır

### ReadOnly Modu

Detay pencerelerinde iki mod var:
- **ReadOnly (Görüntüleme)**: Tüm alanlar disabled, "Düzenle" butonu gösterilir
- **Edit (Düzenleme)**: Tüm alanlar enabled, "Kaydet" ve "Sil" butonları gösterilir

`IsReadOnly: bool` property'si ile kontrol edilir.

---

## 📝 Önemli Notlar

### API Mapping

- API'den gelen field isimleri **PascalCase** (örn: `CustomerId`, `ItemName`)
- C# entity'lerde de **PascalCase** kullanılıyor
- JSON deserialization `PropertyNameCaseInsensitive = true` ile yapılıyor

### DateTime Formatı

- API'den **ISO 8601** formatında string olarak gelir (örn: `"2025-12-20T00:00:00Z"`)
- System.Text.Json otomatik olarak `DateTime`'a deserialize eder
- UI'da **dd.MM.yyyy** formatında gösterilir

### Nullable Types

- Opsiyonel alanlar `string?`, `DateTime?`, `int?` olarak tanımlı
- UI'da null kontrolü yapılır, boş string veya "-" gösterilir

### Fiyat Formatları

- Günlük fiyat: `₺{0:N2}` (2 ondalık)
- Toplam tutar: `₺{0:N0}` (ondalık yok, kartlarda) veya `₺{0:N2}` (detaylarda)
- Çarpan: `x{0:N2}` (2 ondalık)
- Yüzde: `%{0:N0}` (ondalık yok)

### Boş Durum (Empty State) Kontrolü

- `IsVisible="{Binding !Items.Count}"` binding'i ile kontrol edilir
- Liste boşsa büyük ikon ve mesaj gösterilir

### Dialog Sonuç Yönetimi

- Dialog'lar `DialogAction` enum'u ile sonuç döner:
  - `Save`: Kaydet işlemi
  - `Delete`: Sil işlemi
  - `Complete`: Tamamla işlemi (sadece sözleşmeler için)
- ViewModel'de `HandleXxxDialogResult` metodları bu action'lara göre işlem yapar

---

## 🚀 Electron'a Geçiş İçin Önemli Noktalar

### 1. State Management

- **Mevcut**: ObservableCollection + INotifyPropertyChanged (CommunityToolkit.Mvvm)
- **Electron**: Redux, Zustand, veya React Context API kullanılabilir

### 2. Navigation

- **Mevcut**: Custom NavigationService + ViewLocator
- **Electron**: React Router veya benzeri routing kütüphanesi

### 3. API Client

- **Mevcut**: HttpClient + ApiClientBase
- **Electron**: Axios veya Fetch API, interceptor'lar ile token yönetimi

### 4. UI Framework

- **Mevcut**: Avalonia XAML
- **Electron**: React + Material-UI, Ant Design, veya Tailwind CSS

### 5. Dialog Yönetimi

- **Mevcut**: Event-based + Window açma
- **Electron**: Modal component'ler veya Electron dialog API'si

### 6. Form Validation

- **Mevcut**: Manuel kontrol (şu an validation yok)
- **Electron**: React Hook Form, Formik, veya Yup ile validation

### 7. Date/Time Formatting

- **Mevcut**: StringFormat binding'leri
- **Electron**: date-fns, moment.js, veya Intl.DateTimeFormat

### 8. Styling

- **Mevcut**: Inline styles + Style resources
- **Electron**: CSS Modules, Styled Components, veya Tailwind CSS

### 9. Error Handling

- **Mevcut**: Try-catch + Debug.WriteLine
- **Electron**: Error boundary'ler, toast notification'lar

### 10. Loading States

- **Mevcut**: IsBusy property (sadece buton disable)
- **Electron**: Spinner component'leri, skeleton loaders

---

## 📌 Sonuç

Bu dokümantasyon, İskeleTakip Desktop uygulamasının **tüm özelliklerini, yapabildiklerini ve teknik detaylarını** içermektedir. Electron'a geçiş sırasında hiçbir özellik kaçırılmamalı ve tüm işlevsellik korunmalıdır.

**Toplam Ekran Sayısı**: 7 ana ekran + 6 detay penceresi = 13 ekran
**Toplam Entity Sayısı**: 7 (Customer, Inventory, MaterialCategory, Contract, ContractDetail, PriceTier, PricingRule)
**Toplam API Endpoint Sayısı**: ~30+ endpoint
**Toplam ViewModel Sayısı**: 10
**Toplam Converter Sayısı**: 7

Her bir özellik, UI bileşeni ve API endpoint'i bu dokümantasyonda detaylı olarak açıklanmıştır.

