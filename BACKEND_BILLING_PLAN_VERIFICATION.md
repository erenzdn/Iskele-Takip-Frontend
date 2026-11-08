# Backend Billing-Plan API Doğrulama ve Test Talebi

## 🎯 Amaç

Frontend'de fatura otomatik hesaplama özelliği geliştirildi. Ancak hesaplamanın doğru çalışması **tamamen backend'in `/contracts/{contractId}/billing-plan` endpoint'inden dönen veriye bağlı**. Bu endpoint'in aşağıdaki senaryolarda **doğru çalışıp çalışmadığını test etmenizi ve eksik/hatalı kısımları düzeltmenizi istiyorum.**

---

## 📋 Endpoint Bilgisi

```
GET /contracts/{contractId}/billing-plan?asOf=YYYY-MM-DD
```

**Response Yapısı (TypeScript):**
```typescript
interface BillingPeriod {
  index: number;
  periodStart: string;        // ISO 8601 format
  periodEnd: string;          // ISO 8601 format
  isPartial: boolean;         // Dönem kısmi mi (dönem ortası başlangıç/bitiş)
  isClosed: boolean;          // Dönem kapandı mı (geçmiş/şimdi=true, gelecek=false)
  accrualSubtotal: number;    // KDV hariç brüt tahakkuk
  accrualNetTotal: number;    // İskonto sonrası net tahakkuk
  billedAmount: number | null;// Faturalandı işaretlenen tutar
  variance: number | null;    // Fark (billedAmount - accrualNetTotal)
  varianceReasons: Array<{    // Farkın sebepleri (zeyilname)
    AddendumId: number;
    AddendumNumber: number;
    Reason: string | null;
    EffectiveDate: string;    // Zeyilname yürürlük tarihi
  }>;
  lines: Array<{              // Kalem kırılımı
    DetailId: number;
    ItemId: number;
    gross: number;
    net: number;
  }>;
}

type BillingPlan = BillingPeriod[];
```

---

## ✅ Test Senaryoları ve Beklenen Davranışlar

### 🔹 **Senaryo 1: Basit Kiralama Sözleşmesi (Zeyilname Yok)**

**Sözleşme:**
- Başlangıç: 1 Ocak 2026
- Bitiş: 31 Mart 2026 (3 ay)
- Kalemler: 
  - İskele A: 10 adet × 1.000 TL/ay = 10.000 TL/ay
- Zeyilname: Yok
- Uzatma: Yok

**Test İsteği:**
```http
GET /contracts/{contractId}/billing-plan?asOf=2026-03-31
```

**Beklenen Response:**
```json
[
  {
    "index": 0,
    "periodStart": "2026-01-01T00:00:00.000Z",
    "periodEnd": "2026-01-31T20:59:59.999Z",
    "isPartial": false,
    "isClosed": true,
    "accrualSubtotal": 10000.00,
    "accrualNetTotal": 10000.00,
    "billedAmount": null,
    "variance": null,
    "varianceReasons": [],
    "lines": [
      { "DetailId": 1, "ItemId": 100, "gross": 10000.00, "net": 10000.00 }
    ]
  },
  {
    "index": 1,
    "periodStart": "2026-02-01T00:00:00.000Z",
    "periodEnd": "2026-02-28T20:59:59.999Z",
    "isPartial": false,
    "isClosed": true,
    "accrualSubtotal": 10000.00,
    "accrualNetTotal": 10000.00,
    "billedAmount": null,
    "variance": null,
    "varianceReasons": [],
    "lines": [
      { "DetailId": 1, "ItemId": 100, "gross": 10000.00, "net": 10000.00 }
    ]
  },
  {
    "index": 2,
    "periodStart": "2026-03-01T00:00:00.000Z",
    "periodEnd": "2026-03-31T20:59:59.999Z",
    "isPartial": false,
    "isClosed": true,
    "accrualSubtotal": 10000.00,
    "accrualNetTotal": 10000.00,
    "billedAmount": null,
    "variance": null,
    "varianceReasons": [],
    "lines": [
      { "DetailId": 1, "ItemId": 100, "gross": 10000.00, "net": 10000.00 }
    ]
  }
]
```

**✅ Kontrol Edilecekler:**
- [ ] 3 dönem döndürülüyor mu?
- [ ] Her dönem `accrualNetTotal = 10000` mu?
- [ ] `periodStart` ve `periodEnd` tarihleri doğru mu?
- [ ] Ocak 31 gün, Şubat 28 gün, Mart 31 gün olarak hesaplanmış mı?

---

### 🔹 **Senaryo 2: Geriye Dönük Zeyilname (Fiyat Artışı)**

**Sözleşme:**
- Başlangıç: 1 Ocak 2026
- Bitiş: 31 Mart 2026
- Kalemler: İskele A: 10.000 TL/ay

**Zeyilname (15 Şubat'ta oluşturuldu):**
- Zeyilname No: 1
- Yürürlük Tarihi (EffectiveDate): **1 Ocak 2026** (geriye dönük!)
- Değişiklik: İskele A fiyatı 10.000 TL → **12.000 TL**
- Durum: `Status = 'approved'`

**Test İsteği:**
```http
GET /contracts/{contractId}/billing-plan?asOf=2026-03-31
```

**Beklenen Response:**
```json
[
  {
    "index": 0,
    "periodStart": "2026-01-01T00:00:00.000Z",
    "periodEnd": "2026-01-31T20:59:59.999Z",
    "accrualNetTotal": 12000.00,  // ⬅️ GÜNCEL TUTAR (zeyilname uygulandı)
    "billedAmount": 10000.00,     // ⬅️ ESKİ FATURA (değişiklikten önce kesildi)
    "variance": -2000.00,         // ⬅️ FARK (10000 - 12000)
    "varianceReasons": [          // ⬅️ SEBEP
      {
        "AddendumId": 5,
        "AddendumNumber": 1,
        "Reason": "Kira artışı",
        "EffectiveDate": "2026-01-01T00:00:00.000Z"
      }
    ],
    "lines": [
      { "DetailId": 1, "ItemId": 100, "gross": 12000.00, "net": 12000.00 }
    ]
  },
  {
    "index": 1,
    "periodStart": "2026-02-01T00:00:00.000Z",
    "periodEnd": "2026-02-28T20:59:59.999Z",
    "accrualNetTotal": 12000.00,  // ⬅️ Şubat da yeni fiyat
    "varianceReasons": [],        // ⬅️ Şubat faturalanmadı, variance yok
    "lines": [
      { "DetailId": 1, "ItemId": 100, "gross": 12000.00, "net": 12000.00 }
    ]
  },
  {
    "index": 2,
    "periodStart": "2026-03-01T00:00:00.000Z",
    "periodEnd": "2026-03-31T20:59:59.999Z",
    "accrualNetTotal": 12000.00,
    "varianceReasons": [],
    "lines": [
      { "DetailId": 1, "ItemId": 100, "gross": 12000.00, "net": 12000.00 }
    ]
  }
]
```

**✅ Kontrol Edilecekler:**
- [ ] Ocak dönemi `accrualNetTotal = 12000` mu? (geriye dönük etki)
- [ ] Ocak'ta `variance = -2000` görünüyor mu?
- [ ] `varianceReasons` Zeyilname #1'i gösteriyor mu?
- [ ] Şubat ve Mart da 12000 TL mi?
- [ ] Zeyilname `Status='draft'` ise dahil edilmemeli!

---

### 🔹 **Senaryo 3: Dönem Ortası Zeyilname (Kalem Ekleme)**

**Sözleşme:**
- Başlangıç: 1 Ocak 2026
- Kalemler: İskele A: 10.000 TL/ay

**Zeyilname (15 Mart'ta oluşturuldu):**
- Yürürlük Tarihi: **10 Mart 2026** (dönem ortası!)
- Değişiklik: İskele B eklendi (5 adet × 1.000 TL/ay = 5.000 TL/ay)
- Durum: `Status = 'approved'`

**Test İsteği:**
```http
GET /contracts/{contractId}/billing-plan?asOf=2026-03-31
```

**Beklenen Response (Mart Dönemi):**
```json
{
  "index": 2,
  "periodStart": "2026-03-01T00:00:00.000Z",
  "periodEnd": "2026-03-31T20:59:59.999Z",
  "isPartial": true,  // ⬅️ Dönem ortası değişiklik!
  "accrualNetTotal": ???,  // ⬅️ HESAPLAMA GEREKLİ
  "lines": [
    { "DetailId": 1, "ItemId": 100, "gross": ???, "net": ??? },
    { "DetailId": 2, "ItemId": 101, "gross": ???, "net": ??? }
  ]
}
```

**❓ KRİTİK SORU: Backend bu senaryoda ne yapıyor?**

**Seçenek A: Backend tam ay tahakkuk ediyor (yanlış!)**
```json
{
  "accrualNetTotal": 15000.00,  // ❌ YANLIŞ (tam ay İskele A + İskele B)
  "isPartial": false
}
```

**Seçenek B: Backend kısmi hesaplama yapıyor (doğru!)**
```json
{
  "accrualNetTotal": 13548.39,  // ✅ DOĞRU
  // Hesaplama:
  // 1-9 Mart (9 gün): 10.000 TL × 9/31 = 2.903,23 TL
  // 10-31 Mart (22 gün): 15.000 TL × 22/31 = 10.645,16 TL
  // Toplam: 13.548,39 TL
  "isPartial": true,
  "lines": [
    { "DetailId": 1, "ItemId": 100, "gross": 10000.00, "net": 10000.00 },
    { "DetailId": 2, "ItemId": 101, "gross": 5000.00, "net": 5000.00 }
  ]
}
```

**Seçenek C: Backend her kalem için ayrı kısmi hesaplama yapıyor (alternatif doğru!)**
```json
{
  "accrualNetTotal": 13548.39,
  "isPartial": true,
  "lines": [
    { 
      "DetailId": 1, 
      "ItemId": 100, 
      "gross": 10000.00,  // Tam ay fiyatı
      "net": 10000.00     // Tam ay net (backend daha sonra orantılar)
    },
    { 
      "DetailId": 2, 
      "ItemId": 101, 
      "gross": 3548.39,   // 22/31 günlük kısmi (backend hesaplar)
      "net": 3548.39 
    }
  ]
}
```

**✅ Kontrol Edilecekler:**
- [ ] Mart dönemi `isPartial = true` mu?
- [ ] `accrualNetTotal` orantılı hesaplanmış mı?
- [ ] Backend hangi yöntemi kullanıyor? (A, B, C)
- [ ] Eğer yöntem yanlışsa, frontend'de düzeltme gerekir mi?

---

### 🔹 **Senaryo 4: Sözleşme Uzatma (Contract Extension)**

**Sözleşme:**
- Başlangıç: 1 Ocak 2026
- İlk Bitiş: 31 Mart 2026 (3 ay)
- Kalemler: İskele A: 10.000 TL/ay

**Uzatma (15 Mart'ta yapıldı):**
```json
POST /contracts/{contractId}/extensions
{
  "newPlannedEndDate": "2026-06-30",
  "extensionDays": 91,
  "reason": "Proje uzadı",
  "newMonthlyRate": null  // Fiyat değişmiyor
}
```

**Test İsteği:**
```http
GET /contracts/{contractId}/billing-plan?asOf=2026-06-30
```

**Beklenen Response:**
```json
[
  // Ocak-Mart (eski dönemler)
  { "periodStart": "2026-01-01", "accrualNetTotal": 10000.00 },
  { "periodStart": "2026-02-01", "accrualNetTotal": 10000.00 },
  { "periodStart": "2026-03-01", "accrualNetTotal": 10000.00 },
  // Nisan-Haziran (uzatma dönemleri) ⬅️ YENİ!
  { "periodStart": "2026-04-01", "accrualNetTotal": 10000.00 },
  { "periodStart": "2026-05-01", "accrualNetTotal": 10000.00 },
  { "periodStart": "2026-06-01", "accrualNetTotal": 10000.00 }
]
```

**✅ Kontrol Edilecekler:**
- [ ] Uzatma sonrası **6 dönem** döndürülüyor mu? (3 eski + 3 yeni)
- [ ] Nisan-Haziran dönemleri oluşturulmuş mu?
- [ ] Nisan-Haziran accrualNetTotal doğru mu? (10.000 TL)

---

### 🔹 **Senaryo 5: Uzatma + Fiyat Değişikliği**

**Uzatma (fiyat artışı ile):**
```json
POST /contracts/{contractId}/extensions
{
  "newPlannedEndDate": "2026-06-30",
  "extensionDays": 91,
  "newMonthlyRate": 12000.00  // ⬅️ Yeni fiyat!
}
```

**Test İsteği:**
```http
GET /contracts/{contractId}/billing-plan?asOf=2026-06-30
```

**Beklenen Response:**
```json
[
  // Ocak-Mart (eski fiyat)
  { "periodStart": "2026-01-01", "accrualNetTotal": 10000.00 },
  { "periodStart": "2026-02-01", "accrualNetTotal": 10000.00 },
  { "periodStart": "2026-03-01", "accrualNetTotal": 10000.00 },
  // Nisan-Haziran (yeni fiyat) ⬅️ FARKLI!
  { "periodStart": "2026-04-01", "accrualNetTotal": 12000.00 },
  { "periodStart": "2026-05-01", "accrualNetTotal": 12000.00 },
  { "periodStart": "2026-06-01", "accrualNetTotal": 12000.00 }
]
```

**✅ Kontrol Edilecekler:**
- [ ] Uzatma dönemlerinde yeni fiyat uygulanmış mı?
- [ ] Ocak-Mart eski fiyatta mı kalmış?

---

### 🔹 **Senaryo 6: Çoklu Zeyilname (Aynı Kalem)**

**Sözleşme:**
- Başlangıç: 1 Ocak 2026
- Kalemler: İskele A: 10.000 TL/ay

**Zeyilname 1 (1 Şubat'ta oluşturuldu):**
- EffectiveDate: **1 Şubat 2026**
- Değişiklik: İskele A fiyatı 10.000 → 11.000 TL

**Zeyilname 2 (10 Şubat'ta oluşturuldu):**
- EffectiveDate: **1 Şubat 2026** (aynı tarih!)
- Değişiklik: İskele A fiyatı 11.000 → 12.000 TL

**❓ KRİTİK SORU: Hangi zeyilname geçerli?**

**Test İsteği:**
```http
GET /contracts/{contractId}/billing-plan?asOf=2026-02-28
```

**Beklenen Davranış:**
- ✅ **En son onaylanan zeyilname geçerli olmalı** (Zeyilname #2 → 12.000 TL)
- ❌ İlk zeyilname geçersiz sayılmalı veya üzerine yazılmalı

**Beklenen Response (Şubat):**
```json
{
  "periodStart": "2026-02-01",
  "accrualNetTotal": 12000.00,  // ⬅️ Son zeyilname
  "varianceReasons": [
    {
      "AddendumId": 6,
      "AddendumNumber": 2,  // ⬅️ İkinci zeyilname
      "EffectiveDate": "2026-02-01"
    }
  ]
}
```

**✅ Kontrol Edilecekler:**
- [ ] Çakışan zeyilnameler doğru sıralanıyor mu?
- [ ] Son zeyilname mi uygulanıyor?
- [ ] varianceReasons hangisini gösteriyor?

---

### 🔹 **Senaryo 7: AsOf Parametresi (Gelecek Tarih)**

**Sözleşme:**
- Başlangıç: 1 Ocak 2026
- Bitiş: 31 Aralık 2026 (12 ay)
- Kalemler: 10.000 TL/ay

**Bugün:** 15 Mart 2026

**Test İsteği 1: asOf=bugün**
```http
GET /contracts/{contractId}/billing-plan?asOf=2026-03-15
```

**Beklenen Response:**
```json
[
  { "periodStart": "2026-01-01", "isClosed": true },   // ✅ Geçmiş
  { "periodStart": "2026-02-01", "isClosed": true },   // ✅ Geçmiş
  { "periodStart": "2026-03-01", "isClosed": false }   // ⬅️ Açık dönem!
]
```

**Test İsteği 2: asOf=gelecek**
```http
GET /contracts/{contractId}/billing-plan?asOf=2026-12-31
```

**Beklenen Response:**
```json
[
  { "periodStart": "2026-01-01", "isClosed": true },
  { "periodStart": "2026-02-01", "isClosed": true },
  { "periodStart": "2026-03-01", "isClosed": false },  // ⬅️ Mart hala açık (bugün 15 Mart)
  { "periodStart": "2026-04-01", "isClosed": false },  // ⬅️ Gelecek dönemler
  { "periodStart": "2026-05-01", "isClosed": false },
  // ... Aralık'a kadar
  { "periodStart": "2026-12-01", "isClosed": false }
]
```

**✅ Kontrol Edilecekler:**
- [ ] `isClosed` durumu bugüne göre mi belirleniyor?
- [ ] Gelecek dönemler `isClosed=false` mu?
- [ ] AsOf parametresi hangi dönemleri kapsıyor?

---

### 🔹 **Senaryo 8: İade/Kalem Çıkarma (Return)**

**Sözleşme:**
- Başlangıç: 1 Ocak 2026
- Kalemler: İskele A: 10 adet × 1.000 TL/ay = 10.000 TL/ay

**İade (15 Şubat'ta):**
- 5 adet İskele A iade edildi
- İade tarihi: 10 Şubat 2026
- Kalan: 5 adet × 1.000 = 5.000 TL/ay

**Test İsteği:**
```http
GET /contracts/{contractId}/billing-plan?asOf=2026-03-31
```

**Beklenen Response:**
```json
[
  {
    "periodStart": "2026-01-01",
    "accrualNetTotal": 10000.00  // ⬅️ Ocak tam (iade Şubat'ta)
  },
  {
    "periodStart": "2026-02-01",
    "accrualNetTotal": ???,  // ⬅️ Şubat kısmi mi? Tam mı?
    // Seçenek A: 7500 TL (9 gün tam, 19 gün yarı)
    // Seçenek B: 5000 TL (tüm ay yarı)
    // Seçenek C: 10000 TL (ay sonu faturalaması)
    "isPartial": true
  },
  {
    "periodStart": "2026-03-01",
    "accrualNetTotal": 5000.00  // ⬅️ Mart yarı
  }
]
```

**❓ KRİTİK SORU: İade dönem ortasında nasıl hesaplanıyor?**

**✅ Kontrol Edilecekler:**
- [ ] İade sonrası dönemler düşük tutar mı gösteriyor?
- [ ] İade dönemi kısmi mi hesaplanıyor?
- [ ] Backend hangi yöntemi kullanıyor?

---

### 🔹 **Senaryo 9: Faturalandı İşaretleme (MarkBilledPeriod)**

**Sözleşme:**
- Başlangıç: 1 Ocak 2026
- Kalemler: 10.000 TL/ay

**İşaretleme (5 Şubat'ta):**
```json
POST /contracts/{contractId}/billed-periods
{
  "periodStart": "2026-01-01",
  "periodEnd": "2026-01-31",
  "billedAmount": 10000.00
}
```

**Test İsteği:**
```http
GET /contracts/{contractId}/billing-plan?asOf=2026-02-28
```

**Beklenen Response (Ocak):**
```json
{
  "periodStart": "2026-01-01",
  "accrualNetTotal": 10000.00,
  "billedAmount": 10000.00,  // ⬅️ İşaretlenmiş tutar
  "variance": 0.00,          // ⬅️ Fark yok
  "varianceReasons": []
}
```

**✅ Kontrol Edilecekler:**
- [ ] `billedAmount` doğru dolduruluyor mu?
- [ ] `variance` hesaplanıyor mu?
- [ ] Fatura olmayan dönemlerde `billedAmount = null` mı?

---

### 🔹 **Senaryo 10: İskonto (Discount)**

**Sözleşme:**
- Başlangıç: 1 Ocak 2026
- Kalemler: İskele A: 10 adet × 1.000 TL/ay = 10.000 TL/ay
- İskonto: %10

**Test İsteği:**
```http
GET /contracts/{contractId}/billing-plan?asOf=2026-01-31
```

**Beklenen Response (Ocak):**
```json
{
  "periodStart": "2026-01-01",
  "accrualSubtotal": 10000.00,   // ⬅️ İskonto öncesi
  "accrualNetTotal": 9000.00,    // ⬅️ İskonto sonrası (10000 - 10%)
  "lines": [
    { 
      "DetailId": 1, 
      "ItemId": 100, 
      "gross": 10000.00,  // ⬅️ Brüt
      "net": 9000.00      // ⬅️ Net (iskonto uygulanmış)
    }
  ]
}
```

**✅ Kontrol Edilecekler:**
- [ ] `accrualSubtotal` brüt tutar mı?
- [ ] `accrualNetTotal` iskonto sonrası mı?
- [ ] `lines[].gross` ve `lines[].net` doğru mu?

---

## 🧪 Test Prosedürü

### 1. **Manuel Test (Postman/cURL)**

Her senaryo için:
1. Backend'de test sözleşmesi oluşturun
2. API isteğini gönderin
3. Response'u yukarıdaki beklenen değerlerle karşılaştırın
4. Farklılıkları kaydedin

### 2. **Otomatik Test (Backend Unit Test)**

Eğer backend'de unit test yoksa, her senaryo için test yazın:

```csharp
[Fact]
public async Task BillingPlan_GeriyeDonukZeyilname_DogruHesaplar()
{
    // Arrange
    var contractId = CreateTestContract(
        startDate: new DateTime(2026, 1, 1),
        endDate: new DateTime(2026, 3, 31),
        monthlyRate: 10000
    );
    
    CreateAddendum(
        contractId: contractId,
        effectiveDate: new DateTime(2026, 1, 1),
        newMonthlyRate: 12000,
        status: "approved",
        createdDate: new DateTime(2026, 2, 15)
    );
    
    MarkBilledPeriod(
        contractId: contractId,
        periodStart: new DateTime(2026, 1, 1),
        billedAmount: 10000
    );

    // Act
    var result = await _billingService.GetBillingPlanAsync(
        contractId, 
        asOf: new DateTime(2026, 3, 31)
    );

    // Assert
    var january = result.First(p => p.PeriodStart.Month == 1);
    Assert.Equal(12000, january.AccrualNetTotal);  // ⬅️ Zeyilname uygulanmış
    Assert.Equal(10000, january.BilledAmount);     // ⬅️ Eski fatura
    Assert.Equal(-2000, january.Variance);         // ⬅️ Fark
    Assert.Single(january.VarianceReasons);        // ⬅️ Zeyilname sebep
}
```

### 3. **Integration Test (E2E)**

Frontend + Backend birlikte test:
1. Frontend'de "Fatura Ekle" formunu aç
2. Dönem seç (örn: 1-31 Mart)
3. Otomatik hesaplanan tutarı kontrol et
4. Backend billing-plan response'u ile karşılaştır

---

## 🚨 Olası Hatalar ve Çözümler

### Hata 1: Zeyilnameler Geriye Dönük Uygulanmıyor

**Belirti:**
```json
// Beklenen: accrualNetTotal = 12000
// Gelen: accrualNetTotal = 10000
```

**Sebep:**
- Zeyilname `EffectiveDate` dikkate alınmıyor
- Sadece `CreatedDate` kullanılıyor olabilir

**Çözüm:**
```csharp
// Zeyilnameleri EffectiveDate'e göre sırala ve uygula
var addendums = await GetApprovedAddendumsAsync(contractId);
foreach (var period in periods)
{
    var applicableAddendums = addendums
        .Where(a => a.EffectiveDate <= period.PeriodEnd)
        .OrderBy(a => a.EffectiveDate)
        .ThenBy(a => a.AddendumNumber);
    
    foreach (var addendum in applicableAddendums)
    {
        ApplyAddendumToPeriod(period, addendum);
    }
}
```

---

### Hata 2: Dönem Ortası Zeyilname Orantılanmıyor

**Belirti:**
```json
// Beklenen: accrualNetTotal = 13548.39 (orantılı)
// Gelen: accrualNetTotal = 15000.00 (tam ay)
```

**Sebep:**
- Backend ay sonu faturalaması yapıyor
- Günlük orantılama yok

**Çözüm:**
```csharp
// Dönem ortası değişiklikleri gün bazlı orantıla
if (addendum.EffectiveDate > period.PeriodStart && 
    addendum.EffectiveDate < period.PeriodEnd)
{
    var totalDays = (period.PeriodEnd - period.PeriodStart).Days + 1;
    var daysBeforeChange = (addendum.EffectiveDate - period.PeriodStart).Days;
    var daysAfterChange = totalDays - daysBeforeChange;
    
    var beforeAmount = oldRate * daysBeforeChange / totalDays;
    var afterAmount = newRate * daysAfterChange / totalDays;
    
    period.AccrualNetTotal = beforeAmount + afterAmount;
    period.IsPartial = true;
}
```

---

### Hata 3: Uzatma Dönemleri Oluşturulmuyor

**Belirti:**
```json
// Beklenen: 6 dönem (Ocak-Haziran)
// Gelen: 3 dönem (Ocak-Mart)
```

**Sebep:**
- Uzatma sonrası `PlannedEndDate` güncelleniyor ama billing dönemleri oluşturulmuyor

**Çözüm:**
```csharp
// Uzatma sonrası yeni dönemler oluştur
var extensions = await GetActiveExtensionsAsync(contractId);
var effectiveEndDate = contract.PlannedEndDate;

foreach (var extension in extensions.OrderBy(e => e.CreatedAt))
{
    effectiveEndDate = extension.NewPlannedEndDate;
}

// effectiveEndDate'e kadar tüm dönemler oluştur
var periods = GenerateMonthlyPeriods(contract.StartDate, effectiveEndDate);
```

---

### Hata 4: varianceReasons Boş

**Belirti:**
```json
{
  "variance": -2000,
  "varianceReasons": []  // ⬅️ BOŞ!
}
```

**Sebep:**
- Fark hesaplanıyor ama sebep izlenmiyor

**Çözüm:**
```csharp
// Fark varsa hangi zeyilnamelerden kaynaklandığını bul
if (period.BilledAmount != null && period.Variance != 0)
{
    var affectingAddendums = addendums
        .Where(a => a.EffectiveDate <= period.PeriodEnd &&
                    a.ApprovedDate > period.BilledDate)  // Fatura sonrası onaylananlar
        .ToList();
    
    period.VarianceReasons = affectingAddendums
        .Select(a => new VarianceReason
        {
            AddendumId = a.AddendumId,
            AddendumNumber = a.AddendumNumber,
            Reason = a.Reason,
            EffectiveDate = a.EffectiveDate
        })
        .ToList();
}
```

---

### Hata 5: isClosed Yanlış Hesaplanıyor

**Belirti:**
```json
// Bugün: 15 Mart 2026
{
  "periodStart": "2026-03-01",
  "periodEnd": "2026-03-31",
  "isClosed": true  // ⬅️ YANLIŞ! (dönem henüz bitmedi)
}
```

**Sebep:**
- isClosed hesaplaması bugüne göre değil asOf tarihine göre yapılıyor

**Çözüm:**
```csharp
// Bugünün tarihine göre isClosed belirle
var today = DateTime.UtcNow.Date;
period.IsClosed = period.PeriodEnd.Date < today;

// Açık dönem için projeksiyon yap
if (!period.IsClosed)
{
    period.AccrualNetTotal = CalculateProjection(period, today);
}
```

---

## 📊 Test Raporu Şablonu

Testleri tamamladıktan sonra aşağıdaki formatı kullanarak rapor verin:

```markdown
# Billing-Plan API Test Raporu

## Test Tarihi: [YYYY-MM-DD]
## Backend Versiyon: [v1.2.3]

---

### Senaryo 1: Basit Kiralama
- **Durum:** ✅ BAŞARILI / ❌ BAŞARISIZ
- **Beklenin:** 3 dönem, her biri 10.000 TL
- **Sonuç:** [Açıklama]
- **Fark:** [Varsa]

### Senaryo 2: Geriye Dönük Zeyilname
- **Durum:** ❌ BAŞARISIZ
- **Beklenin:** Ocak accrualNetTotal = 12.000 TL
- **Sonuç:** Ocak accrualNetTotal = 10.000 TL
- **Fark:** Zeyilname EffectiveDate uygulanmıyor
- **Düzeltme:** [Kod değişikliği gerekli]

### Senaryo 3: Dönem Ortası Zeyilname
- **Durum:** ⚠️ KISMİ
- **Beklenin:** Mart accrualNetTotal = 13.548,39 TL (orantılı)
- **Sonuç:** Mart accrualNetTotal = 15.000 TL (tam ay)
- **Fark:** Gün bazlı orantılama yok
- **Düzeltme:** [Orantılama mantığı eklenecek]

[... diğer senaryolar ...]

---

## Özet

| Senaryo | Durum | Öncelik |
|---------|-------|---------|
| 1. Basit Kiralama | ✅ | - |
| 2. Geriye Dönük Zeyilname | ❌ | 🔴 Yüksek |
| 3. Dönem Ortası Zeyilname | ⚠️ | 🟡 Orta |
| 4. Uzatma | ✅ | - |
| 5. Uzatma + Fiyat | ✅ | - |
| 6. Çoklu Zeyilname | ❌ | 🟠 Orta |
| 7. AsOf Parametresi | ✅ | - |
| 8. İade | ⚠️ | 🟡 Orta |
| 9. İşaretleme | ✅ | - |
| 10. İskonto | ✅ | - |

**Toplam:** 6/10 başarılı, 2 başarısız, 2 kısmi

---

## Gerekli Düzeltmeler

### 🔴 Kritik (Hemen yapılmalı)
1. Senaryo 2: Zeyilname EffectiveDate geriye dönük uygulanmalı
2. Senaryo 6: Çoklu zeyilname sıralaması düzeltilmeli

### 🟡 Orta (Kısa vadede yapılmalı)
1. Senaryo 3: Dönem ortası zeyilname orantılanmalı
2. Senaryo 8: İade kısmi hesaplama netleştirilmeli

### 🟢 Düşük (İyileştirme)
- Performance optimizasyonu
- Önbellekleme
```

---

## 🎯 Beklenen Sonuç

Bu test sürecinin sonunda:

1. ✅ Tüm 10 senaryo **%100 doğru çalışmalı**
2. ✅ Backend unit testleri yazılmış olmalı
3. ✅ Hata varsa düzeltilmiş olmalı
4. ✅ Frontend'in güvenle kullanabileceği bir API olmalı

---

## 📞 Sorular ve Destek

Herhangi bir senaryoda belirsizlik varsa veya ek test gerekiyorsa lütfen bildirin. Frontend ve backend tutarlı çalışmalı! 🚀
