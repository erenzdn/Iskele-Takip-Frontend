/**
 * Kiralama faturası tutarı otomatik hesaplama hook'u.
 * 
 * Dönem tarihleri girilince debounce ile billing-plan çeker ve
 * gün bazlı orantılı tutar hesaplar. İki adımlı istek stratejisi:
 * 1. asOf=bitiş ile plan çek
 * 2. Eğer bitiş açık dönem içindeyse o dönemin sonu ile tekrar çek
 * 
 * Önbellekleme ve stale yanıt koruması ile performans optimize edilir.
 */

import { useState, useEffect, useRef } from 'react';
import { useDebouncedValue } from './useDebouncedValue';
import { contractService } from '../services/contractService';
import type { BillingPeriod } from '../models';
import {
  computeInvoiceAmountForRange,
  findOpenPeriodContaining,
  isoToLocalDateKey,
  type InvoiceAmountCalculation,
} from '../utils/invoiceAmountCalc';
import { asOfDateInputToIso } from '../utils/billingPlan';

interface UseInvoiceAmountSuggestionParams {
  contractId: number;
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
  const { contractId, startDate, endDate, enabled } = params;

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
    if (!enabled || !debouncedStartDate || !debouncedEndDate) {
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

        // 1. asOf=bitiş ile plan çek
        const endDateIso = asOfDateInputToIso(debouncedEndDate);
        if (!endDateIso) {
          throw new Error('Geçersiz bitiş tarihi');
        }

        // Önbellekten kontrol
        let plan = getCachedPlan(contractId, endDateIso);
        
        if (!plan) {
          // API çağrısı
          plan = await contractService.getBillingPlanAsync(contractId, endDateIso);
          setCachedPlan(contractId, endDateIso, plan);
        }

        if (cancelled || currentRequestId !== requestIdRef.current) {
          return; // Stale yanıt, kullanma
        }

        // 2. Eğer bitiş açık dönem içindeyse ikinci istek
        const endKey = isoToLocalDateKey(endDateIso);
        const openPeriod = findOpenPeriodContaining(plan, endKey);

        if (openPeriod) {
          // Açık dönemin sonunda tekrar çek
          const openPeriodEndKey = isoToLocalDateKey(openPeriod.periodEnd);
          const openPeriodEndIso = asOfDateInputToIso(openPeriodEndKey);
          
          if (openPeriodEndIso) {
            let extendedPlan = getCachedPlan(contractId, openPeriodEndIso);
            
            if (!extendedPlan) {
              extendedPlan = await contractService.getBillingPlanAsync(contractId, openPeriodEndIso);
              setCachedPlan(contractId, openPeriodEndIso, extendedPlan);
            }

            if (cancelled || currentRequestId !== requestIdRef.current) {
              return; // Stale yanıt
            }

            plan = extendedPlan;
          }
        }

        // 3. Hesaplama yap
        const result = computeInvoiceAmountForRange(plan, debouncedStartDate, debouncedEndDate);

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
  }, [contractId, debouncedStartDate, debouncedEndDate, enabled, retryTrigger]);

  return {
    calculation,
    loading,
    error,
    retry,
  };
}
