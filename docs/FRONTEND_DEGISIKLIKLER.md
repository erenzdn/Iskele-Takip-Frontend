# Frontend Değişiklikleri – Şablon ve Belge Sistemi

Bu dosya, şablon kaydetme, önizleme ve sözleşme belgesi akışları için frontend tarafında yapılan ve yapılması gereken değişiklikleri listeler.

---

## Yapılan Değişiklikler

### 1. ContractDetailModal.tsx – Şablon Düzenleme

**Konum:** "Düzenle" butonu (satır ~1136)

**Sorun:** Liste endpoint'i (`GET /contract-templates`) Content döndürmüyordu. "Düzenle" tıklanınca modal boş içerikle açılıyordu.

**Çözüm:** Düzenle tıklanınca önce `getByIdAsync(template.TemplateId)` ile tam şablon alınıyor, sonra modal açılıyor.

```tsx
onClick={async () => {
  const template = templates.find((t) => t.TemplateId === Number(selectedTemplateId));
  if (!template) return;
  try {
    const fullTemplate = await contractTemplateService.getByIdAsync(template.TemplateId);
    setEditingTemplate(fullTemplate);
    setIsNewTemplate(false);
    setIsTemplateEditorOpen(true);
  } catch (error) {
    console.error('Şablon yükleme hatası:', error);
    alert(getApiErrorMessage(error));
  }
}}
```

---

### 2. ContractDetailModal.tsx – Tabloyu Şablona Ekle

**Konum:** "Tabloyu Şablona Ekle" butonu (satır ~1302)

**Sorun:** Liste öğesinde Content olmadığı için boş doc üzerine `{{malzemeTablosu}}` eklenip update ediliyordu; şablonun geri kalanı siliniyordu.

**Çözüm:** İşlem öncesinde `getByIdAsync(template.TemplateId)` ile tam şablon alınıyor, Content oradan kullanılıyor.

```tsx
const fullTemplate = await contractTemplateService.getByIdAsync(template.TemplateId);
const content = JSON.parse(JSON.stringify(fullTemplate.Content || { type: 'doc', content: [] }));
// ... malzeme tablosu ekleme ve update
```

---

### 3. apiError.ts – Validation Hataları

**Konum:** `src/utils/apiError.ts`

**Sorun:** Backend validation hatalarında `{ errors: [...] }` dönüyordu; `getApiErrorMessage` sadece `message` alanına bakıyordu.

**Çözüm:** `errors` array’i desteklendi; her hata için `param: msg` formatında mesaj üretiliyor.

```ts
if (Array.isArray(data?.errors) && data.errors.length > 0) {
  const parts = data.errors.map((e) => {
    const field = e.param || e.path || 'Alan';
    const msg = e.msg || 'Geçersiz değer';
    return `${field}: ${msg}`;
  });
  return parts.join('; ');
}
```

---

### 4. Mevcut Kontroller (Zaten Var)

| Konum | Kontrol | Durum |
|-------|---------|-------|
| `ContractDetailModal` – `handleGenerateDocument` | `blob.size === 0` kontrolü | Var |
| `ContractDetailModal` – `handlePreviewDocument` | Blob boyut, tip, JSON hata kontrolü | Var |
| `ContractTemplateEditorModal` – `handlePreview` | Blob boyut, tip, JSON hata kontrolü | Var |

---

## Yapılması Gereken / Opsiyonel Değişiklikler

### 1. Yükleme Durumu Göstergesi (Düzenle Butonu)

**Öneri:** `getByIdAsync` çağrıldığında buton disabled veya "Yükleniyor..." göstergesi eklenebilir:

```tsx
const [loadingTemplate, setLoadingTemplate] = useState(false);
// ...
onClick={async () => {
  setLoadingTemplate(true);
  try {
    const fullTemplate = await contractTemplateService.getByIdAsync(...);
    // ...
  } finally {
    setLoadingTemplate(false);
  }
}}
// ...
disabled={loadingTemplate}
```

---

### 2. Tabloyu Şablona Ekle – Yükleme Durumu

**Öneri:** İşlem sırasında buton disabled / loading göstergesi eklenebilir (çift tıklama önleme).

---

### 3. Hata Gösterimi – Toast / Modal

**Öneri:** `alert` yerine toast veya modal ile hata gösterimi kullanıcı deneyimini iyileştirir.

---

### 4. previewAsync(id) Kullanımı

**Mevcut:** `contractTemplateService.previewAsync(id)` tanımlı ama kullanılmıyor.

**İleride:** Şablon listesinde "Kayıtlı şablonu önizle" butonu eklenirse:

- `previewAsync(templateId)` ile `POST /contract-templates/:id/preview` çağrılmalı
- `handlePreviewDocument` ile aynı blob boyut/tip ve hata kontrolleri uygulanmalı

---

## API Parametreleri

- Backend `templateId` ve `contractId` için string sayıyı da kabul ediyor.
- Frontend `Number(selectedTemplateId)` kullanımı doğru; ek değişiklik gerekmez.

---

## Özet Tablo

| Değişiklik | Dosya | Durum |
|------------|-------|-------|
| Düzenle – getByIdAsync ile tam şablon | ContractDetailModal.tsx | Yapıldı |
| Tabloyu Ekle – getByIdAsync ile tam şablon | ContractDetailModal.tsx | Yapıldı |
| Validation errors desteği | apiError.ts | Yapıldı |
| Blob boyut/tip kontrolleri | ContractDetailModal, ContractTemplateEditorModal | Zaten var |
| Düzenle – loading göstergesi | ContractDetailModal.tsx | Opsiyonel |
| Tabloyu Ekle – loading göstergesi | ContractDetailModal.tsx | Opsiyonel |
| Toast/modal ile hata gösterimi | Genel | Opsiyonel |
| previewAsync(id) kullanımı | — | İleride |
