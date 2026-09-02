/**
 * Backend widgetRegistry.js ile aynı HTML çıktısı — editör WYSIWYG önizlemesi için.
 * Değişikliklerde backend registry ile birlikte güncellenmelidir.
 */

const EMPTY = '—';
const MS_PER_DAY = 1000 * 60 * 60 * 24;

type MaterialDetail = {
  ItemName?: string;
  Description?: string;
  IsManual?: boolean;
  RentedQuantity?: number;
  ReturnedQuantity?: number;
  Quantity?: number;
  UnitPriceSnapshot?: number;
  DailyPrice?: number;
  LineTotal?: number;
  UnitName?: string;
  RentalUnit?: string;
  EffectiveStartDate?: string | null;
  Categories?: Array<{ RentalUnit?: string }>;
};

type ReturnDetail = {
  ItemName?: string;
  ReturnQuantity?: number;
  ReturnDate?: string;
  LateDays?: number;
  LateFee?: number;
  ItemId?: number | null;
  WarehouseId?: number | null;
  IsNonPhysicalSettlement?: boolean;
  SettlementReason?: string;
  SettlementCharge?: number;
  InventoryUnitPriceSnapshot?: number;
  ReturnId?: number;
};

type MovementItem = {
  product_name: string;
  dispatched: number;
  returned: number;
  current_on_site: number;
};

type TableOptions = {
  currency?: string;
  contractType?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  iskonto?: number;
};

type ReturnTableOptions = TableOptions & {
  periodStart?: string | null;
  periodEnd?: string | null;
  details?: MaterialDetail[];
  contractStartDate?: string | null;
};

const MT = {
  table:
    'width:100%;border-collapse:collapse;margin:4px 0;font-size:8.5pt;line-height:1.15;table-layout:fixed;',
  th: 'border:0.5pt solid #888;padding:1px 4px;background:#eee;font-weight:600;font-size:8.5pt;line-height:1.15;vertical-align:middle;',
  td: 'border:0.5pt solid #bbb;padding:1px 4px;font-size:8.5pt;line-height:1.15;vertical-align:middle;word-wrap:break-word;overflow-wrap:anywhere;',
  thL: 'text-align:left;',
  thC: 'text-align:center;',
  thR: 'text-align:right;',
  tdL: 'text-align:left;',
  tdC: 'text-align:center;white-space:nowrap;',
  tdR: 'text-align:right;white-space:nowrap;',
  foot: 'background:#eee;font-weight:700;',
};

const CONTRACT_TABLE_COLGROUP = `<colgroup>
        <col style="width:12%"><col style="width:22%"><col style="width:8%">
        <col style="width:8%"><col style="width:12%"><col style="width:10%">
        <col style="width:14%"><col style="width:14%">
      </colgroup>`;

function escapeHtml(value: unknown): string {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cellText(value: unknown): string {
  if (value == null) return EMPTY;
  const s = String(value).trim();
  return s === '' ? EMPTY : s;
}

export function resolveCurrencyCode(currencyOrSymbol: unknown): string {
  const v = String(currencyOrSymbol ?? '').trim().toUpperCase();
  if (v === 'EUR' || currencyOrSymbol === '€') return 'EUR';
  if (v === 'USD' || currencyOrSymbol === '$') return 'USD';
  if (v === 'TL' || v === 'TRY' || currencyOrSymbol === '₺') return 'TRY';
  return 'TRY';
}

export function currencySuffix(currencyOrSymbol: unknown = 'TRY'): string {
  const code = resolveCurrencyCode(currencyOrSymbol);
  if (code === 'EUR') return 'EUR';
  if (code === 'USD') return 'USD';
  return 'TL';
}

function formatDateCell(date: unknown): string {
  if (date == null || date === '') return EMPTY;
  const d = new Date(String(date));
  if (Number.isNaN(d.getTime())) return EMPTY;
  return d.toLocaleDateString('tr-TR');
}

export function formatMoneyCell(amount: unknown, currencyOrSymbol: unknown = 'TRY'): string {
  if (amount == null || amount === '') return EMPTY;
  const n = Number(amount);
  if (!Number.isFinite(n)) return EMPTY;
  const suffix = currencySuffix(currencyOrSymbol);
  const formatted = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
  return `${formatted} ${suffix}`;
}

export function computeUsageDays(startDate: unknown, endDate: unknown): number | null {
  if (startDate == null || startDate === '' || endDate == null || endDate === '') return null;
  const start = new Date(String(startDate));
  const end = new Date(String(endDate));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const days = Math.ceil((end.getTime() - start.getTime()) / MS_PER_DAY);
  if (!Number.isFinite(days) || days <= 0) return null;
  return days;
}

function formatUsageDaysCell(days: number | null): string {
  if (days == null || !Number.isFinite(days)) return EMPTY;
  return `${days} gün`;
}

export function computeLineAmounts(item: MaterialDetail, ctx: TableOptions = {}) {
  const isSale = ctx.contractType === 'SALE';
  const isManual = item?.IsManual === true;
  const iskontoPct = Number(ctx.iskonto);
  const discountFactor =
    Number.isFinite(iskontoPct) && iskontoPct > 0 ? Math.max(0, 1 - iskontoPct / 100) : 1;

  const qty = Number(item?.RentedQuantity ?? 0);
  const returned = Number(item?.ReturnedQuantity ?? 0);
  const remaining = Math.max(0, (Number.isFinite(qty) ? qty : 0) - (Number.isFinite(returned) ? returned : 0));
  const priceRaw = item?.UnitPriceSnapshot;
  const price = priceRaw == null || priceRaw === undefined ? NaN : Number(priceRaw);

  const lineStart = item?.EffectiveStartDate ?? ctx.startDate ?? null;
  const lineEnd = ctx.endDate ?? null;
  const usageDays = computeUsageDays(lineStart, lineEnd);

  if (!Number.isFinite(price) || !Number.isFinite(qty)) {
    return { usageDays, discountedAmount: null, activeAmount: null };
  }

  let grossFull: number;
  let grossActive: number;
  if (isSale || isManual) {
    grossFull = price * qty;
    grossActive = price * remaining;
  } else if (usageDays == null) {
    return { usageDays: null, discountedAmount: null, activeAmount: null };
  } else {
    grossFull = price * qty * usageDays;
    grossActive = price * remaining * usageDays;
  }

  return {
    usageDays,
    discountedAmount: grossFull * discountFactor,
    activeAmount: grossActive * discountFactor,
  };
}

export function resolveMeasureUnit(item: MaterialDetail): string {
  const unitName = String(item?.UnitName ?? '').trim();
  if (unitName) return unitName;

  const rentalUnit = String(item?.RentalUnit ?? '').trim();
  if (rentalUnit) return rentalUnit;

  if (Array.isArray(item?.Categories)) {
    for (const cat of item.Categories) {
      const fromCat = String(cat?.RentalUnit ?? '').trim();
      if (fromCat) return fromCat;
    }
  }

  return 'Adet';
}

function normalizeTableOptions(
  currencyOrOptions: string | TableOptions | undefined,
  contractType: string | null = null
): TableOptions {
  if (currencyOrOptions && typeof currencyOrOptions === 'object') {
    return {
      currency: currencyOrOptions.currency ?? currencyOrOptions.currencySymbol ?? 'TRY',
      contractType: currencyOrOptions.contractType ?? contractType ?? null,
      startDate: currencyOrOptions.startDate ?? null,
      endDate: currencyOrOptions.endDate ?? null,
      iskonto: currencyOrOptions.iskonto ?? 0,
    };
  }
  return {
    currency: currencyOrOptions ?? 'TRY',
    contractType: contractType ?? null,
    startDate: null,
    endDate: null,
    iskonto: 0,
  };
}

function createQuoteMaterialTableHTML(details: MaterialDetail[], currency: string): string {
  let html = `
    <table class="malzeme-tablosu" style="${MT.table}">
      <colgroup>
        <col style="width:42%">
        <col style="width:10%">
        <col style="width:10%">
        <col style="width:19%">
        <col style="width:19%">
      </colgroup>
      <thead>
        <tr>
          <th style="${MT.th}${MT.thL}">Malzeme</th>
          <th style="${MT.th}${MT.thC}">Miktar</th>
          <th style="${MT.th}${MT.thC}">Birim</th>
          <th style="${MT.th}${MT.thR}">Günlük Fiyat</th>
          <th style="${MT.th}${MT.thR}">Toplam</th>
        </tr>
      </thead>
      <tbody>
  `;

  let grandTotal = 0;
  for (const item of details) {
    const qty = Number(item.Quantity ?? 0);
    const price = Number(item.UnitPriceSnapshot ?? item.DailyPrice ?? 0);
    const total = Number(item.LineTotal ?? qty * price);
    const unit = resolveMeasureUnit(item);
    grandTotal += Number.isFinite(total) ? total : 0;
    html += `
      <tr>
        <td style="${MT.td}${MT.tdL}">${escapeHtml(cellText(item.ItemName))}</td>
        <td style="${MT.td}${MT.tdC}">${escapeHtml(cellText(Number.isFinite(qty) ? qty : null))}</td>
        <td style="${MT.td}${MT.tdC}">${escapeHtml(unit)}</td>
        <td style="${MT.td}${MT.tdR}">${escapeHtml(formatMoneyCell(price, currency))}</td>
        <td style="${MT.td}${MT.tdR}">${escapeHtml(formatMoneyCell(total, currency))}</td>
      </tr>
    `;
  }

  html += `
      </tbody>
      <tfoot>
        <tr style="${MT.foot}">
          <td colspan="4" style="${MT.td}${MT.thR}">Toplam:</td>
          <td style="${MT.td}${MT.tdR}">${escapeHtml(formatMoneyCell(grandTotal, currency))}</td>
        </tr>
      </tfoot>
    </table>
  `;

  return html;
}

function createContractMaterialTableHTML(details: MaterialDetail[], options: TableOptions): string {
  const currency = options.currency ?? 'TRY';

  let html = `
    <table class="malzeme-tablosu" style="${MT.table}">
      ${CONTRACT_TABLE_COLGROUP}
      <thead>
        <tr>
          <th style="${MT.th}${MT.thC}">Veriliş Tarihi</th>
          <th style="${MT.th}${MT.thL}">Ürün Adı</th>
          <th style="${MT.th}${MT.thC}">Miktar</th>
          <th style="${MT.th}${MT.thC}">Birim</th>
          <th style="${MT.th}${MT.thR}">Birim Fiyat</th>
          <th style="${MT.th}${MT.thC}">Kullanım Süresi</th>
          <th style="${MT.th}${MT.thR}">İskontolu Tutar</th>
          <th style="${MT.th}${MT.thR}">Aktif Tutar</th>
        </tr>
      </thead>
      <tbody>
  `;

  for (const item of details) {
    const name =
      item.ItemName ||
      (item.IsManual ? item.Description : null) ||
      item.Description ||
      null;
    const qty = Number(item.RentedQuantity ?? 0);
    const priceRaw = item.UnitPriceSnapshot;
    const price = priceRaw == null || priceRaw === undefined ? NaN : Number(priceRaw);
    const unit = resolveMeasureUnit(item);
    const deliveryDate = item.EffectiveStartDate ?? options.startDate ?? null;
    const amounts = computeLineAmounts(item, options);

    html += `
      <tr>
        <td style="${MT.td}${MT.tdC}">${escapeHtml(formatDateCell(deliveryDate))}</td>
        <td style="${MT.td}${MT.tdL}">${escapeHtml(cellText(name))}</td>
        <td style="${MT.td}${MT.tdC}">${escapeHtml(cellText(Number.isFinite(qty) ? qty : null))}</td>
        <td style="${MT.td}${MT.tdC}">${escapeHtml(unit)}</td>
        <td style="${MT.td}${MT.tdR}">${escapeHtml(formatMoneyCell(price, currency))}</td>
        <td style="${MT.td}${MT.tdC}">${escapeHtml(formatUsageDaysCell(amounts.usageDays))}</td>
        <td style="${MT.td}${MT.tdR}">${escapeHtml(formatMoneyCell(amounts.discountedAmount, currency))}</td>
        <td style="${MT.td}${MT.tdR}">${escapeHtml(formatMoneyCell(amounts.activeAmount, currency))}</td>
      </tr>
    `;
  }

  html += `
      </tbody>
    </table>
  `;

  return html;
}

export function createMaterialTableHTML(
  details: MaterialDetail[],
  currencyOrOptions: string | TableOptions = 'TRY',
  contractType: string | null = null
): string {
  if (!details || details.length === 0) {
    return '<p>Malzeme bulunmuyor</p>';
  }

  const options = normalizeTableOptions(currencyOrOptions, contractType);
  const isContract =
    details[0].RentedQuantity !== undefined && details[0].UnitPriceSnapshot !== undefined;

  if (!isContract) {
    return createQuoteMaterialTableHTML(details, options.currency ?? 'TRY');
  }

  return createContractMaterialTableHTML(details, options);
}

export function createLateFeeTableHTML(
  returns: ReturnDetail[],
  currencyOrSymbol: unknown = 'TRY'
): string {
  const lateReturns = (returns || []).filter((r) => Number(r.LateDays ?? 0) > 0);
  const suffix = currencySuffix(currencyOrSymbol);

  if (lateReturns.length === 0) {
    return '<p>Gecikme kaydı bulunmuyor</p>';
  }

  let html = `
    <table style="width: 100%; border-collapse: collapse; margin: 10px 0;">
      <thead>
        <tr style="background-color: #f0f0f0;">
          <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Malzeme</th>
          <th style="border: 1px solid #ddd; padding: 8px; text-align: center;">Adet</th>
          <th style="border: 1px solid #ddd; padding: 8px; text-align: center;">İade Tarihi</th>
          <th style="border: 1px solid #ddd; padding: 8px; text-align: center;">Geciken Gün</th>
          <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Gecikme Ücreti</th>
        </tr>
      </thead>
      <tbody>
  `;

  let totalLateFee = 0;
  for (const ret of lateReturns) {
    totalLateFee += Number(ret.LateFee ?? 0);
    html += `
      <tr>
        <td style="border: 1px solid #ddd; padding: 8px;">${escapeHtml(ret.ItemName || '')}</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${ret.ReturnQuantity}</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${formatDateCell(ret.ReturnDate)}</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${ret.LateDays}</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${Number(ret.LateFee ?? 0).toFixed(2)} ${suffix}</td>
      </tr>
    `;
  }

  html += `
      </tbody>
      <tfoot>
        <tr style="background-color: #f0f0f0; font-weight: bold;">
          <td colspan="4" style="border: 1px solid #ddd; padding: 8px; text-align: right;">Toplam Gecikme Ücreti:</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${totalLateFee.toFixed(2)} ${suffix}</td>
        </tr>
      </tfoot>
    </table>
  `;

  return html;
}

export function createMovementTableHTML(items: MovementItem[]): string {
  if (!items || items.length === 0) {
    return '<p>Kayıt bulunamadı</p>';
  }

  const formatNumber = (n: number) => new Intl.NumberFormat('tr-TR').format(n);
  const totalDispatched = items.reduce((s, i) => s + i.dispatched, 0);
  const totalReturned = items.reduce((s, i) => s + i.returned, 0);
  const totalOnSite = items.reduce((s, i) => s + i.current_on_site, 0);

  let html = `
    <table style="width: 100%; border-collapse: collapse; margin: 10px 0;">
      <thead>
        <tr style="background-color: #1a3c5e; color: #fff;">
          <th style="border: 1px solid #ddd; padding: 10px 8px; text-align: center; width: 50px;">#</th>
          <th style="border: 1px solid #ddd; padding: 10px 8px; text-align: left;">Ürün Adı</th>
          <th style="border: 1px solid #ddd; padding: 10px 8px; text-align: right;">Çıkan</th>
          <th style="border: 1px solid #ddd; padding: 10px 8px; text-align: right;">İade</th>
          <th style="border: 1px solid #ddd; padding: 10px 8px; text-align: right;">Eldeki</th>
        </tr>
      </thead>
      <tbody>
  `;

  items.forEach((item, idx) => {
    const bgColor = idx % 2 === 0 ? '' : ' background-color: #f7f9fc;';
    html += `
      <tr style="${bgColor}">
        <td style="border: 1px solid #e0e0e0; padding: 8px; text-align: center;">${idx + 1}</td>
        <td style="border: 1px solid #e0e0e0; padding: 8px;">${escapeHtml(item.product_name)}</td>
        <td style="border: 1px solid #e0e0e0; padding: 8px; text-align: right;">${formatNumber(item.dispatched)}</td>
        <td style="border: 1px solid #e0e0e0; padding: 8px; text-align: right;">${formatNumber(item.returned)}</td>
        <td style="border: 1px solid #e0e0e0; padding: 8px; text-align: right; font-weight: bold;">${formatNumber(item.current_on_site)}</td>
      </tr>
    `;
  });

  html += `
      </tbody>
      <tfoot>
        <tr style="background-color: #eef2f7; font-weight: bold;">
          <td colspan="2" style="border: 1px solid #ddd; padding: 10px 8px; text-align: right; border-top: 2px solid #1a3c5e;">Toplam:</td>
          <td style="border: 1px solid #ddd; padding: 10px 8px; text-align: right; border-top: 2px solid #1a3c5e;">${formatNumber(totalDispatched)}</td>
          <td style="border: 1px solid #ddd; padding: 10px 8px; text-align: right; border-top: 2px solid #1a3c5e;">${formatNumber(totalReturned)}</td>
          <td style="border: 1px solid #ddd; padding: 10px 8px; text-align: right; border-top: 2px solid #1a3c5e;">${formatNumber(totalOnSite)}</td>
        </tr>
      </tfoot>
    </table>
  `;

  return html;
}

function getSettlementTypeLabel(isNonPhysical: boolean, settlementReason: unknown): string {
  if (!isNonPhysical) return 'Normal İade';
  const reason = String(settlementReason ?? '').toUpperCase();
  if (reason === 'SALE') return 'Satış';
  if (reason === 'DEFECT') return 'Hurda / Defo';
  return 'Sanal İade';
}

function getDiscountFactor(iskonto: unknown): number {
  const iskontoPct = Number(iskonto);
  return Number.isFinite(iskontoPct) && iskontoPct > 0 ? Math.max(0, 1 - iskontoPct / 100) : 1;
}

function formatReturnItemLabel(
  ret: ReturnDetail,
  relatedDetail: MaterialDetail = {},
  typeLabel = 'Normal İade'
): string {
  const name = cellText(ret.ItemName);
  const code = String(
    (relatedDetail as { ItemCodeOverride?: string; ItemCode?: string }).ItemCodeOverride ??
      (relatedDetail as { ItemCode?: string }).ItemCode ??
      ''
  ).trim();
  let label = code ? `${code} — ${name}` : name;
  if (typeLabel && typeLabel !== 'Normal İade') {
    label = `${label} (${typeLabel})`;
  }
  return label;
}

function formatReturnLateCell(lateDays: unknown, lateFee: unknown, currency: string): string {
  const days = Number(lateDays ?? 0);
  const fee = Number(lateFee ?? 0);
  if ((!Number.isFinite(days) || days <= 0) && (!Number.isFinite(fee) || fee <= 0)) {
    return EMPTY;
  }
  if (days > 0 && fee > 0) {
    return `${days} gün / ${formatMoneyCell(fee, currency)}`;
  }
  if (days > 0) return `${days} gün`;
  return formatMoneyCell(fee, currency);
}

export function computeReturnLineValues(
  ret: ReturnDetail,
  relatedDetail: MaterialDetail = {},
  options: ReturnTableOptions = {}
) {
  const currency = options.currency ?? 'TRY';
  const contractType = options.contractType ?? 'RENTAL';
  const isSale = contractType === 'SALE';
  const isManual = relatedDetail?.IsManual === true;
  const discountFactor = getDiscountFactor(options.iskonto);

  const typeLabel = getSettlementTypeLabel(
    ret.IsNonPhysicalSettlement === true,
    ret.SettlementReason
  );

  if (ret.IsNonPhysicalSettlement === true) {
    const unitSnap = Number(
      ret.InventoryUnitPriceSnapshot ?? relatedDetail.UnitPriceSnapshot ?? NaN
    );
    const discountedUnit = Number.isFinite(unitSnap) ? unitSnap * discountFactor : null;
    return {
      typeLabel,
      usageDays: null,
      discountedUnitPrice: discountedUnit,
      lineAmount: Number(ret.SettlementCharge ?? 0),
      lateCell: formatReturnLateCell(ret.LateDays, ret.LateFee, currency),
    };
  }

  const qty = Number(ret.ReturnQuantity ?? 0);
  const priceRaw = relatedDetail.UnitPriceSnapshot ?? ret.InventoryUnitPriceSnapshot;
  const price = priceRaw == null || priceRaw === undefined ? NaN : Number(priceRaw);
  const discountedUnitPrice = Number.isFinite(price) ? price * discountFactor : null;

  const lineStart = relatedDetail.EffectiveStartDate ?? options.contractStartDate ?? null;
  const usageDays = computeUsageDays(lineStart, ret.ReturnDate ?? null);

  let lineAmount: number | null = null;
  if (!Number.isFinite(price) || !Number.isFinite(qty)) {
    lineAmount = null;
  } else if (isSale || isManual) {
    lineAmount = (discountedUnitPrice ?? 0) * qty;
  } else if (usageDays == null) {
    lineAmount = null;
  } else {
    lineAmount = (discountedUnitPrice ?? 0) * qty * usageDays;
  }

  return {
    typeLabel,
    usageDays,
    discountedUnitPrice,
    lineAmount,
    lateCell: formatReturnLateCell(ret.LateDays, ret.LateFee, currency),
  };
}

function isDateInPeriod(
  date: unknown,
  periodStart: string | null | undefined,
  periodEnd: string | null | undefined
): boolean {
  if (date == null) return false;
  const d = new Date(String(date));
  if (Number.isNaN(d.getTime())) return false;

  const utcDayOnly = (dt: Date) =>
    Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());

  const dateDay = utcDayOnly(d);

  if (periodStart != null) {
    const start = new Date(periodStart);
    if (!Number.isNaN(start.getTime()) && dateDay < utcDayOnly(start)) return false;
  }

  if (periodEnd != null) {
    const end = new Date(periodEnd);
    if (!Number.isNaN(end.getTime()) && dateDay > utcDayOnly(end)) return false;
  }

  return true;
}

function createReturnTableHTML(returns: ReturnDetail[], options: ReturnTableOptions = {}): string {
  const currency = options.currency ?? 'TRY';
  const periodStart = options.periodStart ?? null;
  const periodEnd = options.periodEnd ?? null;
  const contractDetails = options.details || [];
  const lineOptions: ReturnTableOptions = {
    currency,
    contractType: options.contractType ?? 'RENTAL',
    iskonto: options.iskonto ?? 0,
    contractStartDate: options.contractStartDate ?? periodStart ?? null,
  };

  let filteredReturns = (returns || []).filter((r) =>
    isDateInPeriod(r.ReturnDate, periodStart, periodEnd)
  );

  filteredReturns.sort((a, b) => {
    const dateA = new Date(String(a.ReturnDate)).getTime();
    const dateB = new Date(String(b.ReturnDate)).getTime();
    if (dateA !== dateB) return dateA - dateB;
    return (a.ReturnId ?? 0) - (b.ReturnId ?? 0);
  });

  if (filteredReturns.length === 0) {
    return '<p style="font-size:8.5pt;color:#666;margin:4px 0;">Bu dönemde iade kaydı bulunmamaktadır.</p>';
  }

  const detailByItemWarehouse: Record<string, MaterialDetail> = {};
  for (const d of contractDetails) {
    const key = `${(d as { ItemId?: number }).ItemId ?? 'null'}_${(d as { WarehouseId?: number }).WarehouseId ?? 'null'}`;
    if (!detailByItemWarehouse[key]) {
      detailByItemWarehouse[key] = d;
    }
  }

  let html = `
    <table class="malzeme-tablosu" style="${MT.table}">
      ${CONTRACT_TABLE_COLGROUP}
      <thead>
        <tr>
          <th style="${MT.th}${MT.thC}">İade Tarihi</th>
          <th style="${MT.th}${MT.thL}">Ürün Adı</th>
          <th style="${MT.th}${MT.thC}">Miktar</th>
          <th style="${MT.th}${MT.thC}">Birim</th>
          <th style="${MT.th}${MT.thR}">İskontolu B.Fiyat</th>
          <th style="${MT.th}${MT.thC}">Kullanım Süresi</th>
          <th style="${MT.th}${MT.thC}">Gecikme</th>
          <th style="${MT.th}${MT.thR}">İskontolu Tutar</th>
        </tr>
      </thead>
      <tbody>
  `;

  for (const ret of filteredReturns) {
    const detailKey = `${ret.ItemId ?? 'null'}_${ret.WarehouseId ?? 'null'}`;
    const relatedDetail = detailByItemWarehouse[detailKey] || {};
    const line = computeReturnLineValues(ret, relatedDetail, lineOptions);
    const unit = resolveMeasureUnit(relatedDetail);

    html += `
      <tr>
        <td style="${MT.td}${MT.tdC}">${escapeHtml(formatDateCell(ret.ReturnDate))}</td>
        <td style="${MT.td}${MT.tdL}">${escapeHtml(formatReturnItemLabel(ret, relatedDetail, line.typeLabel))}</td>
        <td style="${MT.td}${MT.tdC}">${escapeHtml(cellText(ret.ReturnQuantity))}</td>
        <td style="${MT.td}${MT.tdC}">${escapeHtml(unit)}</td>
        <td style="${MT.td}${MT.tdR}">${escapeHtml(formatMoneyCell(line.discountedUnitPrice, currency))}</td>
        <td style="${MT.td}${MT.tdC}">${escapeHtml(formatUsageDaysCell(line.usageDays))}</td>
        <td style="${MT.td}${MT.tdC}">${escapeHtml(line.lateCell)}</td>
        <td style="${MT.td}${MT.tdR}">${escapeHtml(formatMoneyCell(line.lineAmount, currency))}</td>
      </tr>
    `;
  }

  html += `
      </tbody>
    </table>
  `;

  return html;
}

export const DOCUMENT_WIDGET_KEYS = [
  'malzemeTablosu',
  'gecikmeTablosu',
  'iadeTablosu',
  'hareketTablosu',
] as const;

export type DocumentWidgetKey = (typeof DOCUMENT_WIDGET_KEYS)[number];

export function isDocumentWidgetKey(key: string): key is DocumentWidgetKey {
  return (DOCUMENT_WIDGET_KEYS as readonly string[]).includes(key);
}

export function renderDocumentWidgetHtml(
  widgetKey: DocumentWidgetKey,
  raw: Record<string, unknown>
): string {
  const doc = (raw.contract || raw.quote) as Record<string, unknown> | undefined;

  switch (widgetKey) {
    case 'malzemeTablosu':
      return createMaterialTableHTML((raw.details as MaterialDetail[]) || [], {
        currency: String(raw.currency || doc?.Currency || raw.currencySymbol || 'TRY'),
        contractType: (doc?.Type as string) ?? null,
        startDate: (doc?.StartDate as string) ?? null,
        endDate: (doc?.ActualEndDate as string) ?? (doc?.PlannedEndDate as string) ?? null,
        iskonto: Number(doc?.Iskonto ?? 0),
      });
    case 'gecikmeTablosu':
      return createLateFeeTableHTML(
        (raw.returns as ReturnDetail[]) || [],
        raw.currencySymbol || raw.currency || 'TRY'
      );
    case 'iadeTablosu': {
      const periodStart = (raw.periodStart as string) ?? (doc?.StartDate as string) ?? null;
      const periodEnd =
        (raw.periodEnd as string) ??
        (doc?.ActualEndDate as string) ??
        (doc?.PlannedEndDate as string) ??
        null;
      return createReturnTableHTML((raw.returns as ReturnDetail[]) || [], {
        currency: String(raw.currency || doc?.Currency || raw.currencySymbol || 'TRY'),
        periodStart,
        periodEnd,
        details: (raw.details as MaterialDetail[]) || [],
        contractType: (doc?.Type as string) ?? 'RENTAL',
        iskonto: Number(doc?.Iskonto ?? 0),
        contractStartDate: (doc?.StartDate as string) ?? null,
      });
    }
    case 'hareketTablosu':
      return createMovementTableHTML((raw.items as MovementItem[]) || []);
    default:
      return `<p>{{${widgetKey}}}</p>`;
  }
}
