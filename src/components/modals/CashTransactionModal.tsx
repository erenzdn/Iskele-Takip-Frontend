import { useEffect, useState } from 'react';
import { XIcon } from '@phosphor-icons/react';
import { CashAccount, CashTransaction, CreateCashTransactionDto, Customer } from '../../models';
import { cashService } from '../../services/cashService';
import { customerService } from '../../services/customerService';
import { getApiFieldErrors, getUserFacingErrorMessage } from '../../utils/apiError';
import CustomerSearchField from '../CustomerSearchField';
import {
  firstValidationError,
  normalizeText,
  validateDate,
  validateNumber,
  validateRequired,
  validateUuid,
} from '../../utils/validation';

interface CashTransactionModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void | Promise<void>;
}

const TYPE_OPTIONS: CashTransaction['type'][] = [
  'TAHSILAT',
  'ODEME',
  'VIRMAN',
  'MASRAF',
  'GELIR',
  'DOVIZ_TAKAS',
];

export default function CashTransactionModal({
  open,
  onClose,
  onCreated,
}: CashTransactionModalProps) {
  const [cashAccountId, setCashAccountId] = useState('');
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [type, setType] = useState<CashTransaction['type']>('TAHSILAT');
  const [amountStr, setAmountStr] = useState('0');
  const [targetAccountId, setTargetAccountId] = useState('');
  const [exchangeRateStr, setExchangeRateStr] = useState('1');
  const [transactionDate, setTransactionDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [description, setDescription] = useState('');
  const [relatedEntityType, setRelatedEntityType] = useState<CashTransaction['related_entity_type']>(null);
  const [relatedEntityId, setRelatedEntityId] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ related_entity_id?: string }>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCashAccountId('');
    setAccounts([]);
    setAccountsLoading(true);
    setType('TAHSILAT');
    setAmountStr('0');
    setTargetAccountId('');
    setExchangeRateStr('1');
    setTransactionDate(new Date().toISOString().slice(0, 10));
    setDescription('');
    setRelatedEntityType(null);
    setRelatedEntityId('');
    setCustomers([]);
    setCustomersLoading(false);
    setError(null);
    setFieldErrors({});
    setBusy(false);

    let cancelled = false;
    const loadInitialData = async () => {
      try {
        setCustomersLoading(true);
        const [list, customerList] = await Promise.all([
          cashService.listAccountsAsync(),
          customerService.getAllAsync(),
        ]);
        if (cancelled) return;
        setAccounts(Array.isArray(list) ? list : []);
        setCustomers(Array.isArray(customerList) ? customerList : []);
      } catch (e: unknown) {
        if (cancelled) return;
        console.error('Load cash accounts error:', e);
        setAccounts([]);
        setCustomers([]);
      } finally {
        if (cancelled) return;
        setAccountsLoading(false);
        setCustomersLoading(false);
      }
    };

    void loadInitialData();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleSave = async () => {
    try {
      setError(null);
      setFieldErrors({});
      setBusy(true);

      const cashAccountIdTrimmed = normalizeText(cashAccountId);
      const relatedEntityIdTrimmed = normalizeText(relatedEntityId);
      const validationError = firstValidationError([
        validateRequired(cashAccountIdTrimmed, 'Kasa / Banka Hesabı'),
        validateNumber(amountStr, 'Tutar', { required: true, min: 0.01 }),
        validateDate(transactionDate, 'İşlem Tarihi', true),
        ...(type === 'VIRMAN' ? [validateUuid(targetAccountId, 'Hedef Hesap ID', true)] : []),
        ...(type === 'DOVIZ_TAKAS'
          ? [validateNumber(exchangeRateStr, 'Kur', { required: true, min: 0.0001 })]
          : []),
      ]);
      if (validationError) {
        setError(validationError);
        return;
      }

      if (relatedEntityType === 'CUSTOMER' && !relatedEntityIdTrimmed) {
        setFieldErrors({ related_entity_id: 'Müşteri seçimi zorunludur.' });
        return;
      }

      const amount = Number(amountStr);

      const dto: CreateCashTransactionDto = {
        cash_account_id: cashAccountIdTrimmed,
        type,
        amount,
        transaction_date: transactionDate,
      };

      if (type === 'VIRMAN') {
        const targetTrimmed = normalizeText(targetAccountId);
        dto.target_account_id = targetTrimmed;
      }

      if (type === 'DOVIZ_TAKAS') {
        const exchangeRate = Number(exchangeRateStr);
        dto.exchange_rate = exchangeRate;
      }

      if (relatedEntityType) dto.related_entity_type = relatedEntityType;
      if (relatedEntityIdTrimmed) dto.related_entity_id = relatedEntityIdTrimmed;
      if (normalizeText(description)) dto.description = normalizeText(description);

      // input[type="date"] genelde "YYYY-MM-DD" döner; backend'in parse edebilmesi için olduğu haliyle gönderiyoruz.
      // Backend'in ISO 8601 istemesi durumunda burayı toISOString() ile güncellemek gerekebilir.
      await cashService.createDraftAsync(dto);

      await onCreated?.();
      onClose();
    } catch (e: unknown) {
      setFieldErrors(getApiFieldErrors(e, ['related_entity_id']));
      setError(getUserFacingErrorMessage(e, 'Kayıt hatası'));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-background-panel rounded-panel w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <header className="shrink-0 flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-text-primary">Yeni Kasa & Banka İşlemi</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-text-secondary hover:bg-background-hover hover:text-text-primary transition-colors"
            aria-label="Kapat"
          >
            <XIcon size={22} weight="regular" />
          </button>
        </header>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-text-primary">Kasa / Banka Hesabı</label>
            <select
              value={cashAccountId}
              onChange={(e) => setCashAccountId(e.target.value)}
              disabled={accountsLoading || busy}
              className="input w-full py-2 px-3 text-sm"
            >
              {accountsLoading ? (
                <option value="" disabled>
                  Yükleniyor...
                </option>
              ) : accounts.length === 0 ? (
                <option value="" disabled>
                  Kasa bulunamadı
                </option>
              ) : (
                <>
                  <option value="">Seçin...</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.currency})
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-text-primary">İşlem Türü</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as CashTransaction['type'])}
                className="input w-full py-2 px-3 text-sm"
              >
                {TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t === 'TAHSILAT'
                      ? 'Tahsilat'
                      : t === 'ODEME'
                        ? 'Ödeme'
                        : t === 'VIRMAN'
                          ? 'Virman'
                          : t === 'MASRAF'
                            ? 'Masraf'
                            : t === 'GELIR'
                              ? 'Gelir'
                              : 'Döviz Takas'}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-text-primary">Tutar</label>
              <input
                type="number"
                value={amountStr}
                onChange={(e) => {
                  setAmountStr(e.target.value);
                  if (error) setError(null);
                }}
                min={0}
                step="0.01"
                className="input w-full py-2 px-3 text-sm"
              />
            </div>

            {type === 'VIRMAN' && (
              <div className="space-y-1">
                <label className="block text-xs font-medium text-text-primary">target_account_id (UUID)</label>
                <input
                  type="text"
                  value={targetAccountId}
                  onChange={(e) => {
                    setTargetAccountId(e.target.value);
                    if (error) setError(null);
                  }}
                  className="input w-full py-2 px-3 text-sm"
                  placeholder="Hedef kasa / banka hesabı"
                />
              </div>
            )}

            {type === 'DOVIZ_TAKAS' && (
              <div className="space-y-1">
                <label className="block text-xs font-medium text-text-primary">Kur</label>
                <input
                  type="number"
                  value={exchangeRateStr}
                  onChange={(e) => {
                    setExchangeRateStr(e.target.value);
                    if (error) setError(null);
                  }}
                  min={0}
                  step="0.0001"
                  className="input w-full py-2 px-3 text-sm"
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-xs font-medium text-text-primary">İşlem Tarihi</label>
              <input
                type="date"
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
                className="input w-full py-2 px-3 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-text-primary">Açıklama</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input w-full h-24 resize-none py-2 px-3 text-sm"
              placeholder="Opsiyonel kısa açıklama"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-text-primary">İlgili Varlık Türü</label>
              <select
                value={relatedEntityType ?? ''}
                onChange={(e) => {
                  const value = e.target.value as CashTransaction['related_entity_type'] | '';
                  setRelatedEntityType(value || null);
                  if (value !== 'CUSTOMER') {
                    setRelatedEntityId('');
                    setFieldErrors((prev) => ({ ...prev, related_entity_id: undefined }));
                  }
                  if (error) setError(null);
                }}
                className="input w-full py-2 px-3 text-sm"
                disabled={busy}
              >
                <option value="">Seçin...</option>
                <option value="CUSTOMER">Müşteri</option>
                <option value="SUPPLIER">Tedarikçi</option>
                <option value="STAFF">Personel</option>
                <option value="OTHER">Diğer</option>
              </select>
            </div>

            {relatedEntityType === 'CUSTOMER' && (
              <div className="space-y-1">
                <label className="block text-xs font-medium text-text-primary">Müşteri *</label>
                <CustomerSearchField
                  customers={customers}
                  value={relatedEntityId ? Number(relatedEntityId) : ''}
                  onChange={(customerId) => {
                    setRelatedEntityId(customerId === '' ? '' : String(customerId));
                    if (fieldErrors.related_entity_id) {
                      setFieldErrors((prev) => ({ ...prev, related_entity_id: undefined }));
                    }
                    if (error) setError(null);
                  }}
                  disabled={busy || customersLoading}
                  id="cash-transaction-customer-search"
                />
                {fieldErrors.related_entity_id && (
                  <p className="text-xs text-red-400">{fieldErrors.related_entity_id}</p>
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="p-3 rounded-md border border-red-700 bg-red-900/30 text-error text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="btn-secondary flex-1"
            >
              Vazgeç
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={busy}
              className="btn-primary flex-1"
            >
              {busy ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

