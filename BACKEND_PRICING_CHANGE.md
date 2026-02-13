## Backend Değişiklik Tasarımı – Günlük Kiradan Aylık Liste Kiraya Geçiş

Bu doküman, mevcut sistemde **günlük kira ve alış fiyatı** mantığından **aylık liste kiralama bedeli ve birim fiyat** mantığına geçiş için backend tarafında yapılması gereken değişiklikleri anlatır.

Amaç: Frontend artık:
- `Inventory` için **Günlük Kira** yerine **Aylık Liste Kiralama Bedeli**
- `Alış Fiyatı` yerine **Birim Fiyat**
göstersin ve **sözleşme/teklif hesaplamaları da bu yeni mantığa göre çalışsın**.

> Not: Aşağıdaki isimler öneridir; isterseniz farklı İngilizce alan adları kullanabilirsiniz ama anlamları korunmalıdır.

---

## 1. Mevcut Durumun Özeti

### 1.1. Inventory modeli ve API’leri

Frontend tarafındaki `src/models/index.ts` dosyasına göre, backend şu alanları döndürüyor:

- `Inventory.DailyPrice: number` → Malzemenin **günlük kiralama fiyatı**
- `Inventory.PurchasePrice: number` → Malzemenin **alış fiyatı**

API istekleri:

- `POST /inventory`
- `PATCH /inventory/:id`

Frontend bunları aşağıdaki DTO’lar ile gönderiyor (`src/services/inventoryService.ts`):

- `CreateInventoryRequest`:
  - `DailyPrice: number`
  - `PurchasePrice: number`
- `UpdateInventoryRequest`:
  - Aynı alanlar

### 1.2. Sözleşme ve Teklif Modelleri

`src/models/index.ts`:

- `ContractDetail.DailyPriceAtRent: number`  
  - Sözleşme oluşturulurken, **o anda geçerli günlük kira fiyatı** buraya kopyalanıyor.
- `QuoteDetail.DailyPrice: number`  
  - Teklifte kullanılan **günlük fiyat**.

Sözleşme detayları frontend’de şöyle set ediliyor (`ContractDetailModal`):
- Malzeme eklerken:
  - `DailyPriceAtRent = selectedItem.DailyPrice` (envanterdeki günlük fiyat)
- Toplam tutar hesabı:
  - `InitialTotalPrice = Σ (DailyPriceAtRent * RentedQuantity * plannedDays)`

Teklifte de benzer şekilde (`QuoteDetailModal`):
- Malzeme eklerken:
  - `DailyPrice = selectedItem.DailyPrice`
- Toplam teklif hesabı:
  - `TotalPrice = Σ (DailyPrice * Quantity * plannedDays)`

Dolayısıyla backend şu anda:
- Envanterde **günlük kira fiyatı** saklıyor.
- Sözleşme/teklif hesaplamasını **gün sayısı üzerinden günlük fiyatla** yapıyor.

---

## 2. Hedef Durum (İş Kuralları)

Yeni istenen iş mantığı:

- **Envanterde fiyatlar**
  - `Aylık Liste Kiralama Bedeli` (ör. 30 günlük bedel)
  - `Birim Fiyat` (alış veya maliyet anlamına gelecek, stok değerleme için kullanılabilir)

- **Sözleşme / Teklif hesaplama**
  - Fiyatlama mantarı artık **aylık liste kira bedeli** üzerinden yapılacak.
  - Kiralama süresi günlük girilmeye devam edebilir (başlangıç ve bitiş tarihi zaten var), ama:
    - Backend, gün sayısını aya çevirmeli veya
    - Aylık bedeli günlük eşdeğere çevirip hesaplamalı

> Öneri: Aylık liste bedelini **30 güne bölerek** günlük efektif fiyat elde etmek basit ve pratiktir:
> - `effectiveDailyPrice = MonthlyListPrice / 30`
> - Mevcut hesaplama `DailyPrice` üzerinden çalıştığı için minimum kod değişikliği ile uyarlanabilir.

---

## 3. Veri Modeli ve Veritabanı Değişiklikleri

### 3.1. Inventory Tablosu

Mevcut alanlar (tahmini):
- `DailyPrice` (decimal)
- `PurchasePrice` (decimal)

Yeni iş kurallarına göre:
- `DailyPrice` → **aylık liste kiralama bedeli** için kullanılacak
- `PurchasePrice` → **birim fiyat** (stok/maliyet) için kullanılacak

Backend açısından iki seçenek var:

#### Seçenek A – Sadece Anlam Değiştir (Alan Adlarını Aynı Bırak)

- **DB kolon isimleri ve API property isimleri** değişmez:
  - `DailyPrice` alanı artık “aylık liste kiralama bedeli” anlamına gelir.
  - `PurchasePrice` alanı artık “birim fiyat” anlamına gelir.
- Avantaj:
  - Mevcut API’yi bozmadan, sadece yorum ve hesaplama mantarını değiştirirsiniz.
  - Frontend ile ek uyum problemi çıkmaz (`Inventory.DailyPrice` ve `Inventory.PurchasePrice` zaten kullanılıyor).
- Dezavantaj:
  - İsimler anlamı tam yansıtmaz (DailyPrice aslında monthly oluyor).

> Eğer breaking-change istemiyorsanız, **bu seçenek** önerilir.

#### Seçenek B – Alan Adlarını Değiştir (Tavsiye: Sadece yeni versiyonda)

Yeni alan isimleri:

- `MonthlyListPrice: decimal` (veya `MonthlyRentalPrice`)
- `UnitPrice: decimal`

DB tarafında yapılacaklar:
- Yeni alanlar eklenir:
  - `ALTER TABLE Inventory ADD MonthlyListPrice decimal(18,2) NULL;`
  - `ALTER TABLE Inventory ADD UnitPrice decimal(18,2) NULL;`
- Geçiş için script:
  - `MonthlyListPrice = DailyPrice * 30` (eski günlük fiyat üzerinden yaklaşık aylık bedel türetilebilir).
  - `UnitPrice = PurchasePrice` (alış fiyatı birim fiyata kopyalanır).
- Eski alanlar isteğe göre:
  - Bir süre read-only tutulabilir,
  - Sonrasında kaldırılabilir.

API tarafında:
- `Inventory` response modeli:
  - `DailyPrice` yerine `MonthlyListPrice`
  - `PurchasePrice` yerine `UnitPrice`
- Frontend aynı anda güncellenmeli.

> Bu seçenek daha temiz, ama **frontend ile birlikte koordineli deployment** gerektirir.

---

## 4. API Kontrat Değişiklikleri

Aşağıdaki değişiklikler, backend’in HTTP API katmanında yapılmalıdır.

### 4.1. Envanter API’leri (`/inventory`)

Mevcut istek DTO’ları (frontend tarafı referans):

- `CreateInventoryRequest`:
  - `DailyPrice: number`
  - `PurchasePrice: number`
- `UpdateInventoryRequest`:
  - Aynı alanlar

#### 4.1.1. Eğer **Seçenek A (İsimler aynı, anlam değişiyor)** kullanılacaksa:

- **API kontratı değişmez**:
  - Request/response hala `DailyPrice` ve `PurchasePrice` içerir.
- Backend tarafında yapılacak:
  - Dokümantasyonda ve kod yorumlarında:
    - `DailyPrice` → “Aylık Liste Kiralama Bedeli” olarak açıklanmalı.
    - `PurchasePrice` → “Birim Fiyat” olarak açıklanmalı.
  - Hesaplama yapan tüm kodlar (sözleşme/teklif) artık bu alanı **aylık bedel** olarak görmeli (aşağıda fiyatlama kısmında detay var).

#### 4.1.2. Eğer **Seçenek B (Yeni alan isimleri)** kullanılacaksa:

- Request/Response modelleri değiştirilir:
  - `DailyPrice` silinir / deprecated edilir.
  - `PurchasePrice` silinir / deprecated edilir.
  - Yerine:
    - `MonthlyListPrice: number`
    - `UnitPrice: number`
- Versiyonlama önerisi:
  - `v1` endpoint’leri (eski) bir süre daha tutulabilir.
  - Yeni API `v2` altında döndürülebilir (örn. `/api/v2/inventory`).

---

## 5. Fiyatlama ve Hesaplama Mantığı Değişiklikleri

Bu kısım, backend’in **iş mantığı servisi** (örneğin bir `PricingService` veya sözleşme/teklif servisi içinde bulunan hesaplama kodu) tarafından uygulanmalıdır.

### 5.1. Sözleşme Oluşturma (`POST /contracts`)

Frontend’den gelen istek (konsept olarak, frontend kodundan):

- Süre:
  - `StartDate` ve `PlannedEndDate` tarihleri üzerinden `plannedDays` hesaplanıyor.
- Detaylar:
  - Her kalem için:
    - `ItemId`
    - `RentedQuantity`
    - `DailyPriceAtRent`

Şu anda beklenen davranış:
- Backend, `InitialTotalPrice` alanını:
  - `Σ (DailyPriceAtRent * RentedQuantity * plannedDays)` ile uyumlu kabul ediyor.

### 5.1.1. Yeni Mantık – Aylık Liste Kira

Backend’de yapılması gereken:

1. **Envanter tablosundan aylık liste bedelini kullanın**
   - Eğer Seçenek A:
     - `Inventory.DailyPrice` alanını aylık liste bedeli olarak okuyun.
   - Eğer Seçenek B:
     - `Inventory.MonthlyListPrice` alanını kullanın.

2. **Efektif günlük fiyatı backend’de hesaplayın**
   - Önerilen formül:
     - `effectiveDailyPrice = MonthlyListPrice / 30.0`
   - Ardından:
     - `DailyPriceAtRent = effectiveDailyPrice`
     - Böylece mevcut `DailyPriceAtRent` alanını korursunuz, ama anlamı:
       - “Aylık liste bedelinin 30’a bölünmüş hali (günlük efektif)” olur.

3. **InitialTotalPrice hesaplamasını backend’de güvenceye alın**
   - Backend, gelen `InitialTotalPrice`’e körü körüne güvenmemeli, kendisi de hesaplayıp doğrulamalı:
     - `plannedDays = ceil((PlannedEndDate - StartDate) / 1 gün)`
     - `calculatedTotal = Σ (DailyPriceAtRent * RentedQuantity * plannedDays)`
   - İsterseniz:
     - Ya `InitialTotalPrice`’i tamamen backend hesaplasın,
     - Ya da frontend’den geleni ignore edip, kendi hesapladığı değerle overwrite etsin.

4. **Return/Fiyatlandırma Senaryoları (Pricing Rules)**
   - `pricing-rules` servisi şu anda `contractId` üzerinden fiyat hesaplıyor.
   - Bu hesaplamada da günlük bazlı mantık varsa:
     - Aynı `effectiveDailyPrice` yaklaşımı burada da kullanılmalı.
     - Yani, `DailyPriceAtRent` zaten efektif günlük fiyatı içeriyorsa, mevcut hesaplama büyük ihtimalle hiç bozulmadan çalışacaktır.

### 5.2. Teklif Oluşturma (`POST /quotes`)

Mevcut davranış:

- Frontend, `QuoteDetail.DailyPrice` alanına:
  - `Inventory.DailyPrice` değerini yazıyor.
- Backend, `TotalPrice` alanını:
  - `Σ (DailyPrice * Quantity * plannedDays)` olarak kabul ediyor.

Yeni mantık:

1. Teklif oluştururken **envanterden aylık liste bedelini okuyun**:
   - Seçenek A:
     - `Inventory.DailyPrice` (artık aylık bedel)
   - Seçenek B:
     - `Inventory.MonthlyListPrice`

2. Backend tarafında **DailyPrice** yerine **efektif günlük fiyat** hesaplayın:
   - `effectiveDailyPrice = MonthlyListPrice / 30.0`
   - `QuoteDetail.DailyPrice = effectiveDailyPrice`

3. `TotalPrice` hesabı:
   - Backend tarafında yeniden hesaplanmalı:
     - `plannedDays = ceil((PlannedEndDate - StartDate) / 1 gün)`
     - `TotalPrice = Σ (QuoteDetail.DailyPrice * Quantity * plannedDays)`
   - Frontend’den gelen `TotalPrice` alanını sadece bilgi amaçlı kullanın veya ignore edin.

4. Tekliften sözleşmeye dönüştürme (`POST /quotes/{id}/convert`):
   - Bu akışta da:
     - Teklif detaylarındaki `DailyPrice` zaten efektif günlük fiyat ise,
     - Sözleşme oluştururken `ContractDetail.DailyPriceAtRent` olarak bunları kullanabilirsiniz.
   - Eğer backend şu an convert sırasında tekrar inventory’den fiyat çekiyorsa, aynı aylık → günlük dönüşüm burada da uygulanmalıdır.

---

## 6. Birim Fiyat (Unit Price) Kullanımı

`PurchasePrice` alanı şu anda:
- Envanterde alış fiyatı gibi tutuluyor,
- Sözleşme ve teklif hesaplamalarında **doğrudan kullanılmıyor** (sadece envanter listesinde “Alış” bilgisi olarak gösteriliyor).

Yeni gereksinim:
- `PurchasePrice` yerine **Birim Fiyat** kullanılacak.

Backend için yapılması gerekenler:

1. **Semantik değiştirme**
   - Seçenek A:
     - `Inventory.PurchasePrice` artık “Unit Price” (Birim Fiyat) anlamına gelir.
     - Kod yorumları ve dokümantasyon buna göre güncellenmeli.

2. **İleride maliyet / karlılık hesapları yapılacaksa**:
   - Fiyatlandırma tarafında (pricing rules veya başka bir servis):
     - `UnitPrice` alanı üzerinden maliyet ve kar marjı hesaplamaları eklenebilir.
   - Şu an için, sadece alan ismi ve anlamını değiştirmek yeterli, ekstra hesaplama şart değil.

---

## 7. Geriye Dönük Uyum (Backward Compatibility)

Eğer üretimde çalışan sisteminiz ve eski verileriniz varsa:

1. **Veri migrasyonu** (Seçenek B için):
   - Yeni alanlar eklendikten sonra script:
     - `MonthlyListPrice = DailyPrice * 30` (eski günlük kira üzerinden yaklaşık aylık bedel).
     - `UnitPrice = PurchasePrice`.
   - Eski alanlar sadece okuma amaçlı tutulup, yeni kayıtlar için set edilmeyebilir.

2. **API versiyonlama**:
   - Eski frontend sürümleri için:
     - `/api/v1/...` altında `DailyPrice` / `PurchasePrice` dönen endpoint’leri koruyabilirsiniz.
   - Yeni frontend sürümü için:
     - `/api/v2/...` altında `MonthlyListPrice` / `UnitPrice` kullanan endpoint’ler oluşturulabilir.

3. **Log ve Audit kayıtları**:
   - Audit tablolarında `DailyPrice`, `PurchasePrice` gibi kolon adları geçiyorsa:
     - Bunların semantiği dokümante edilmeli,
     - İsim değiştirme yapılacaksa schema migration dikkatlice planlanmalı.

---

## 8. Özet Checklist (Backend Geliştirici İçin)

Backend geliştiriciye verebileceğiniz net görev listesi:

1. **Karar ver**:  
   - Seçenek A: Kolon ve property isimleri aynı kalacak, anlam değişecek.  
   - Seçenek B: Yeni `MonthlyListPrice` ve `UnitPrice` alanları eklenecek, API güncellenecek.

2. **Inventory modeli ve DB şeması**:
   - A: `DailyPrice` → aylık liste bedeli, `PurchasePrice` → birim fiyat olarak dokümante et.
   - B: `MonthlyListPrice` ve `UnitPrice` alanlarını ekle, eski veriyi migrate et.

3. **Sözleşme oluşturma akışı**:
   - Envanterden aylık liste bedelini çek.
   - `effectiveDailyPrice = MonthlyListPrice / 30` hesapla.
   - `ContractDetail.DailyPriceAtRent` alanına bu efektif günlük fiyatı yaz.
   - `InitialTotalPrice`’i backend tarafında:
     - `Σ (DailyPriceAtRent * RentedQuantity * plannedDays)` olarak hesapla ve kaydet.

4. **Teklif oluşturma akışı**:
   - Envanterden aylık liste bedelini çek.
   - `effectiveDailyPrice = MonthlyListPrice / 30` hesapla.
   - `QuoteDetail.DailyPrice` alanına bu değeri yaz.
   - `TotalPrice`’i backend tarafında:
     - `Σ (DailyPrice * Quantity * plannedDays)` olarak hesapla.

5. **Teklif → Sözleşme dönüşümü**:
   - Eğer fiyat teklif detaylarından alınıyorsa:
     - `QuoteDetail.DailyPrice` zaten efektif günlük fiyat olduğu için direkt `DailyPriceAtRent` olarak kullanılabilir.
   - Eğer tekrar envanterden çekiliyorsa:
     - Aynı aylık → günlük dönüşüm burada da uygulanmalı.

6. **PricingRules (varsa)**:
   - Fiyat hesaplama (`/pricing-rules/calculate`) tarafında kullanılan günlük fiyat, artık:
     - Ya `DailyPriceAtRent` (efektif günlük fiyat),
     - Ya da `MonthlyListPrice / 30` üzerinden türetilmeli.

7. **Dokümantasyon ve yorumlar**:
   - Tüm servis ve model açıklamalarında:
     - `DailyPrice` = “Monthly list rental price / 30 (effective daily)” veya direkt “Aylık liste kira bedeli” olarak netleştirilmeli.
     - `PurchasePrice` = “Unit price” olarak düzeltilmeli (veya yeni isim ile kullanılmalı).

Bu dokümanı backend geliştiriciye vererek, “günlük kira” mantığından “aylık liste kiralama bedeli” + “birim fiyat” mantığına geçişte hangi noktalara dokunması gerektiğini net şekilde yönlendirebilirsiniz.

