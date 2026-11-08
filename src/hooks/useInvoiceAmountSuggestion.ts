/**
 * Kiralama faturası tutarı otomatik hesaplama hook'u.
 * 
 * Dönem tarihleri girilince debounce ile iki billing-plan çeker:
 * 1. asOf = fatura bitiş gününün ertesi (bitiş günü dahil)
 * 2. asOf = fatura başlangıç günü
 * Tutar = iki birikmiş tahakkukun farkı (ilk 30 gün asgari, sonrası aylık / 30 günlük).
 * 
 * Önbellekleme ve stale yanıt koruması ile performans optimize edilir.
 */

import { useState, useEffect, useRef } from 'react';
import { useDebouncedValue } from './useDebouncedValue';
import { contractService } from '../services/contractService';
import type { BillingPeriod } from '../models';
import {
  accrualBoundaryIso,
  computeInvoiceAmountFromAccrual,
  isoToLocalDateKey,
  sumPlanAccrual,
  type InvoiceAmountCalculation,
} from '../utils/invoiceAmountCalc';
import { addCalendarDays, todayDateInput } from '../utils/dateInput';

interface UseInvoiceAmountSuggestionParams {
  contractId: number;
  /** Sözleşme başlangıcı (ISO); tahakkuk sınırları bu saate hizalanır */
  contractStartDate: string | null | undefined;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  enabled: boolean; // Kiralama sözleşmesi ve aynı para birimi
}

interface UseInvoiceAmountSuggestionResult {
  calculation: InvoiceAmountCalculation | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

interface CacheEntry {
  asOf: string;
  plan: BillingPeriod[];
  timestamp: number;
}

// Önbellek: contractId + asOf -> plan
const planCache = new Map<string, CacheEntry>();
const CACHE_TTL = 60_000; // 1 dakika

function getCacheKey(contractId: number, asOf: string): string {
  return `${contractId}:${asOf}`;
}

function getCachedPlan(contractId: number, asOf: string): BillingPeriod[] | null {
  const key = getCacheKey(contractId, asOf);
  const entry = planCache.get(key);
  
  if (!entry) return null;
  
  const age = Date.now() - entry.timestamp;
  if (age > CACHE_TTL) {
    planCache.delete(key);
    return null;
  }
  
  return entry.plan;
}

/** Sözleşmenin önbellekteki planlarını siler (zeyilname/iade/uzatma sonrası bayat tutar önerilmesin). */
export function clearInvoicePlanCache(contractId: number): void {
  const prefix = `${contractId}:`;
  for (const key of Array.from(planCache.keys())) {
    if (key.startsWith(prefix)) planCache.delete(key);
  }
}

function setCachedPlan(contractId: number, asOf: string, plan: BillingPeriod[]): void {
  const key = getCacheKey(contractId, asOf);
  planCache.set(key, {
    asOf,
    plan,
    timestamp: Date.now(),
  });
}

/**
 * Fatura tutarı otomatik hesaplama hook'u
 */
export function useInvoiceAmountSuggestion(
  params: UseInvoiceAmountSuggestionParams
): UseInvoiceAmountSuggestionResult {
  const { contractId, contractStartDate, startDate, endDate, enabled } = params;

  // 400ms debounce - kullanıcı tarih değiştirirken gereksiz istek atılmasın
  const debouncedStartDate = useDebouncedValue(startDate, 400);
  const debouncedEndDate = useDebouncedValue(endDate, 400);

  const [calculation, setCalculation] = useState<InvoiceAmountCalculation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryTrigger, setRetryTrigger] = useState(0);

  // Stale yanıt koruması - sadece son isteğin yanıtını kullan
  const requestIdRef = useRef(0);

  const retry = () => {
    setRetryTrigger((prev) => prev + 1);
  };

  useEffect(() => {
    // Etkin değilse veya tarihler eksikse hesaplama
    if (!enabled || !contractStartDate || !debouncedStartDate || !debouncedEndDate) {
      setCalculation(null);
      setLoading(false);
      setError(null);
      return;
    }

    // Başlangıç > bitiş kontrolü
    if (debouncedStartDate > debouncedEndDate) {
      setCalculation(null);
      setLoading(false);
      setError('Başlangıç tarihi bitiş tarihinden sonra olamaz');
      return;
    }

    let cancelled = false;
    const currentRequestId = ++requestIdRef.current;

    const fetchAndCompute = async () => {
      try {
        setLoading(true);
        setError(null);

        const contractStartKey = isoToLocalDateKey(contractStartDate);
        const endBoundary = accrualBoundaryIso(contractStartDate, addCalendarDays(debouncedEndDate, 1));
        const startBoundary = accrualBoundaryIso(contractStartDate, debouncedStartDate);
        if (!contractStartKey || !endBoundary || !startBoundary) {
          throw new Error('Geçersiz tarih');
        }

        const loadPlan = async (asOf: string): Promise<BillingPeriod[]> => {
          const cached = getCachedPlan(contractId, asOf);
          if (cached) return cached;
          const fetched = await contractService.getBillingPlanAsync(contractId, asOf);
          setCachedPlan(contractId, asOf, fetched);
          return fetched;
        };

        // Başlangıç sözleşmeden önce/aynı gündeyse birikmiş tahakkuk 0'dır; istek gerekmez.
        const needsStartPlan = debouncedStartDate > contractStartKey;
        const [planAtEnd, planAtStart] = await Promise.all([
          loadPlan(endBoundary),
          needsStartPlan ? loadPlan(startBoundary) : Promise.resolve([] as BillingPeriod[]),
        ]);

        if (cancelled || currentRequestId !== requestIdRef.current) {
          return; // Stale yanıt, kullanma
        }

        const result = computeInvoiceAmountFromAccrual({
          planAtEnd,
          accruedAtStart: sumPlanAccrual(planAtStart),
          startKey: debouncedStartDate,
          endKey: debouncedEndDate,
          contractStartKey,
          todayKey: todayDateInput(),
        });

        if (!cancelled && currentRequestId === requestIdRef.current) {
          setCalculation(result);
          setLoading(false);
        }
      } catch (err) {
        console.error('Invoice amount calculation error:', err);
        
        if (!cancelled && currentRequestId === requestIdRef.current) {
          setError(
            err instanceof Error 
              ? err.message 
              : 'Tutar hesaplanamadı. Lütfen tekrar deneyin.'
          );
          setCalculation(null);
          setLoading(false);
        }
      }
    };

    void fetchAndCompute();

    return () => {
      cancelled = true;
    };
  }, [contractId, contractStartDate, debouncedStartDate, debouncedEndDate, enabled, retryTrigger]);

  return {
    calculation,
    loading,
    error,
    retry,
  };
}
