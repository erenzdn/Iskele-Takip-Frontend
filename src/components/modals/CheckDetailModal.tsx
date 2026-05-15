import { useEffect, useState } from 'react';
import { CashAccount, Check, CheckStatus, Customer } from '../../models';
import { checkService } from '../../services/checkService';
import { cashService } from '../../services/cashService';
import { customerService } from '../../services/customerService';
import { firstValidationError, normalizeText, validateDate, validateIban, validateNumber, validateRequired } from '../../utils/validation';
import { getApiFieldErrors, getUserFacingErrorMessage } from '../../utils/apiError';
import { toast } from '../../hooks/useToast';

interface CheckDetailModalProps {
  check: Check | null;
  isNew: boolean;
  canEdit: boolean;
  onClose: (reload?: boolean) => void;
}

const STATUS_OPTIONS: { value: CheckStatus; label: string }[] = [
  { value: 'PORTFOLIO', label: 'Portföyde' },
  { value: 'CASHED', label: 'Tahsil Edildi' },
  { value: 'RETURNED', label: 'İade Edildi' },
  { value: 'CANCELLED', label: 'İptal' },
];

export default function CheckDetailModal({
  check,
  isNew,
  canEdit,
  onClose,
}: CheckDetailModalProps) {
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [bankName, setBankName] = useState('');
  const [branchName, setBranchName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [checkNumber, setCheckNumber] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [currency, setCurrency] = useState<'TRY' | 'EUR'>('TRY');
  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState<CheckStatus>('PORTFOLIO');
  const [ownerName, setOwnerName] = useState('');
  const [notes, setNotes] = useState('');
  const [cashAccountId, setCashAccountId] = useState('');
  const [reason, setReason] = useState('');
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isBusy, setIsBusy] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadCustomers = async () => {
      try {
        const data = await customerService.getAllAsync();
        setCustomers(data);
      } catch (e) {
        console.error('Load customers error (check detail):', e);
        setCustomers([]);
      }
    };

    loadCustomers();

    if (check) {
      if (check.CustomerId && check.CustomerName) {
        setSelectedCustomer({
          CustomerId: check.CustomerId,
          Name: check.CustomerName,
        } as Customer);
      }
      setBankName(check.BankName);
      setBranchName(check.BranchName ?? '');
      setAccountNumber(check.AccountNumber ?? '');
      setCheckNumber(check.CheckNumber);
      setAmount(check.Amount);
      setCurrency((check.Currency as 'TRY' | 'EUR') || 'TRY');
      setIssueDate(check.IssueDate?.slice(0, 10) ?? '');
      setDueDate(check.DueDate?.slice(0, 10) ?? '');
      setStatus(check.Status ?? 'PORTFOLIO');
      setOwnerName(check.OwnerName ?? '');
      setNotes(check.Notes ?? '');
      setCashAccountId('');
      setReason('');
    } else {
      setStatus('PORTFOLIO');
      setCurrency('TRY');
      setCashAccountId('');
      setReason('');
    }
  }, [check]);

  useEffect(() => {
    if (!check || status !== 'CASHED') {
      setAccounts([]);
      return;
    }

    const loadAccounts = async () => {
      try {
        const data = await cashService.listAccountsAsync();
        setAccounts(data.filter((acc) => acc.is_active));
      } catch (e) {
        console.error('Load cash accounts error (check detail):', e);
        setAccounts([]);
      }
    };

    void loadAccounts();
  }, [check, status]);

  const isStatusChanged = !!check && status !== (check.Status ?? 'PORTFOLIO');

  const isBaseFieldChanged = () => {
    if (!check) return true;
    const originalCustomerId = check.CustomerId ?? null;
    const currentCustomerId = selectedCustomer?.CustomerId ?? null;
    return (
      normalizeText(bankName) !== normalizeText(check.BankName) ||
      (normalizeText(branchName) || '') !== (normalizeText(check.BranchName ?? '') || '') ||
      (normalizeText(accountNumber) || '') !== (normalizeText(check.AccountNumber ?? '') || '') ||
      normalizeText(checkNumber) !== normalizeText(check.CheckNumber) ||
      (typeof amount === 'number' ? amount : Number(amount)) !== Number(check.Amount) ||
      currency !== ((check.Currency as 'TRY' | 'EUR') || 'TRY') ||
      issueDate !== (check.IssueDate?.slice(0, 10) ?? '') ||
      dueDate !== (check.DueDate?.slice(0, 10) ?? '') ||
      (normalizeText(ownerName) || '') !== (normalizeText(check.OwnerName ?? '') || '') ||
      (normalizeText(notes) || '') !== (normalizeText(check.Notes ?? '') || '') ||
      originalCustomerId !== currentCustomerId
    );
  };

  const getFinanceActionMessage = (financeAction?: string | null) => {
    switch ((financeAction || '').toUpperCase()) {
      case 'CASH_CREATED':
      case 'CREATE_CASH_TRANSACTION':
      case 'CREATED':
        return 'Çek durumu güncellendi ve finans hareketi oluşturuldu.';
      case 'CASH_REVERSED':
      case 'REVERSE_CASH_TRANSACTION':
      case 'REVERSED':
        return 'Çek durumu güncellendi ve önceki finans hareketi terslendi.';
      case 'NONE':
      case 'NO_ACTION':
        return 'Çek durumu güncellendi.';
      default:
        return 'Çek başarıyla güncellendi.';
    }
  };

  const handleSave = async () => {
    if (!canEdit) {
      onClose(false);
      return;
    }

    setError(null);
    setFieldErrors({});
    const validationError = firstValidationError([
      validateRequired(bankName, 'Banka Adı'),
      validateRequired(checkNumber, 'Çek Numarası'),
      validateNumber(amount === '' ? '' : amount, 'Tutar', { required: true, min: 0.01 }),
      validateDate(issueDate, 'Keside Tarihi', true),
      validateDate(dueDate, 'Vade Tarihi', true),
      ...(accountNumber.trim().toUpperCase().startsWith('TR') ? [validateIban(accountNumber, 'Hesap No / IBAN')] : []),
    ]);
    if (validationError) {
      setError(validationError);
      return;
    }

    const payload: Check = {
      CheckId: check?.CheckId,
      CustomerId: selectedCustomer?.CustomerId,
      BankName: normalizeText(bankName),
      BranchName: normalizeText(branchName) || undefined,
      AccountNumber: normalizeText(accountNumber) || undefined,
      CheckNumber: normalizeText(checkNumber),
      Amount: typeof amount === 'number' ? amount : Number(amount),
      Currency: currency,
      IssueDate: issueDate,
      DueDate: dueDate,
      Status: isNew ? 'PORTFOLIO' : status,
      OwnerName: normalizeText(ownerName) || undefined,
      Notes: normalizeText(notes) || undefined,
    };

    try {
      setIsBusy(true);
      if (isNew) {
        await checkService.createAsync(payload);
        toast.success('Çek kaydı başarıyla oluşturuldu.');
      } else if (check?.CheckId) {
        const baseChanged = isBaseFieldChanged();
        if (!baseChanged && !isStatusChanged) {
          setError('Durum veya kayıt alanlarında değişiklik yok. Güncelleme yapılmadı.');
          return;
        }

        const statusPatch: Record<string, unknown> = {};
        if (isStatusChanged) {
          statusPatch.Status = status;
          if (status === 'CASHED') {
            const trimmedCashAccountId = cashAccountId.trim();
            if (!trimmedCashAccountId) {
              setFieldErrors({ cash_account_id: 'Tahsil edildi için kasa hesabı seçimi zorunludur.' });
              return;
            }
            statusPatch.cash_account_id = trimmedCashAccountId;
          }
          if (status === 'RETURNED' || status === 'CANCELLED') {
            const trimmedReason = normalizeText(reason);
            if (trimmedReason) statusPatch.reason = trimmedReason;
          }
        }

        const patchPayload = baseChanged
          ? {
              ...payload,
              ...statusPatch,
            }
          : statusPatch;

        const response = await checkService.updateAsync(check.CheckId, patchPayload);
        const financeAction = response.FinanceAction ?? response.financeAction ?? null;
        toast.success(getFinanceActionMessage(financeAction));
      }
      onClose(true);
    } catch (e) {
      console.error('Save check error:', e);
      const apiFieldErrors = getApiFieldErrors(e, [
        'cash_account_id',
        'CashAccountId',
        'reason',
        'Reason',
        'status',
        'Status',
      ]);
      if (Object.keys(apiFieldErrors).length > 0) {
        setFieldErrors(apiFieldErrors);
      }
      const statusCode = (e as { status?: number })?.status;
      if (statusCode === 404) {
        setError('Çek kaydı bulunamadı. Liste yenilenecek.');
        onClose(true);
      } else if (statusCode === 422 && Object.keys(apiFieldErrors).length > 0) {
        setError('Bazı alanlar geçersiz. Lütfen alan hatalarını düzeltin.');
      } else {
        setError(getUserFacingErrorMessage(e, 'Çek kaydedilirken bir hata oluştu'));
      }
    } finally {
      setIsBusy(false);
    }
  };

  const readOnly = !canEdit;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-background-panel rounded-panel w-full max-w-3xl p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4">
          {isNew ? 'Yeni Çek' : 'Çek Detayı'}
        </h2>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Müşteri</label>
              <select
                className="input w-full"
                value={selectedCustomer?.CustomerId ?? ''}
                onChange={(e) => {
                  const id = e.target.value ? Number(e.target.value) : null;
                  const customer =
                    customers.find((c) => c.CustomerId === id) ?? null;
                  setSelectedCustomer(customer);
                }}
                disabled={readOnly}
              >
                <option value="">(Seçilmedi)</option>
                {customers.map((c) => (
                  <option key={c.CustomerId} value={c.CustomerId}>
                    {c.Name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Banka Adı <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="input w-full"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                disabled={readOnly}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Şube</label>
              <input
                type="text"
                className="input w-full"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                disabled={readOnly}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Hesap No / IBAN</label>
              <input
                type="text"
                className="input w-full"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                disabled={readOnly}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Çek Numarası <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="input w-full"
                value={checkNumber}
                onChange={(e) => setCheckNumber(e.target.value)}
                disabled={readOnly}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1">
                  Tutar <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="input w-full"
                  value={amount === '' ? '' : amount}
                  onChange={(e) =>
                    setAmount(e.target.value === '' ? '' : Number(e.target.value))
                  }
                  disabled={readOnly}
                />
              </div>
              <div className="w-24">
                <label className="block text-sm font-medium mb-1">Para Birimi</label>
                <select
                  className="input w-full"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as 'TRY' | 'EUR')}
                  disabled={readOnly}
                >
                  <option value="TRY">TRY</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1">
                  Keside Tarihi <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  className="input w-full"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  disabled={readOnly}
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1">
                  Vade Tarihi <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  className="input w-full"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  disabled={readOnly}
                />
              </div>
            </div>

            {!isNew && (
              <div>
                <label className="block text-sm font-medium mb-1">Durum</label>
                <select
                  className="input w-full"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as CheckStatus)}
                  disabled={readOnly}
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {(fieldErrors.status || fieldErrors.Status) && (
                  <p className="mt-1 text-xs text-red-400">{fieldErrors.status || fieldErrors.Status}</p>
                )}
              </div>
            )}

            {!isNew && status === 'CASHED' && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  Kasa Hesabı <span className="text-red-500">*</span>
                </label>
                <select
                  className="input w-full"
                  value={cashAccountId}
                  onChange={(e) => setCashAccountId(e.target.value)}
                  disabled={readOnly}
                >
                  <option value="">Kasa hesabı seçin</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.currency})
                    </option>
                  ))}
                </select>
                {(fieldErrors.cash_account_id || fieldErrors.CashAccountId) && (
                  <p className="mt-1 text-xs text-red-400">
                    {fieldErrors.cash_account_id || fieldErrors.CashAccountId}
                  </p>
                )}
              </div>
            )}

            {!isNew && (status === 'RETURNED' || status === 'CANCELLED') && (
              <div>
                <label className="block text-sm font-medium mb-1">Durum Açıklaması (Opsiyonel)</label>
                <textarea
                  className="input w-full min-h-[72px] resize-y"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={readOnly}
                  placeholder="İade/iptal sebebini yazabilirsiniz"
                />
                {(fieldErrors.reason || fieldErrors.Reason) && (
                  <p className="mt-1 text-xs text-red-400">{fieldErrors.reason || fieldErrors.Reason}</p>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1">Çek Sahibi (Borçlu)</label>
              <input
                type="text"
                className="input w-full"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                disabled={readOnly}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Notlar</label>
              <textarea
                className="input w-full min-h-[80px] resize-y"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={readOnly}
              />
            </div>
          </div>
        </div>
        {error && (
          <div className="mt-4 p-3 rounded-md border border-red-700 bg-red-900/30 text-error text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={() => onClose(false)}
            className="btn-secondary flex-1"
          >
            Kapat
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={handleSave}
              disabled={isBusy}
              className="btn-primary flex-1"
            >
              {isBusy ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

