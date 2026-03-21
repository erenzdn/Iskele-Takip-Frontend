# İskeleTakip Desktop (Electron)

Electron + React + TypeScript ile geliştirilmiş masaüstü İskele Takip uygulaması.

Uygulama; müşteri, sözleşme, teklif, stok, depo, çek ve rapor süreçlerini masaüstünden yönetebilmeniz için tasarlanmıştır.

## İçindekiler

- Kurulum
- Geliştirme
- Build ve paketleme
- Ortam değişkenleri (.env)
- Proje yapısı
- API ve istek imzalama (request signing)

## Kurulum

Projeyi klonladıktan sonra bağımlılıkları yükleyin:

```bash
npm install
```

Node 18+ kullanmanız tavsiye edilir.

## Geliştirme

Geliştirme modunda çalıştırmak için:

```bash
npm run electron:dev
```

Bu komut hem Vite dev server'ı hem de Electron uygulamasını başlatır.

## Build

Sadece web build (Vite) almak için:

```bash
npm run build
```

Electron için production build (main + preload + renderer) ve sonrasında installer üretmek için:

```bash
npm run electron:build
```

Sadece paketleme (installer oluşturmadan, klasör çıktısı) için:

```bash
npm run electron:pack
```

## Ortam Değişkenleri (.env)

Proje, Vite ile birlikte gelen `import.meta.env` yapısını kullanır. Aşağıdaki değişkenleri `.env` dosyanızda tanımlayabilirsiniz:

```bash
VITE_API_BASE_URL=http://localhost:3000
VITE_SIGNING_ENABLED=false
VITE_SIGNING_SECRET=super-gizli-anahtar
```

- `VITE_API_BASE_URL`: Backend REST API temel adresi. Boş bırakılırsa `http://localhost:3000` kullanılır.
- `VITE_SIGNING_ENABLED`: `true` ise istek imzalama (HMAC) aktiftir, `false` ise devre dışıdır.
- `VITE_SIGNING_SECRET`: İstek imzalamada kullanılacak gizli anahtar. `VITE_SIGNING_ENABLED=true` iken **zorunludur**; tanımlı değilse uygulama başlarken hata fırlatır.

## API ve İstek İmzalama

Tüm HTTP istekleri `src/services/apiClient.ts` içerisindeki `ApiClient` sınıfı üzerinden yapılır.

- Token yönetimi `useAuthStore` (Zustand) üzerinden yapılır ve otomatik olarak `Authorization: Bearer <token>` başlığı eklenir.
- `VITE_SIGNING_ENABLED=true` ise her istek için:
  - `timestamp`, `nonce` üretilir
  - body SHA-256 ile özetlenir
  - HMAC-SHA256 ile imza oluşturulur
  - Aşağıdaki header'lar eklenir:
    - `X-Timestamp`
    - `X-Nonce`
    - `X-Signature`
- `/health` ve `/auth/login` endpoint'leri imzalama dışında tutulur.

Development modunda (`import.meta.env.DEV === true`) istek/yanıt ve imza detayları konsola loglanır.

## Proje Yapısı

- `electron/` - Electron main process ve preload script'leri
- `src/` - React uygulaması
  - `components/` - Yeniden kullanılabilir bileşenler ve modal pencereler
  - `pages/` - Sayfa bileşenleri (müşteri, sözleşme, depo, stok fişi, çek, rapor vb.)
  - `layouts/` - Layout bileşenleri
  - `store/` - Zustand store'ları (auth vb.)
  - `services/` - API servisleri (sözleşmeler, teklifler, raporlar, stok fişleri vb.)
  - `models/` - TypeScript modelleri
  - `hooks/` - Custom React hook'ları
  - `utils/` - Yardımcı fonksiyonlar
  - `styles/` - CSS ve Tailwind stilleri

## Notlar

- Windows için installer çıktıları `electron-builder` ile üretilir.
- Production ortamında ayrıntılı API logları devre dışı bırakılır; sadece geliştirme sırasında detaylı log görürsünüz.
