import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { useTabOptional } from '../components/tabs/TabContext';

export type DataEntity = 'customers' | 'inventory' | 'contracts' | 'quotes';

interface DataInvalidationState {
  versions: Record<DataEntity, number>;
  invalidate: (entity: DataEntity) => void;
}

export const useDataInvalidationStore = create<DataInvalidationState>((set) => ({
  versions: { customers: 0, inventory: 0, contracts: 0, quotes: 0 },
  invalidate: (entity) =>
    set((state) => ({
      versions: { ...state.versions, [entity]: state.versions[entity] + 1 },
    })),
}));

export function invalidateData(entity: DataEntity) {
  useDataInvalidationStore.getState().invalidate(entity);
}

/**
 * Liste sekmesi gizleyken veri değiştiyse, sekme yeniden açıldığında yenilenir.
 * Sekme zaten aktifse hemen yenilenir.
 */
export function useInvalidation(entity: DataEntity, refetch: () => void) {
  const version = useDataInvalidationStore((state) => state.versions[entity]);
  const seen = useRef(version);
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  const tab = useTabOptional();
  const isActive = tab?.isActive ?? true;

  useEffect(() => {
    if (version === seen.current) return;
    if (!isActive) return;
    seen.current = version;
    refetchRef.current();
  }, [isActive, version]);
}
