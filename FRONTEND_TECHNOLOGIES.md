# İskeleTakip Electron - Frontend Teknolojileri

Bu dokümanda İskeleTakip Electron projesinin frontend katmanında kullanılan tüm teknolojiler detaylıca açıklanmaktadır.

---

## Genel Bakış

Proje, masaüstü uygulama olarak **Electron** çerçevesinde çalışan, **React + TypeScript** tabanlı bir SPA (Single Page Application) mimarisine sahiptir. Build ve geliştirme süreçleri **Vite** ile yönetilir.

---

## 1. Çekirdek Teknolojiler

### 1.1 React 18

- **Versiyon:** ^18.2.0
- **Açıklama:** Facebook (Meta) tarafından geliştirilen, kullanıcı arayüzü oluşturmak için kullanılan popüler JavaScript kütüphanesi.
- **Projede Kullanımı:**
  - Bileşen tabanlı (component-based) mimari
  - Functional components ve hooks kullanımı
  - `React.StrictMode` ile geliştirme modunda ek kontroller
  - `ReactDOM.createRoot` ile modern React 18 render API'si

### 1.2 TypeScript 5

- **Versiyon:** ^5.3.3
- **Açıklama:** JavaScript'in üzerine tip güvenliği ekleyen bir süper set.
- **Projede Kullanımı:**
  - Tüm bileşen, servis ve model tanımlamalarında tip güvenliği
  - `tsconfig.json` ile ES2020 hedefi, strict mod açık
  - Path alias (`@/*` → `src/*`) ile temiz import yolları
  - `jsx: "react-jsx"` ile React 17+ JSX dönüşümü
  - `moduleResolution: "bundler"` ile Vite uyumlu modül çözümleme

### 1.3 Electron 28

- **Versiyon:** ^28.0.0
- **Açıklama:** Chromium ve Node.js kullanarak masaüstü uygulamalar geliştirmeye yarayan framework.
- **Projede Kullanımı:**
  - Masaüstü uygulama kabuğu
  - `electron/main.ts` ana süreç (main process)
  - Preload script ile güvenli IPC köprüsü
  - `electron-builder` ile paketleme ve dağıtım

---

## 2. Build Araçları

### 2.1 Vite 5

- **Versiyon:** ^5.0.8
- **Açıklama:** Hızlı geliştirme deneyimi sunan, ESM tabanlı build aracı.
- **Projede Kullanımı:**
  - Geliştirme sunucusu (port 5173)
  - `base: './'` ile relative path desteği (Electron uyumu)
  - `optimizeDeps.include` ile Tiptap gibi kütüphanelerin önceden optimize edilmesi
  - Path alias: `@` → `./src`
  - Output: `dist-web` klasörü

### 2.2 @vitejs/plugin-react

- **Versiyon:** ^4.2.1
- **Açıklama:** Vite ile React desteği sağlayan resmi eklenti (Fast Refresh, JSX dönüşümü).
- **Projede Kullanımı:** `vite.config.ts` içinde `plugins: [react()]` olarak kullanılır.

### 2.3 Diğer Build Araçları

- **concurrently:** Birden fazla komutu eşzamanlı çalıştırır (Vite + TypeScript watch + Electron).
- **wait-on:** Belirli bir URL hazır olana kadar bekler (Electron başlatılmadan önce Vite dev sunucusunun hazır olması için).

---

## 3. Stil ve UI

### 3.1 Tailwind CSS 3

- **Versiyon:** ^3.4.0
- **Açıklama:** Utility-first CSS framework; hızlı ve tutarlı UI stilleri oluşturmayı sağlar.
- **Projede Kullanımı:**
  - Özel renk paleti (dark tema):
    - `background.main`, `panel`, `sidebar`, `border`, `hover`
    - `primary`, `success`, `warning`, `error`, `info`, `purple`
    - `text.primary`, `text.secondary`
  - Özel border radius: `panel`, `button`, `badge`, `input`
  - Component sınıfları: `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-success`, `.card`, `.badge`, `.input`
  - TipTap editor stilleri (ProseMirror)
  - `.table-compact` gibi özel yardımcı sınıflar

### 3.2 PostCSS ve Autoprefixer

- **PostCSS:** ^8.4.32  
- **Autoprefixer:** ^10.4.16  
- **Açıklama:** CSS sonrası işlem (Tailwind derlemesi, vendor prefix'ler).
- **Projede Kullanımı:** `postcss.config.js` ile Tailwind ve Autoprefixer aktif.

---

## 4. Routing ve State Yönetimi

### 4.1 React Router DOM 6

- **Versiyon:** ^6.21.1
- **Açıklama:** React uygulamalarında istemci taraflı routing sağlayan kütüphane.
- **Projede Kullanımı:**
  - `HashRouter` (Electron ile uyum için hash-based routing)
  - `Routes` ve `Route` ile sayfa tanımları
  - `Navigate` ile yönlendirmeler
  - Korumalı rotalar: `ProtectedRoute` ile login zorunluluğu
  - Ana sayfalar: `/`, `/login`, `/customers`, `/inventory`, `/warehouses`, `/contracts`, `/purchase-invoices`, `/price-tiers`, `/pricing-rules`, `/users`, `/audit-logs`

### 4.2 Zustand 4

- **Versiyon:** ^4.4.7
- **Açıklama:** Hafif, hook tabanlı state yönetim kütüphanesi.
- **Projede Kullanımı:**
  - `authStore` ile kimlik doğrulama durumu (token, user, isAuthenticated)
  - `create()` ile store oluşturma
  - `localStorage` ile token ve kullanıcı kalıcılığı
  - `login` ve `logout` action'ları

---

## 5. Zengin Metin Editörü (Tiptap)

### 5.1 Tiptap

- **Temel Paketler:** `@tiptap/react`, `@tiptap/starter-kit`
- **Versiyon:** ^3.17.1
- **Açıklama:** Headless, özelleştirilebilir zengin metin editörü (ProseMirror tabanlı).

### 5.2 Kullanılan Tiptap Eklentileri

| Paket | Açıklama |
|-------|----------|
| `@tiptap/starter-kit` | Paragraph, heading, bold, italic, list vb. temel özellikler |
| `@tiptap/extension-table` | Tablo ekleme |
| `@tiptap/extension-table-row` | Tablo satırı |
| `@tiptap/extension-table-cell` | Tablo hücresi |
| `@tiptap/extension-table-header` | Tablo başlık hücresi |
| `@tiptap/extension-text-align` | Metin hizalama |
| `@tiptap/extension-underline` | Alt çizgi |
| `@tiptap/extension-image` | Görsel ekleme |

### 5.3 Özel Eklenti

- **tiptap-extension-resize-image** (^1.3.2): Görsellerin editör içinde yeniden boyutlandırılması.

### 5.4 Projede Kullanımı

- `ContractTemplateEditorModal` bileşeninde sözleşme şablonları için zengin metin editörü.
- `CustomImageExtension` ile özelleştirilmiş görsel ekleme desteği.

---

## 6. İkon Kütüphanesi

### 6.1 Phosphor Icons (React)

- **Versiyon:** ^2.1.10
- **Açıklama:** Esnek, tutarlı ikon seti; ağırlık (weight) seçenekleri sunar.
- **Projede Kullanımı:**
  - `MainLayout`: Navigasyon ve genel UI ikonları
  - Sayfa ikonları: `UsersIcon`, `PackageIcon`, `WarehouseIcon`, `ClipboardIcon`, `ReceiptIcon`, `CurrencyCircleDollarIcon`, `GearIcon`, `UserIcon`, `ScrollIcon`, `MagnifyingGlassIcon`, `XIcon` vb.

---

## 7. API ve Veri Katmanı

### 7.1 Özel API İstemcisi

- **Dosya:** `src/services/apiClient.ts`
- **Özellikler:**
  - `VITE_API_BASE_URL` ile yapılandırılabilir base URL
  - JWT Bearer token ile kimlik doğrulama (`useAuthStore`)
  - Opsiyonel request signing: HMAC-SHA256 ile imzalama (`VITE_SIGNING_SECRET`, `VITE_SIGNING_ENABLED`)
  - `Signature`, `Timestamp`, `Nonce` header'ları
  - `/health` ve `/auth/login` gibi bazı endpoint'ler imzadan muaf
  - Geliştirme ortamında debug logları

### 7.2 Servis Katmanı

Tüm API çağrıları modüler servisler üzerinden yapılır:

- `authService` – Giriş / oturum yönetimi
- `customerService` – Müşteri CRUD
- `contractService` – Sözleşme işlemleri
- `quoteService` – Teklif işlemleri
- `purchaseInvoiceService` – Alış faturaları
- `inventoryService` – Envanter
- `warehouseService` – Depo yönetimi
- `priceTierService` – Fiyat katmanları
- `pricingRulesService` – Fiyatlandırma kuralları
- `userService` – Kullanıcı yönetimi
- `auditLogService` – Denetim günlükleri
- `contractTemplateService` – Sözleşme şablonları
- `templateImageService` – Şablon görselleri
- `siteService` – Şantiye
- `subcategoryService` – Alt kategori
- `permissionService` – Yetki kontrolü

---

## 8. Proje Mimarisi (Frontend)

```
src/
├── main.tsx           # Uygulama giriş noktası
├── App.tsx            # Ana uygulama, routing tanımları
├── layouts/
│   └── MainLayout.tsx # Ana layout (sidebar, header)
├── pages/             # Sayfa bileşenleri
│   ├── LoginPage.tsx
│   ├── DashboardPage.tsx
│   ├── CustomersPage.tsx
│   ├── InventoryPage.tsx
│   ├── WarehousesPage.tsx
│   ├── ContractsPage.tsx
│   ├── PurchaseInvoicesPage.tsx
│   ├── PriceTiersPage.tsx
│   ├── PricingRulesPage.tsx
│   ├── UsersPage.tsx
│   └── AuditLogsPage.tsx
├── components/        # Yeniden kullanılabilir bileşenler
│   ├── modals/        # Modal bileşenleri
│   ├── ProtectedRoute.tsx
│   ├── EmptyState.tsx
│   ├── SearchableItemCombobox.tsx
│   └── AuditLogTimeline.tsx
├── services/          # API servisleri
├── store/             # Zustand store'ları
├── models/            # TypeScript tip tanımları
├── utils/             # Yardımcı fonksiyonlar
└── styles/
    └── index.css      # Global stiller (Tailwind + özel sınıflar)
```

---

## 9. Ortam Değişkenleri

| Değişken | Açıklama |
|----------|----------|
| `VITE_API_BASE_URL` | Backend API base URL (örn. `http://localhost:3000`) |
| `VITE_SIGNING_ENABLED` | Request signing aktif mi (`true`/`false`) |
| `VITE_SIGNING_SECRET` | HMAC imza için gizli anahtar (signing aktifse zorunlu) |

---

## 10. Özet Tablosu

| Kategori | Teknoloji | Versiyon |
|----------|-----------|----------|
| UI Framework | React | 18.2.0 |
| Dil | TypeScript | 5.3.3 |
| Masaüstü | Electron | 28.0.0 |
| Build | Vite | 5.0.8 |
| Stil | Tailwind CSS | 3.4.0 |
| Routing | React Router DOM | 6.21.1 |
| State | Zustand | 4.4.7 |
| Zengin Metin | Tiptap | 3.17.1 |
| İkonlar | Phosphor Icons | 2.1.10 |

---

Bu dokümantasyon proje yapısına göre güncellenebilir. Son kontrol tarihi: Şubat 2025.
