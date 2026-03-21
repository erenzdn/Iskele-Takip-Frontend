import { useEffect, useState } from 'react';
import { Check, CheckStatus, Customer } from '../../models';
import { checkService } from '../../services/checkService';
import { customerService } from '../../services/customerService';
import { firstValidationError, normalizeText, validateDate, validateIban, validateNumber, validateRequired } from '../../utils/validation';
import { getUserFacingErrorMessage } from '../../utils/apiError';

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
    } else {
      setStatus('PORTFOLIO');
      setCurrency('TRY');
    }
  }, [check]);

  const handleSave = async () => {
    if (!canEdit) {
      onClose(false);
      return;
    }

    setError(null);
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
      Status: status,
      OwnerName: normalizeText(ownerName) || undefined,
      Notes: normalizeText(notes) || undefined,
    };

    try {
      setIsBusy(true);
      if (isNew) {
        await checkService.createAsync(payload);
      } else if (check?.CheckId) {
        await checkService.updateAsync(check.CheckId, payload);
      }
      onClose(true);
    } catch (e) {
      console.error('Save check error:', e);
      setError(getUserFacingErrorMessage(e, 'Çek kaydedilirken bir hata oluştu'));
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
            </div>

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

