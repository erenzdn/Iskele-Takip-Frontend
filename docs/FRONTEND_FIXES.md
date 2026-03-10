# Frontend Düzeltme Önerileri

Bu dosya, backend ile uyum ve kullanıcı deneyimi için frontend’de yapılması önerilen düzeltmeleri listeler.

---

## 1. Blob Yanıtlarında Boyut ve Tip Kontrolü

Backend artık boş veya geçersiz belge üretiminde **503** ve JSON `{ "message": "..." }` dönüyor; bu durumda `postBlob` hata fırlatıyor ve `getApiErrorMessage(error)` ile mesaj gösterilebiliyor. Yine de ağ veya proxy kaynaklı **200 + boş/yanlış body** ihtimaline karşı tüm blob kullanımlarında aşağıdaki kontroller önerilir.

### 1.1 Sözleşme belgesi indirme — `ContractDetailModal.tsx` — `handleGenerateDocument`

**Sorun:** Blob alındıktan sonra boyut kontrolü yok. Nadiren 200 + boş body gelirse kullanıcı boş dosya indirir.

**Öneri:** İndirme öncesi `blob.size` kontrolü ekleyin; 0 ise uyarı gösterip çıkın.

```tsx
// handleGenerateDocument içinde, blob aldıktan sonra:
const blob = await contractService.generateDocumentAsync(...);

if (blob.size === 0) {
  alert('Belge oluşturulamadı (sunucu boş yanıt döndü).');
  return;
}
// mevcut indirme kodu...
```

---

### 1.2 Şablon içerik önizlemesi — `ContractTemplateEditorModal.tsx` — `handlePreview`

**Sorun:** `previewContentAsync` sonrası blob’un boyutu ve PDF tipi kontrol edilmiyor. Boş veya hata (JSON) body’de 200 gelirse boş/hatalı önizleme açılır.

**Öneri:** Sözleşme önizlemesindekine benzer şekilde boyut + tip kontrolü ve gerekirse blob metnini JSON olarak okuyup `message` gösterin.

```tsx
const handlePreview = async () => {
  if (!editor) return;
  try {
    setIsBusy(true);
    const content = editor.getJSON();
    const blob = await contractTemplateService.previewContentAsync(content);

    if (blob.size === 0) {
      alert('PDF önizlemesi oluşturulamadı (sunucu boş yanıt döndü).');
      return;
    }
    const isPdf = blob.type === 'application/pdf' || blob.type === '';
    if (!isPdf && blob.size < 10000) {
      const text = await blob.text();
      try {
        const j = JSON.parse(text);
        alert('Önizleme hatası: ' + (j.message || text.slice(0, 200)));
      } catch {
        alert('Sunucu PDF döndürmedi. Content-Type: ' + (blob.type || '(boş)'));
      }
      return;
    }

    const url = window.URL.createObjectURL(blob);
    setPdfPreviewUrl(url);
    setShowPdfPreview(true);
  } catch (error) {
    console.error('Preview error:', error);
    alert(getApiErrorMessage(error));
  } finally {
    setIsBusy(false);
  }
};
```

Böylece hem 503/4xx/5xx (throw) hem de 200 + JSON hata body’si kullanıcıya anlamlı mesajla gösterilir.

---

## 2. Sözleşme Önizlemesi — `ContractDetailModal.tsx` — `handlePreviewDocument`

**Mevcut durum:** Blob boyutu, tip ve küçük body’de JSON mesaj kontrolü zaten var; 503/5xx durumunda `postBlob` throw ettiği için `getApiErrorMessage(error)` kullanılıyor. Bu kısım yeterli.

**İsteğe bağlı:** Hata mesajını `alert` yerine toast veya modal ile göstermek kullanıcı deneyimini iyileştirir.

---

## 3. API Parametreleri — Sayı Gönderimi

Backend artık `templateId` ve `contractId` için string sayıyı da kabul ediyor (örn. `"1"`). Frontend’de `Number(selectedTemplateId)` kullanımı doğru; `selectedTemplateId` select’ten string gelse bile sorun yok. Ek bir düzeltme gerekmez.

---

## 4. Şablon Önizlemesi (Kayıtlı şablon) — `contractTemplateService.previewAsync(id)`

**Mevcut durum:** `previewAsync(id)` sadece serviste tanımlı; projede şu an **çağrılmıyor** (sadece `previewContentAsync` kullanılıyor). İleride “Kayıtlı şablonu PDF önizle” gibi bir buton eklenirse:

- Aynı blob boyut/tip ve JSON hata kontrolünü uygulayın.
- Hata durumunda `getApiErrorMessage(error)` kullanın (503/5xx throw edildiği için zaten çalışır).

---

## 5. Hata Mesajlarının Tutarlı Gösterimi

Tüm blob/önizleme akışlarında:

- **Throw edilen hatalar (4xx/5xx):** `getApiErrorMessage(error)` kullanılıyor; backend’in `{ "message": "..." }` yanıtı doğru parse ediliyor. Değişiklik gerekmez.
- **200 + boş/yanlış body:** Yukarıdaki blob kontrolleri eklendiğinde hem “boş yanıt” hem de “PDF değil, muhtemelen JSON hata” mesajı kullanıcıya gösterilmiş olur.

---

## 6. Electron / PDF Pencere

- CSP’de `frame-src 'self' blob:` ve `object-src 'self' blob:` tanımlı; iframe ile blob PDF önizlemesi açılabilir.
- “Yeni pencerede aç” için `openPdfWindow(blobUrl)` kullanılıyor; ana süreçte blob URL yeni pencerede açılıyor. Ek düzeltme gerekmez.

---

## Özet Tablo

| Konum | Öneri | Öncelik |
|-------|--------|---------|
| `ContractDetailModal` – `handleGenerateDocument` | İndirme öncesi `blob.size === 0` kontrolü | Orta |
| `ContractTemplateEditorModal` – `handlePreview` | Blob boyut + tip + küçük body’de JSON `message` gösterme | Yüksek |
| `ContractDetailModal` – `handlePreviewDocument` | Mevcut kontroller yeterli | — |
| `getApiErrorMessage` / 503 kullanımı | Mevcut kullanım doğru | — |
| `previewAsync(id)` kullanımı | Kullanıma alınırsa aynı blob/hata kuralları uygulanmalı | Düşük |

Bu adımlar uygulandığında, backend’in 503 ve anlamlı hata mesajları ile frontend’deki blob/önizleme davranışı tutarlı hale gelir ve kullanıcı yanlış veya boş yanıtları daha net görür.
