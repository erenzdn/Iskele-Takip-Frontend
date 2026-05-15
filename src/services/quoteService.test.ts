import { beforeEach, describe, expect, it, vi } from 'vitest';
import { quoteService } from './quoteService';

const { postMock } = vi.hoisted(() => ({
  postMock: vi.fn(),
}));

vi.mock('./apiClient', () => ({
  apiClient: {
    post: postMock,
  },
}));

describe('quoteService StartDate payload behavior', () => {
  beforeEach(() => {
    postMock.mockReset();
    postMock.mockResolvedValue({ QuoteId: 101, message: 'ok' });
  });

  it('RENTAL create request: yalnızca RentalDurationDays (tarih yok)', async () => {
    await quoteService.createAsync({
      CustomerId: 1,
      CustomerAuthorizedContactId: 2,
      Type: 'RENTAL',
      RentalDurationDays: 45,
      details: [{ ItemId: 10, Quantity: 1 }],
    });

    const [, payload] = postMock.mock.calls[0];
    expect(payload).not.toHaveProperty('StartDate');
    expect(payload).not.toHaveProperty('PlannedEndDate');
    expect(payload).toHaveProperty('RentalDurationDays', 45);
  });

  it('RENTAL create request: StartDate yoksa payloaddan çıkarır', async () => {
    await quoteService.createAsync({
      CustomerId: 1,
      CustomerAuthorizedContactId: 2,
      Type: 'RENTAL',
      StartDate: '   ',
      PlannedEndDate: '2026-06-01T00:00:00.000Z',
      details: [{ ItemId: 10, Quantity: 1 }],
    });

    expect(postMock).toHaveBeenCalledTimes(1);
    const [, payload] = postMock.mock.calls[0];
    expect(payload).not.toHaveProperty('StartDate');
    expect(payload).toHaveProperty('PlannedEndDate');
    expect(payload).not.toHaveProperty('RentalDurationDays');
  });

  it('RENTAL create request: StartDate doluysa payloadda kalır', async () => {
    await quoteService.createAsync({
      CustomerId: 1,
      CustomerAuthorizedContactId: 2,
      Type: 'RENTAL',
      StartDate: '2026-05-10T00:00:00.000Z',
      PlannedEndDate: '2026-06-01T00:00:00.000Z',
      details: [{ ItemId: 10, Quantity: 1 }],
    });

    const [, payload2] = postMock.mock.calls[0];
    expect(payload2).toHaveProperty('StartDate', '2026-05-10T00:00:00.000Z');
  });

  it('from-package RENTAL request: StartDate yoksa payloaddan çıkarır', async () => {
    await quoteService.createFromPackageAsync('55', {
      CustomerId: 1,
      CustomerAuthorizedContactId: 2,
      Type: 'RENTAL',
      StartDate: '',
      PlannedEndDate: '2026-06-01T00:00:00.000Z',
    });

    expect(postMock).toHaveBeenCalledTimes(1);
    const [url, payload] = postMock.mock.calls[0];
    expect(url).toBe('/quotes/from-package/55');
    expect(payload).not.toHaveProperty('StartDate');
    expect(payload).toHaveProperty('PlannedEndDate');
  });
});

describe('quoteService.cloneQuoteAsync', () => {
  beforeEach(() => {
    postMock.mockReset();
  });

  it('POST /quotes/:id/clone çağırır ve dönüşü Quote + message olarak normalize eder', async () => {
    postMock.mockResolvedValue({
      QuoteId: 999,
      QuoteCode: null,
      CustomerId: 7,
      Status: 'pending',
      Currency: 'TRY',
      StartDate: '2026-05-10T00:00:00.000Z',
      PlannedEndDate: '2026-06-01T00:00:00.000Z',
      RentalDurationDays: 22,
      details: [
        {
          QuoteDetailId: 1,
          ItemId: 10,
          Quantity: 2,
          UnitPriceSnapshot: 50,
          PriceUnit: 'DAY',
          MonthlyPriceOverride: 1500,
          PriceSource: 'OVERRIDE',
        },
      ],
      message: 'Teklif başarıyla kopyalandı',
    });

    const result = await quoteService.cloneQuoteAsync(123);

    expect(postMock).toHaveBeenCalledTimes(1);
    const [url, payload] = postMock.mock.calls[0];
    expect(url).toBe('/quotes/123/clone');
    expect(payload).toEqual({});

    expect(result.QuoteId).toBe(999);
    expect(result.Status).toBe('pending');
    expect(result.message).toBe('Teklif başarıyla kopyalandı');
    expect(result.QuoteDetails).toHaveLength(1);
    expect(result.details).toHaveLength(1);
    expect(result.QuoteDetails?.[0]?.MonthlyPriceOverride).toBe(1500);
    expect(result.RentalDurationDays).toBe(22);
  });

  it('Backend message yoksa varsayılan mesaj döndürür ve QuoteDetails alanı korunur', async () => {
    postMock.mockResolvedValue({
      QuoteId: 1000,
      Status: 'pending',
      QuoteDetails: [
        { QuoteDetailId: 5, ItemId: 11, Quantity: 1, UnitPriceSnapshot: 10, PriceUnit: 'EACH', PriceSource: 'INVENTORY' },
      ],
    });

    const result = await quoteService.cloneQuoteAsync(456);

    expect(result.message).toBe('Teklif kopyalandi.');
    expect(result.QuoteDetails).toHaveLength(1);
  });
});
