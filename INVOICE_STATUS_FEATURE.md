# 💰 Fatura Durumu Özelliği

> Faturalar paneline eklenen akıllı fatura takip kartı - Otomatik hesaplama ve uyarı sistemi

---

## 🎯 Özellik

**Faturalar** sekmesinde, sözleşmenin toplam tutarı ile kesilen faturaların karşılaştırılması yapılır ve kullanıcıya aşağıdaki bilgiler otomatik olarak gösterilir:

### 📊 Gösterilen Bilgiler

#### 1. **Sözleşme Tutarı**
Sözleşmenin toplam bedeli (InitialTotalPrice)

#### 2. **Kesilen Fatura**
Şu ana kadar sisteme girilen tüm faturaların toplamı
- Her fatura ekleme/silme/güncelleme sonrası otomatik yenilenir

#### 3. **Kalan Tutar**
Henüz faturalandırılmayan tutar
- **Renk Kodlaması:**
  - 🟡 **Sarı**: Kalan tutar > 0 (henüz faturalandırılacak tutar var)
  - 🟢 **Yeşil**: Kalan tutar = 0 (tam faturalandırma)
  - 🔴 **Kırmızı**: Kalan tutar < 0 (fazla faturalandırma)

#### 4. **Tamamlanma Yüzdesi**
Progress bar ile görsel gösterim
- **0-74%**: 🟡 Sarı bar
- **75-99%**: 🔵 Mavi bar  
- **100%+**: 🟢 Yeşil bar

---

## 🏢 Kiralama Sözleşmeleri için Özel Bilgiler

Kiralama sözleşmelerinde (Type = RENTAL) ek bilgiler gösterilir:

### 📅 Başlangıç Tarihi
Sözleşmenin başlangıç tarihi (StartDate)

### ⏱️ Süre
Sözleşmenin kaç aylık olduğu - **Otomatik hesaplanır**

**Hesaplama Mantığı:**
```typescript
// Başlangıç: 01.01.2026
// Bitiş: 31.12.2026
// Sonuç: 12 ay

// Başlangıç: 15.03.2026
// Bitiş: 14.09.2026
// Sonuç: 6 ay
```

### 🏁 Bitiş Tarihi
Planlanan bitiş tarihi (PlannedEndDate)

---

## 📐 Örnek Senaryolar

### Senaryo 1: 12 Aylık Kiralama - Devam Eden

```
┌──────────────────────── Fatura Durumu ────────────────────────┐
│ 📅 Başlangıç: 01.01.2026  ⏱️ Süre: 12 ay  🏁 Bitiş: 31.12.2026 │
├────────────────────────────────────────────────────────────────┤
│  Sözleşme Tutarı        Kesilen Fatura      Kalan Tutar       │
│  ₺120.000,00            ₺40.000,00          ₺80.000,00         │
│                                                                 │
│  Tamamlanma: [████████░░░░░░░░░░░░] 33%                       │
└────────────────────────────────────────────────────────────────┘

İlk 4 ay faturalandırılmış (4 × ₺10.000 = ₺40.000)
Kalan 8 ay faturalandırılacak (8 × ₺10.000 = ₺80.000)
```

### Senaryo 2: Tam Faturalandırma

```
┌──────────────────────── Fatura Durumu ────────────────────────┐
│ 📅 Başlangıç: 01.03.2026  ⏱️ Süre: 6 ay   🏁 Bitiş: 31.08.2026 │
├────────────────────────────────────────────────────────────────┤
│  Sözleşme Tutarı        Kesilen Fatura      Kalan Tutar       │
│  ₺50.000,00             ₺50.000,00          ₺0,00 ✓            │
│                                                                 │
│  Tamamlanma: [████████████████████] 100%                       │
│                                                                 │
│  ✓ Sözleşme tutarının tamamı faturalandırıldı.                │
└────────────────────────────────────────────────────────────────┘
```

### Senaryo 3: Fazla Faturalandırma (Uyarı!)

```
┌──────────────────────── Fatura Durumu ────────────────────────┐
│ 📅 Başlangıç: 01.01.2026  ⏱️ Süre: 12 ay  🏁 Bitiş: 31.12.2026 │
├────────────────────────────────────────────────────────────────┤
│  Sözleşme Tutarı        Kesilen Fatura      Kalan Tutar       │
│  ₺100.000,00            ₺105.000,00         -₺5.000,00 ⚠️      │
│                                                                 │
│  Tamamlanma: [████████████████████] 105%                       │
│                                                                 │
│  ⚠️ Kesilen faturalar sözleşme tutarını aşıyor!               │
│     Fazla: ₺5.000,00                                           │
└────────────────────────────────────────────────────────────────┘
```

### Senaryo 4: Satış Sözleşmesi (Kiralama Bilgisi Yok)

```
┌──────────────────────── Fatura Durumu ────────────────────────┐
│  Sözleşme Tutarı        Kesilen Fatura      Kalan Tutar       │
│  ₺250.000,00            ₺150.000,00         ₺100.000,00        │
│                                                                 │
│  Tamamlanma: [████████████░░░░░░░░] 60%                       │
└────────────────────────────────────────────────────────────────┘

Satış sözleşmelerinde başlangıç/bitiş/süre bilgisi gösterilmez
```

---

## 🔄 Dinamik Güncelleme

Kart otomatik olarak güncellenir:

✅ Yeni fatura eklendiğinde
✅ Fatura silindiğinde  
✅ Fatura tutarı değiştirildiğinde
✅ Sözleşme uzatıldığında (bitiş tarihi güncellenir)

**Gerçek Zamanlı Hesaplama:**
- Kesilen Fatura = Tüm aktif faturaların toplamı
- Kalan Tutar = Sözleşme Tutarı - Kesilen Fatura
- Tamamlanma % = (Kesilen Fatura / Sözleşme Tutarı) × 100

---

## 💡 Kullanım Alanları

### 1. Muhasebe Takibi
- Hangi sözleşmenin ne kadar faturalandırıldığını hızlıca görmek
- Eksik fatura olan sözleşmeleri tespit etmek

### 2. Aylık Fatura Planlama
- Kaç aylık sözleşme olduğunu görmek
- Kalan ay sayısını hesaplamak
- Aylık ne kadar fatura kesilmesi gerektiğini anlamak

### 3. Hata Tespiti
- Fazla faturalandırma durumlarını anında görmek
- Sözleşme tutarını aşan faturaları tespit etmek

### 4. Raporlama
- Sözleşme başlangıç ve bitiş tarihlerini görmek
- Kiralama süresini ay cinsinden görmek

---

## 🎨 Teknik Detaylar

### Ay Hesaplama Algoritması

```typescript
function calculateMonthDifference(start: string, end: string): number {
  const startDate = new Date(start);
  const endDate = new Date(end);
  
  const yearDiff = endDate.getFullYear() - startDate.getFullYear();
  const monthDiff = endDate.getMonth() - startDate.getMonth();
  const dayDiff = endDate.getDate() - startDate.getDate();
  
  let totalMonths = yearDiff * 12 + monthDiff;
  
  // Eğer bitiş günü başlangıç gününden küçükse bir ay eksilt
  if (dayDiff < 0) {
    totalMonths -= 1;
  }
  
  return totalMonths > 0 ? totalMonths : 0;
}

// Örnekler:
// 01.01.2026 → 31.12.2026 = 12 ay
// 15.03.2026 → 14.09.2026 = 6 ay
// 01.06.2026 → 30.06.2026 = 1 ay
// 20.06.2026 → 19.07.2026 = 1 ay
// 20.06.2026 → 18.07.2026 = 0 ay
```

### Renk Mantığı

```typescript
const color = 
  remainingAmount > 0 ? 'text-amber-400' :   // Kalan var
  remainingAmount === 0 ? 'text-green-400' : // Tam
  'text-red-400';                             // Fazla

const progressColor = 
  percentage >= 100 ? 'bg-green-500' :        // Tamamlandı
  percentage >= 75 ? 'bg-primary' :           // Yakın
  'bg-amber-500';                             // Devam ediyor
```

### Para Birimi Desteği

```typescript
// TRY → ₺
// EUR → €
// USD → $

function getCurrencySymbol(currency?: string): string {
  switch (currency) {
    case 'EUR': return '€';
    case 'USD': return '$';
    default: return '₺';
  }
}
```

---

## 📦 Prop'lar

`ContractInvoicesPanel` bileşenine eklenen yeni prop'lar:

```typescript
interface ContractInvoicesPanelProps {
  contractId: number;
  contractCode?: string;
  contractCurrency?: 'TRY' | 'EUR' | 'USD';
  contractTotalAmount?: number;              // 🆕 Yeni!
  contractStartDate?: string | null;         // 🆕 Yeni!
  contractPlannedEndDate?: string | null;    // 🆕 Yeni!
  isRentalContract?: boolean;                // 🆕 Yeni!
}
```

---

## ✅ Test Senaryoları

### Test 1: Kısmi Faturalandırma
- Sözleşme: ₺100.000
- Fatura 1: ₺30.000
- Fatura 2: ₺20.000
- **Beklenen**: Kalan ₺50.000, %50 tamamlanma

### Test 2: Tam Faturalandırma
- Sözleşme: ₺60.000
- Fatura 1-6: Her biri ₺10.000
- **Beklenen**: Kalan ₺0, %100 tamamlanma, yeşil uyarı

### Test 3: Fazla Faturalandırma
- Sözleşme: ₺80.000
- Faturaların toplamı: ₺90.000
- **Beklenen**: Kalan -₺10.000, %112 tamamlanma, kırmızı uyarı

### Test 4: Kiralama Süresi
- Başlangıç: 01.01.2026
- Bitiş: 31.12.2026
- **Beklenen**: "12 ay" gösterilmeli

### Test 5: Fatura Silme
- Başlangıç: 3 fatura, toplam ₺90.000
- 1 fatura sil (₺30.000)
- **Beklenen**: Toplam ₺60.000'e düşmeli, kalan tutar güncellenmeli

---

## 🎉 Özet

Bu özellik sayesinde kullanıcılar:

✅ Sözleşmenin ne kadarının faturalandırıldığını anında görebilir
✅ Kalan fatura tutarını takip edebilir
✅ Kiralama sözleşmelerinde başlangıç ve süreyi görebilir
✅ Fazla/eksik faturalandırma durumlarını tespit edebilir
✅ Görsel progress bar ile tamamlanma durumunu görebilir

**Muhasebe takibi artık çok daha kolay! 🚀**
