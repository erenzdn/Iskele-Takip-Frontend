## Sistem Yedeği (Backup) Frontend Entegrasyonu

Bu dosya, backend'de eklenen `POST /api/v1/admin/system/backup` endpointinin masaüstü (Electron + React) uygulamasına nasıl entegre edildiğini ve nasıl kullanılacağını özetler.

---

### 1. Yetki / Admin Kontrolü

- **Model güncellemesi**  
  - `src/models/index.ts` içinde `LoginUserDto` arayüzüne opsiyonel alanlar eklendi:
    - `role?: string;`
    - `roleId?: number;`
  - Böylece JWT payload veya başka endpoint'lerden gelen farklı adlandırmalardaki admin bilgileri de yakalanabiliyor.

- **Admin tespit helper'ı**  
  - Yeni dosya: `src/utils/authHelpers.ts`
  - Fonksiyon:
    - `isAdminUser(user: LoginUserDto | null | undefined): boolean`
    - Aşağıdaki senaryolardan herhangi biri admin kabul edilir:
      - `user.role === 'admin'`
      - `user.roleId === 1`
      - `user.RoleId === 1`
      - `user.RoleName?.toLowerCase() === 'admin'`

- **ProtectedRoute genişletmesi**  
  - `src/components/ProtectedRoute.tsx`:
    - Props genişledi:
      - `requiredPermission?: string`
      - `adminOnly?: boolean`
    - Davranış:
      - Oturum yoksa: `/login` sayfasına yönlendirir.
      - `adminOnly === true` ve kullanıcı admin değilse: `/` sayfasına yönlendirir.
      - `requiredPermission` tanımlıysa ve kullanıcı izinlere sahip değilse: `/` sayfasına yönlendirir.

---

### 2. Backup Servis Katmanı

- Yeni servis dosyası: `src/services/adminService.ts`

```ts
import { apiClient } from './apiClient';

export const adminService = {
  async downloadSystemBackupAsync(): Promise<Blob> {
    return apiClient.postBlob('/api/v1/admin/system/backup');
  },
};
```

- `apiClient.postBlob`:
  - JWT token'ı ve imza (request signing) header'larını otomatik ekler.
  - Binary yanıtı `Blob` olarak döner (beklenen: `.sql.gz`).

---

### 3. Sistem Ayarları Sayfası (UI)

- Yeni sayfa: `src/pages/SystemSettingsPage.tsx`
- Amaç: Sadece **admin kullanıcıların** görebildiği bir ekranda:
  - Manuel backup talebini tetiklemek.
  - İndirme sırasında durum göstermek.
  - Son alınan yedek zamanını göstermek.

#### 3.1. Genel davranış

- Sayfa yüklendiğinde:
  - Giriş yapmış kullanıcı `useAuthStore` üzerinden alınır.
  - `isAdminUser(user)` ile admin kontrolü yapılır.
  - Admin değilse: `<Navigate to="/" replace />` ile ana sayfaya yönlendirilir (route koruması).
- Admin ise:
  - Başlık: **Sistem Ayarları**
  - Açıklama: Veritabanı yedeği `.sql.gz` olarak indirileceği belirtilir.
  - Bilgi bloğu:
    - Rate limit: "Saatte en fazla 1 kez manuel yedek alabilirsiniz."
    - Son alınan yedek: LocalStorage'daki `system_last_backup_at` değeri, `tr-TR` locale ile formatlanıp gösterilir.

#### 3.2. Manuel Yedek Al butonu

- Buton:
  - Sınıf: `btn-primary`
  - Metin:
    - Normalde: `Manuel Yedek Al`
    - İşlem sırasında: `Yedek alınıyor...`
  - İkon:
    - Normal: `DownloadSimpleIcon`
    - Yüklenirken: dönen `ArrowClockwiseIcon`

- Tıklama akışı:
  1. `ConfirmModal` açılır:
     - Başlık: `Manuel yedek alınacak`
     - Mesaj:
       - Veritabanının tamamının yedeklendiği,
       - Saatte 1 kez alınabileceği (`429` uyarısı),
       - İşlemin birkaç saniye sürebileceği bilgileri.
  2. Kullanıcı onaylarsa `adminService.downloadSystemBackupAsync()` çağrılır.
  3. Dönen `Blob` için:
     - Dosya adı `iskele-backup-YYYYMMDD-HHmmss.sql.gz` formatında üretilir.
     - `URL.createObjectURL(blob)` ile geçici URL oluşturulur.
     - Geçici `<a>` etiketi ile `download` attribute kullanılarak indirme tetiklenir.
  4. Başarılı durumda:
     - Local state `lastBackupAt` güncellenir (`new Date().toISOString()`).
     - Değer localStorage'a `system_last_backup_at` anahtarıyla yazılır.
     - Üstte yeşil arkaplanlı bir bilgilendirme kutusu gösterilir: `"Yedek başarıyla indirildi."`

#### 3.3. Hata yönetimi

- Hatalar `normalizeErrorMessage` fonksiyonu ile kullanıcı dostu mesajlara dönüştürülür:
  - `status === 403`:
    - `"Bu işlem sadece admin yetkisine sahip kullanıcılar tarafından yapılabilir."`
  - `status === 429`:
    - `"Saatte sadece 1 kez manuel yedek alabilirsiniz. Lütfen daha sonra tekrar deneyin."`
  - Diğer durumlarda:
    - Backend'in döndürdüğü `responseText` varsa aynen gösterilir.
    - Yoksa: `"Yedekleme sırasında bir hata oluştu."`

- Hata veya başarı mesajı:
  - Tip: `StatusMessage = { type: 'success' | 'error'; text: string } | null`
  - Görünüm:
    - Başarı: `border-success/40 bg-success/10 text-success`
    - Hata: `border-error/40 bg-error/10 text-error`

---

### 4. Routing ve Menü Entegrasyonu

#### 4.1. Route

- `src/App.tsx` içinde yeni route:

```tsx
<Route
  path="/system-settings"
  element={
    <ProtectedRoute adminOnly>
      <MainLayout>
        <SystemSettingsPage />
      </MainLayout>
    </ProtectedRoute>
  }
/>
```

- Böylece:
  - Oturum yoksa: `/login`
  - Admin değilse: `/`
  - Sadece admin kullanıcılar bu sayfaya erişebilir.

#### 4.2. Menü (MainLayout)

- `src/layouts/MainLayout.tsx` içinde yönetim menüsüne yeni item:

```ts
const managementMenuItems: MenuItem[] = [
  // ...
  { path: '/system-settings', label: 'Sistem Ayarları', icon: <GearIcon {...iconProps} /> },
];
```

- Filtreleme:
  - Önce mevcut izin tabanlı filtre uygulanır (`filterByPermission`).
  - Ardından Sistem Ayarları için ek admin filtresi eklenir:

```ts
const visibleManagementBase = filterByPermission(managementMenuItems, permissions);
const visibleManagement = visibleManagementBase.filter((item) => {
  if (item.path === '/system-settings') return isAdminUser(user);
  return true;
});
```

- Sonuç:
  - Sistem Ayarları menü elemanı sadece giriş yapmış **admin** kullanıcıya görünür.

---

### 5. Test Senaryosu Özeti

- **Admin kullanıcı ile:**
  - Menüde `Sistem Ayarları` görünür.
  - Sayfa açılır; bilgi bloğu, son yedek zamanı ve buton görüntülenir.
  - **Manuel Yedek Al** butonuna basıldığında:
    - Onay modali çıkar.
    - Onay sonrası `.sql.gz` dosyasının indirmesi başlar.
    - İşlem sonunda yeşil başarı mesajı ve güncel son yedek zamanı görünür.
  - Backend `429` döndürürse:
    - Kırmızı hata kutusunda rate limit mesajı gösterilir.

- **Admin olmayan kullanıcı ile:**
  - Menüde `Sistem Ayarları` görünmez.
  - Adrese manuel gidilmeye çalışılırsa (`/#/system-settings`):
    - `ProtectedRoute` üzerinden `/` ana sayfasına yönlendirilir.

