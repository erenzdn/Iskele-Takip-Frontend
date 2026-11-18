export type ContractQuoteKind = 'rental' | 'sale';

export type CustomerTabState = {
  initialTab?: 'info' | 'sites' | 'history';
  startInEditMode?: boolean;
};

export type ContractTabState = {
  initialTab?: 'info' | 'billing' | 'shipments' | 'return' | 'returns' | 'history' | 'addenda' | 'extensions' | 'invoices';
  /**
   * Sekme açılınca bir kez çalışacak kısa yol (ör. listeden "Sevk Et").
   * `nonce` her istekte değişir: aynı kısa yol tekrar seçilebilir ve kalıcı saklanan
   * sekme uygulama yeniden açılınca işlemi tekrarlamaz.
   */
  quickAction?: { kind: 'createShipment'; nonce: number };
};

export type QuoteTabState = {
  startInEditMode?: boolean;
  isClonedDraft?: boolean;
};

export function customerPath(id: number | 'new') {
  return `/customers/${id}`;
}

export function inventoryPath(id: number | 'new') {
  return `/inventory/${id}`;
}

export function contractPath(id: number) {
  return `/contracts/${id}`;
}

export function newContractPath(kind: ContractQuoteKind) {
  return `/contracts/new?type=${kind}`;
}

export function quotePath(id: number) {
  return `/quotes/${id}`;
}

export function newQuotePath(kind: ContractQuoteKind) {
  return `/quotes/new?type=${kind}`;
}

export function listPathForKind(kind: ContractQuoteKind) {
  return kind === 'sale' ? '/contracts/sale' : '/contracts/rental';
}
