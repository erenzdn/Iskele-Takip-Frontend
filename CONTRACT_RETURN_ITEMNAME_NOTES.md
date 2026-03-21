# Sözleşme İade Ekranında Ürün İsimleri – Frontend Çözümü Notları

Bu dosya, sözleşme **parçalı iade** ekranında (`ContractDetailModal`) ürün isimlerinin neden `"Bilinmiyor"` göründüğünü ve bunu **frontend tarafında** nasıl çözdüğümüzü anlatır.  
Ayrıca, “ideal” backend tabanlı çözümü ve şu anda neden uygulanmadığını da özetler.

---

## 1. Problem: Neden `"Bilinmiyor"` Görünüyordu?

İade ekranındaki ürün kartları `ContractDetailModal` içinde şu şekilde oluşturuluyor:

- Sözleşme detayları `GET /contracts/:id` ile geliyor.
- Backend bu endpointte sözleşme üst bilgisine ek olarak **detayları** `details` alanında döndürüyor.
- Her detail içinde **`ItemId`** var, ancak **`ItemName` (ürün adı) yok**.
- Frontend bu yüzden isimleri ayrıca yüklemek için şu stratejiyi kullanıyordu:

```tsx
// (Özet) Eski mantık – her item için tek tek çağrı
for each contractItem:
  try:
    inventoryItem = GET /inventory/{ItemId}
    ItemName = inventoryItem.ItemName
  catch:
    ItemName = "Bilinmiyor"
```

Sorunlar:

- Backend tarafında `/inventory/:id` endpoint’i:
  - Ya henüz tam implemente edilmemiş,
  - Ya da bazı eski veriler için 404/500 dönüyor.
- Bu durumda `catch` bloğu çalışıyor ve **ürün adı `"Bilinmiyor"`** olarak set ediliyor.
- Kullanıcı arayüzünde de aynı metin görünüyor.

---

## 2. Uygulanan Çözüm: `availableItems` Üzerinden Eşleme

`ContractDetailModal` açılırken zaten şu çağrılar yapılıyor:

- `GET /inventory` → tüm envanter listesi (`availableItems`)
- `GET /contracts/:id` → sözleşme + detaylar (`details`)

Yani elimizde zaten **tüm ürünlerin (ItemId, ItemName, …)** bulunduğu `availableItems` listesi var.

Bunun üzerine uygulanan çözüm:

- `contractItems` içindeki her detail için:
  - Eğer `ItemName` boş **veya** `"Bilinmiyor"` ise,
  - `availableItems` listesinden **`ItemId` ile eşleşen** kaydı bul,
  - Oradan `ItemName` (ve mümkünse diğer alanları) doldur.

Avantajları:

- Ekstra `/inventory/:id` çağrıları **yapılmıyor**.
- Var olan **`GET /inventory`** sonucunu kullanıyor (tek istek).
- Backend değişikliği gerektirmeden, sadece frontend ile çözüm sunuyor.

Mantığın özeti (TypeScript benzeri pseudo-code):

```ts
// availableItems: GET /inventory sonucu
// contractItems: GET /contracts/:id → details’den map’lenmiş dizi

if (availableItems.length > 0 && contractItems.length > 0) {
  const map = new Map<number, Inventory>();
  for (const inv of availableItems) {
    map.set(inv.ItemId, inv);
  }

  contractItems = contractItems.map(item => {
    // Zaten düzgün bir isim varsa dokunma
    if (item.ItemName && item.ItemName !== 'Bilinmiyor') return item;

    const inv = map.get(item.ItemId);
    if (!inv) return item; // Envanterde yoksa aynı bırak

    return {
      ...item,
      Item: inv,
      ItemName: inv.ItemName,
    };
  });
}
```

Bu sayede:

- İade ekranında ürün adları, **envanter listesinden güvenilir şekilde** dolduruluyor.
- `/inventory/:id`’ye bağımlılık minimuma indiriliyor.

---

## 3. Neden Alternatif (Backend Join) Yolu Şu Anda Kullanılmıyor?

“Daha ideal” / “daha kurumsal” çözüm şu olurdu:

- Backend’de `GET /contracts/:id` endpoint’i, sözleşme detaylarını çekerken:
  - `ContractDetails` tablosunu,
  - `Inventories` tablosu ile JOIN eder,
  - Her detail için **`ItemName`** (ve istenirse `CategoryName` vb.) direkt JSON cevabına ekler.

Örnek backend tarafı (konsept olarak):

```sql
SELECT cd."DetailId",
       cd."ContractId",
       cd."ItemId",
       cd."WarehouseId",
       cd."RentedQuantity",
       cd."ReturnedQuantity",
       cd."DailyPriceAtRent",
       i."ItemName"
FROM "ContractDetails" cd
LEFT JOIN "Inventories" i ON cd."ItemId" = i."ItemId"
WHERE cd."ContractId" = $1;
```

Ve route tarafında:

```js
const contract = await getContract(id);
const details = await listContractDetails(id); // Artık ItemName içeriyor
res.json({ ...contract, details });
```

Frontend de sadece:

```ts
ItemName: detail.ItemName
```

ile çalışır; ekstra hiçbir lookup’a gerek kalmaz.

**Bu yolun şu anda uygulanmama sebepleri:**

- Backend projesi ayrı bir repo / ayrı bir ekip / ayrı bir AI tarafından yönetiliyor olabilir.
- Frontend tarafında, backend’e dokunmadan hızlı bir çözüm üretmek isteniyor.
- Canlı sistemde backend schema / query değişikliği daha riskli olabilir; önce frontend ile sorun görünür şekilde çözüldü, backend iyileştirmesi daha sonra planlanabilir.

Dolayısıyla:

- Şu anki çözüm, **backend’e dokunmadan**, sadece frontend kodu ile problemi gideren **pratik ve performanslı** bir yaklaşımdır.
- Uzun vadede, backend tarafında:
  - `GET /contracts/:id` → detaylarda `ItemName` (ve gerekirse `WarehouseName`) dönecek şekilde iyileştirildiğinde,
  - Frontend’deki bu lookup mantığı **fallback** olarak bırakılabilir veya sadeleştirilebilir.

---

## 4. Önerilen Uzun Vadeli Mimari

1. **Backend**  
   - `GET /contracts/:id` → detaylar:
     - `DetailId, ItemId, WarehouseId, RentedQuantity, ReturnedQuantity, DailyPriceAtRent, ItemName, WarehouseName`
   - Böylece sözleşme detayı **“self-contained”** olur.

2. **Frontend**  
   - Öncelikle backend’ten gelen `detail.ItemName` değerini kullanır.
   - Sadece geriye dönük uyumluluk için:
     - Eğer `ItemName` boşsa, `availableItems` üzerinden eşleme stratejisi yedek (fallback) olarak kalır.

Bu kombinasyon, hem **profesyonel API tasarımına**, hem de **uygulamadaki mevcut veri durumuna** en iyi şekilde uyum sağlar.

