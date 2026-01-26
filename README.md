# İskeleTakip Desktop - Electron

Electron + React + TypeScript ile geliştirilmiş masaüstü uygulaması.

## Kurulum

```bash
npm install
```

## Geliştirme

```bash
npm run electron:dev
```

Bu komut hem Vite dev server'ı hem de Electron uygulamasını başlatır.

## Build

```bash
npm run build
```

## Paketleme

```bash
npm run electron:pack
```

Windows installer oluşturmak için:

```bash
npm run electron:build
```

## Proje Yapısı

- `electron/` - Electron main process ve preload script'leri
- `src/` - React uygulaması
  - `components/` - Reusable bileşenler
  - `pages/` - Sayfa bileşenleri
  - `layouts/` - Layout bileşenleri
  - `store/` - Zustand store'ları
  - `services/` - API servisleri
  - `models/` - TypeScript modelleri
  - `hooks/` - Custom React hook'ları
  - `utils/` - Yardımcı fonksiyonlar
  - `styles/` - CSS ve Tailwind stilleri
## API Bağlantısı

Uygulama varsayılan olarak `http://localhost:3000` adresindeki REST API'ye bağlanır. Bu adresi `.env` dosyası ile değiştirebilirsiniz.


