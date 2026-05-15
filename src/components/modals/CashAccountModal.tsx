import { useEffect, useState } from 'react';
import { XIcon } from '@phosphor-icons/react';
import { CashAccount } from '../../models';
import { cashService } from '../../services/cashService';
import { getApiErrorMessage, getApiFieldErrors } from '../../utils/apiError';
import ConfirmModal from './ConfirmModal';

interface CashAccountModalProps {
  account: CashAccount | null;
  isNew: boolean;
  open: boolean;
  onClose: () => void;
  onCreated?: () => void | Promise<void>;
}

type AccountType = 'CASH' | 'BANK';
type Currency = 'TRY' | 'USD' | 'EUR' | 'GBP';

export default function CashAccountModal({
  account,
  isNew,
  open,
  onClose,
  onCreated,
}: CashAccountModalProps) {
  const [isReadOnly, setIsReadOnly] = useState(!isNew);
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('CASH');
  const [currency, setCurrency] = useState<Currency>('TRY');
  const [branchName, setBranchName] = useState('');
  const [accountNo, setAccountNo] = useState('');
  const [allowNegativeBalance, setAllowNegativeBalance] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    branch_name?: string;
    account_no?: string;
  }>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!open) return;
    setIsReadOnly(!isNew);
    if (account && !isNew) {
      setName(account.name ?? '');
      setType(account.type);
      setCurrency(account.currency);
      setBranchName(account.branch_name ?? '');
      setAccountNo(account.account_no ?? '');
      setAllowNegativeBalance(Boolean(account.allow_negative_balance));
      setIsActive(Boolean(account.is_active));
    } else {
      setName('');
      setType('CASH');
      setCurrency('TRY');
      setBranchName('');
      setAccountNo('');
      setAllowNegativeBalance(false);
      setIsActive(true);
    }
    setBusy(false);
    setError(null);
    setFieldErrors({});
    setShowDeleteConfirm(false);
  }, [open, isNew, account]);

  const handleSave = async () => {
    try {
      setError(null);
      setFieldErrors({});
      setBusy(true);

      const trimmedName = name.trim();
      const trimmedBranchName = branchName.trim();
      const trimmedAccountNo = accountNo.trim();
      if (!trimmedName) {
        setFieldErrors({ name: 'Hesap adı gereklidir.' });
        return;
      }
      if (type === 'BANK' && !trimmedBranchName) {
        setFieldErrors({ branch_name: 'Şube adı gereklidir.' });
        return;
      }
      if (type === 'BANK' && !trimmedAccountNo) {
        setFieldErrors({ account_no: 'Hesap no/IBAN gereklidir.' });
        return;
      }

      const payload = {
        name: trimmedName,
        type,
        currency,
        allow_negative_balance: allowNegativeBalance,
        ...(trimmedBranchName ? { branch_name: trimmedBranchName } : {}),
        ...(trimmedAccountNo ? { account_no: trimmedAccountNo } : {}),
      };

      if (isNew) {
        await cashService.createAccountAsync(payload);
      } else if (account) {
        await cashService.updateAccountAsync(account.id, {
          ...payload,
          is_active: isActive,
        });
      }

      await onCreated?.();
      onClose();
    } catch (e: unknown) {
      setFieldErrors(getApiFieldErrors(e, ['name', 'branch_name', 'account_no']));
      setError(getApiErrorMessage(e) || 'Hesap kaydedilemedi');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!account) return;
    try {
      setBusy(true);
      await cashService.deleteAccountAsync(account.id);
      setShowDeleteConfirm(false);
      await onCreated?.();
      onClose();
    } catch (e: unknown) {
      setError(getApiErrorMessage(e) || 'Hesap silinemedi');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-background-panel rounded-panel w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <header className="shrink-0 flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-text-primary">
            {isNew ? 'Yeni Kasa / Banka Hesabı' : 'Kasa / Banka Hesabı Detayı'}
          </h2>
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
            <label className="block text-xs font-medium text-text-primary">Hesap Adı</label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
                if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: undefined }));
              }}
              className="input w-full py-2 px-3 text-sm"
              placeholder="Örn: Merkez Kasa"
              disabled={busy || isReadOnly}
            />
            {fieldErrors.name && <p className="text-xs text-red-400">{fieldErrors.name}</p>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-text-primary">Hesap Türü</label>
              <select
                value={type}
                onChange={(e) => {
                  setType(e.target.value as AccountType);
                  if (error) setError(null);
                  setFieldErrors((prev) => ({ ...prev, branch_name: undefined, account_no: undefined }));
                }}
                className="input w-full py-2 px-3 text-sm"
                disabled={busy || isReadOnly}
              >
                <option value="CASH">Kasa</option>
                <option value="BANK">Banka</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-text-primary">Para Birimi</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as Currency)}
                className="input w-full py-2 px-3 text-sm"
                disabled={busy || isReadOnly}
              >
                <option value="TRY">TRY</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-text-primary">
                Şube Adı {type === 'BANK' ? '*' : '(Opsiyonel)'}
              </label>
              <input
                type="text"
                value={branchName}
                onChange={(e) => {
                  setBranchName(e.target.value);
                  if (error) setError(null);
                  if (fieldErrors.branch_name) {
                    setFieldErrors((prev) => ({ ...prev, branch_name: undefined }));
                  }
                }}
                className="input w-full py-2 px-3 text-sm"
                placeholder="Örn: Kadıköy Şubesi"
                disabled={busy || isReadOnly}
              />
              {fieldErrors.branch_name && <p className="text-xs text-red-400">{fieldErrors.branch_name}</p>}
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-text-primary">
                Hesap No / IBAN {type === 'BANK' ? '*' : '(Opsiyonel)'}
              </label>
              <input
                type="text"
                value={accountNo}
                onChange={(e) => {
                  setAccountNo(e.target.value);
                  if (error) setError(null);
                  if (fieldErrors.account_no) {
                    setFieldErrors((prev) => ({ ...prev, account_no: undefined }));
                  }
                }}
                className="input w-full py-2 px-3 text-sm"
                placeholder="Örn: TR12..."
                disabled={busy || isReadOnly}
              />
              {fieldErrors.account_no && <p className="text-xs text-red-400">{fieldErrors.account_no}</p>}
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={allowNegativeBalance}
              onChange={(e) => setAllowNegativeBalance(e.target.checked)}
              disabled={busy || isReadOnly}
            />
            <span className="text-sm text-text-primary">Negatif bakiyeye izin ver</span>
          </label>

          {!isNew && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={busy || isReadOnly}
              />
              <span className="text-sm text-text-primary">Hesap aktif</span>
            </label>
          )}

          {error && (
            <div className="p-3 rounded-md border border-red-700 bg-red-900/30 text-error text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            {!isNew && isReadOnly && (
              <button
                type="button"
                onClick={() => setIsReadOnly(false)}
                disabled={busy}
                className="btn-primary flex-1"
              >
                Düzenle
              </button>
            )}
            {!isReadOnly && (
              <>
                {!isNew && (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={busy}
                    className="btn-danger flex-1"
                  >
                    Sil
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  disabled={busy}
                  className="btn-secondary flex-1"
                >
                  İptal
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={busy}
                  className="btn-primary flex-1"
                >
                  {busy ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
              </>
            )}
            {isReadOnly && !isNew && (
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="btn-secondary flex-1"
              >
                Kapat
              </button>
            )}
          </div>
        </div>
      </div>
      <ConfirmModal
        open={showDeleteConfirm}
        title="Onaylıyor musunuz?"
        message="Bu hesabı pasife çekmek istediğinizden emin misiniz?"
        variant="danger"
        loading={busy}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}

