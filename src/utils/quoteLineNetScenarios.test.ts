import { describe, expect, it } from 'vitest';
import { discountPercentFromNet, lineNetFromGross, roundTo } from './lineDiscount';

/** QuoteDetailModal.getLineTotal (RENTAL) ile aynı: (aylık/30) × miktar × fatura günü */
function rentalGross(monthly: number, qty: number, billedDays: number): number {
  return (monthly / 30) * qty * billedDays;
}

/** QuoteDetailModal.getLineTotal (SALE) ile aynı */
function saleGross(unitPrice: number, qty: number): number {
  return unitPrice * qty;
}

describe('teklif satırı senaryoları', () => {
  it('yeşil toplama kuruş yazınca kiralama satırında net kalır', () => {
    const gross = rentalGross(150, 10, 30);
    const target = roundTo(gross - 0.5, 2);
    const r = discountPercentFromNet(gross, target);
    expect(r.normalizedNet).toBe(target);
    expect(lineNetFromGross(gross, r.discountPercent)).toBe(target);
  });

  it('miktar artınca iskonto % aynı kalır, net orantılı büyür (eski nete kilitlenmez)', () => {
    const monthly = 150;
    const days = 30;
    const first = discountPercentFromNet(rentalGross(monthly, 10, days), 1499.5);
    expect(first.normalizedNet).toBe(1499.5);

    const afterQty = lineNetFromGross(rentalGross(monthly, 20, days), first.discountPercent);
    expect(afterQty).toBe(2999);
    expect(afterQty).not.toBe(roundTo(rentalGross(monthly, 20, days), 2));
  });

  it('aylık fiyat değişince iskonto % aynı kalır, net yeni brüte göre hesaplanır', () => {
    const qty = 10;
    const days = 30;
    const first = discountPercentFromNet(rentalGross(150, qty, days), 1499.5);
    const afterPrice = lineNetFromGross(rentalGross(200, qty, days), first.discountPercent);
    expect(afterPrice).toBe(1999.33);
    expect(afterPrice).not.toBe(2000);
  });

  it('fatura günü 30→45 olunca net, aynı % ile yeni brüte uyar', () => {
    const first = discountPercentFromNet(rentalGross(150, 10, 30), 1499.5);
    const afterDays = lineNetFromGross(rentalGross(150, 10, 45), first.discountPercent);
    expect(afterDays).toBe(2249.25);
  });

  it('satış satırında miktar × birim fiyat sonrası kuruşluk net korunur', () => {
    const gross = saleGross(1234.56, 3);
    const target = roundTo(gross - 0.01, 2);
    const r = discountPercentFromNet(gross, target);
    expect(r.normalizedNet).toBe(target);

    const afterQty = lineNetFromGross(saleGross(1234.56, 6), r.discountPercent);
    expect(afterQty).toBe(lineNetFromGross(saleGross(1234.56, 6), r.discountPercent));
    expect(afterQty).not.toBe(roundTo(saleGross(1234.56, 6), 2));
  });

  it('iki satır bağımsız iskonto tutabilir (biri net, diğeri %0)', () => {
    const a = discountPercentFromNet(1000, 999.95);
    const bGross = rentalGross(80, 5, 30);
    const bNet = lineNetFromGross(bGross, 0);
    expect(a.normalizedNet).toBe(999.95);
    expect(bNet).toBe(roundTo(bGross, 2));
    expect(a.discountPercent).not.toBe(0);
  });

  it('float kiralama brütünde görünen tutarı yeniden yazınca %0 kalır', () => {
    const gross = rentalGross(100, 10, 30);
    const displayed = lineNetFromGross(gross, 0);
    const r = discountPercentFromNet(gross, displayed);
    expect(r.discountPercent).toBe(0);
    expect(r.normalizedNet).toBe(displayed);
  });

  it('büyük kiralama tutarında 1 kuruşluk hedefi kaçırmaz', () => {
    const gross = rentalGross(2500, 40, 60);
    const target = roundTo(roundTo(gross, 2) - 0.01, 2);
    const r = discountPercentFromNet(gross, target);
    expect(r.normalizedNet).toBe(target);
  });

  it('paket iskontosu %10 iken net, sonra miktar artışı %10 ile ölçeklenir', () => {
    const g1 = saleGross(100, 4);
    const net1 = lineNetFromGross(g1, 10);
    expect(net1).toBe(360);
    const net2 = lineNetFromGross(saleGross(100, 8), 10);
    expect(net2).toBe(720);
  });
});
