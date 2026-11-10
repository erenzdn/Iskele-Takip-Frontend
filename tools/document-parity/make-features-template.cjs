/**
 * features-template.html üretir: şablon editörü araç çubuğundaki HER işlem (punto 8–72, tüm satır
 * aralıkları, başlıklar, biçimler, hizalama, boş satırla boşluk, Shift+Enter, listeler, alanlar,
 * görsel hizaları, sayfa sonu, Düzen menüsü tabloları, sütun genişliği, birleştirilmiş hücre,
 * malzeme tablosu). Editöre HTML olarak eklenir — Düzen menüsünün yaptığı gibi.
 * Kullanım: node tools/document-parity/make-features-template.cjs
 */
const fs = require('fs');
const path = require('path');

const B =
  'border: none !important; border-width: 0 !important; border-style: none !important; border-spacing: 0 !important; box-shadow: none !important; outline: none !important;';
const svg = (w, h, c) =>
  'data:image/svg+xml;base64,' +
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${c}"/></svg>`).toString('base64');
const txt =
  'İskele kiralama sözleşmesi kapsamında teslim edilen malzemeler, kiracının sorumluluğundadır; eksik veya hasarlı iade edilen her parça için güncel liste fiyatı uygulanır. ';
const sizes = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];
const lhs = ['0.7', '0.8', '0.9', '1', '1.15', '1.5', '1.75', '2', '2.5', '3'];

let h = '';
// Düzen → Logo + başlık
h += `<table class="border-none" data-no-border="true" style="width: 100%; ${B}"><tbody><tr>`;
h += `<td style="width: 30%; vertical-align: top; text-align: left; ${B}"><p style="text-align: left;"><img src="${svg(300, 120, '#0f766e')}" data-align="left" width="150"></p></td>`;
h += `<td style="width: 70%; vertical-align: middle; text-align: center; ${B}"><h2 style="text-align: center;">ŞİRKET UNVANI / BAŞLIK</h2><p style="text-align: center;">Sözleşme No: {{sozlesmeNo}}<br>Tarih: {{bugunTarihi}}</p></td>`;
h += '</tr></tbody></table><p></p>';
// Boş satırlarla bırakılan boşluk
h += '<p>Aşağıda 3 boş satır var:</p><p></p><p></p><p></p><p>Boşluk sonrası metin.</p>';
// Tüm puntolar
for (const s of sizes) h += `<p><span style="font-size: ${s}px">${s}px: ${txt.slice(0, s >= 36 ? 40 : 140)}</span></p>`;
// Tüm satır aralıkları; karışık punto ile
for (const lh of lhs) h += `<p style="line-height: ${lh}">Satır aralığı ${lh}: ${txt}${txt.slice(0, 60)}</p>`;
for (const lh of ['1', '2']) {
  h += `<p style="line-height: ${lh}"><span style="font-size: 12px">${txt}</span><span style="font-size: 24px">Büyük </span><span style="font-size: 12px">${txt}</span></p>`;
}
// Başlıklar, biçimler, hizalama, Shift+Enter
h += '<h1>Başlık 1 — Genel Şartlar</h1><h2>Başlık 2 — Ödeme</h2>';
h += `<p><strong>Kalın ${txt.slice(0, 50)}</strong><em> italik ${txt.slice(0, 50)}</em><u> altı çizili ${txt.slice(0, 50)}</u><strong><em> kalın italik</em></strong></p>`;
for (const a of ['left', 'center', 'right']) h += `<p style="text-align: ${a}">Hizalama ${a}: ${txt}</p>`;
h += '<p>Satır sonu (Shift+Enter) ile<br>alt satır<br><br>ve boş satır</p>';
// Listeler
h += `<ul><li><p>Madde bir ${txt.slice(0, 80)}</p></li><li><p>Madde iki</p></li></ul>`;
h += `<ol><li><p>Birinci ${txt}</p></li><li><p>İkinci</p></li></ol>`;
// Dinamik alanlar
h += '<p>Müşteri: {{musteriAdi}} — Adres: {{musteriAdres}} — Vergi: {{musteriVergiDairesi}} / {{musteriVergiNo}}</p>';
// Görseller: sol / sağ / orta / satır içi
h += `<p><img src="${svg(240, 160, '#1a3c5e')}" data-align="left" width="120">${txt}${txt}</p>`;
h += `<p><img src="${svg(240, 160, '#b45309')}" data-align="right" width="180">${txt}${txt}${txt}</p>`;
h += `<p><img src="${svg(400, 100, '#7e22ce')}" data-align="center" width="300"></p>`;
h += `<p>Satır içi görsel <img src="${svg(60, 30, '#15803d')}" width="40"> metnin içinde.</p>`;
// Sayfa sonu
h += '<div data-page-break="true" class="page-break"></div>';
// Düzen → 2 sütun, 3 sütun
h += `<table class="border-none" data-no-border="true" style="width: 100%; ${B}"><tbody><tr>`;
h += `<td style="width: 50%; vertical-align: top; ${B}"><p><strong>Kiraya Veren</strong></p><p>${txt}</p></td>`;
h += `<td style="width: 50%; vertical-align: top; ${B}"><p><strong>Kiracı</strong></p><p>{{musteriAdi}}</p></td>`;
h += '</tr></tbody></table><p></p>';
h += `<table class="border-none" data-no-border="true" style="width: 100%; ${B}"><tbody><tr>`;
for (const i of [1, 2, 3]) {
  h += `<td style="width: 33.33%; vertical-align: top; ${B}"><p><strong>Sütun ${i}</strong></p><p>${txt.slice(0, 70 + i * 20)}</p></td>`;
}
h += '</tr></tbody></table><p></p>';
// Düzen → Boş tablo (çizgili, başlık satırlı)
h += '<table><tbody><tr><th><p>Ürün</p></th><th><p>Miktar</p></th><th><p>Açıklama</p></th></tr>';
for (const r of [1, 2, 3, 4]) h += `<tr><td><p>Ürün ${r}</p></td><td><p>${r * 10}</p></td><td><p>${txt.slice(0, 40 + r * 25)}</p></td></tr>`;
h += '</tbody></table><p></p>';
// Sütun genişliği sürüklenmiş tablo + birleştirilmiş hücre
h += `<table><tbody><tr><td colwidth="90"><p>Dar</p></td><td colwidth="300"><p>${txt}</p></td><td colwidth="160"><p>Orta</p></td></tr>`;
h += `<tr><td colspan="2" colwidth="90,300"><p>Birleştirilmiş hücre ${txt.slice(0, 80)}</p></td><td colwidth="160"><p><span style="font-size: 10px">küçük punto</span></p></td></tr></tbody></table>`;
h += '<p></p><p>{{malzemeTablosu}}</p>';
// Sayfa sınırlarına denk gelen paragraflar (sayfa geçişi)
for (let i = 0; i < 25; i++) {
  h += `<p style="line-height: ${lhs[i % lhs.length]}"><span style="font-size: ${[10, 12, 14, 16, 18][i % 5]}px">${i + 1}) ${txt}</span></p>`;
}
h += '<p></p><p></p><p style="text-align: center"><strong>İMZA</strong></p>';

fs.writeFileSync(path.join(__dirname, 'features-template.html'), h);
console.log(`features-template.html: ${h.length} karakter`);
