# PDF Önizleme – Backend Kontrol Listesi

Önizleme hâlâ çalışmıyorsa sunucunun döndürdüğü yanıtı kontrol edin.

## 1. Frontend’de hemen kontrol

1. Uygulamada **Önizle**’ye tıklayın.
2. **F12** → **Console** sekmesine bakın:
   - `[PDF Önizleme] Blob: { size: ..., type: "..." }` satırını bulun.
   - `size: 0` ise sunucu **boş** yanıt gönderiyor.
   - `type` değeri `"application/pdf"` değilse (ör. `"application/json"`, `"text/html"`) sunucu PDF değil başka bir şey döndürüyor.

3. **Network** sekmesinde `preview-document` isteğine tıklayın:
   - **Headers** → **Response Headers**:
     - `Content-Type` mutlaka **`application/pdf`** olmalı.
     - `Content-Length` 0’dan büyük olmalı (PDF boyutu).
   - **Response** / **Preview**: İçerik gerçekten PDF mi, yoksa JSON/hata metni mi bakın.

## 2. Backend’de kontrol edilmesi gerekenler

`POST /contracts/:id/preview-document` endpoint’i:

| Kontrol | Beklenen |
|--------|----------|
| HTTP durum kodu | `200 OK` |
| Response header `Content-Type` | `application/pdf` (başka bir şey değil) |
| Response body | Gerçek PDF binary (boş veya JSON/hata metni değil) |
| Content-Disposition | İnline için `inline` veya header yok; `attachment` zorunlu değil |

### Sık görülen backend hataları

- **Boş body:** PDF oluşturulmadan `res.send()` / boş stream gönderilmesi.
- **Yanlış Content-Type:** Hata dönerken `Content-Type: application/json` veya `text/plain` kalması, PDF dönünce de değiştirilmemesi.
- **Hata ama 200:** İstek başarısız olsa bile 200 dönüp body’de `{ "message": "..." }` gönderilmesi; frontend blob’u PDF sanıyor.

### Örnek doğru yanıt (Node/Express)

```js
res.setHeader('Content-Type', 'application/pdf');
res.setHeader('Content-Length', pdfBuffer.length);
res.send(pdfBuffer);
```

Veya stream:

```js
res.setHeader('Content-Type', 'application/pdf');
pdfStream.pipe(res);
```

## 3. Sonuç

- Console’da **size: 0** veya **type farklı** → Sorun büyük ihtimalle **backend** (boş veya yanlış içerik/tip).
- **size > 0** ve **type: "application/pdf"** → Yanıt doğru; sorun büyük ihtimalle **frontend** (CSP, iframe, Electron penceresi vb.).

Bu dosyayı backend geliştiricisi ile paylaşabilirsiniz.
