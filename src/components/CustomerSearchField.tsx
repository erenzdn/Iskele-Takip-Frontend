import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CaretDownIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import { Customer } from '../models';
import { normalizeText } from '../utils/validation';

function customerMatchesQuery(c: Customer, q: string): boolean {
  const t = q.trim().toLocaleLowerCase('tr-TR');
  if (!t) return false;
  const name = (c.Name ?? '').toLocaleLowerCase('tr-TR');
  const tax = (c.TaxId ?? '').toLocaleLowerCase('tr-TR');
  const phoneNorm = (c.PhoneNumber ?? '').replace(/\D/g, '');
  const email = (c.Email ?? '').toLocaleLowerCase('tr-TR');
  const qDigits = t.replace(/\D/g, '');
  return (
    name.includes(t) ||
    tax.includes(t) ||
    email.includes(t) ||
    (qDigits.length > 0 && phoneNorm.includes(qDigits))
  );
}

export interface CustomerSearchFieldProps {
  customers: Customer[];
  value: number | '';
  onChange: (customerId: number | '') => void;
  disabled?: boolean;
  id?: string;
}

export default function CustomerSearchField({
  customers,
  value,
  onChange,
  disabled,
  id,
}: CustomerSearchFieldProps) {
  const [inputValue, setInputValue] = useState('');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = useMemo(() => {
    if (!value) return undefined;
    return customers.find((c) => c.CustomerId === Number(value));
  }, [customers, value]);

  const sortedCustomers = useMemo(
    () =>
      [...customers].sort((a, b) =>
        (a.Name ?? '').localeCompare(b.Name ?? '', 'tr-TR')
      ),
    [customers]
  );

  /** Üst bileşen `value` ile müşteri atadığında (ör. kayıt yükleme) etiket senkronu */
  useEffect(() => {
    if (value === '' || value === undefined || value === null) return;
    const c = customers.find((x) => x.CustomerId === Number(value));
    if (c) setInputValue(c.Name ?? '');
  }, [value, customers]);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const clearBlurTimer = () => {
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
  };

  useEffect(
    () => () => {
      clearBlurTimer();
    },
    []
  );

  /** Boş arama: tüm liste (sıralı). Yazınca: filtrelenmiş liste. */
  const listItems = useMemo(() => {
    const raw = inputValue.trim();
    if (!raw) return sortedCustomers;
    return sortedCustomers.filter((c) => customerMatchesQuery(c, raw));
  }, [sortedCustomers, inputValue]);

  const handleInputChange = (raw: string) => {
    const v = normalizeText(raw);
    setInputValue(v);
    if (!v.trim()) {
      onChange('');
      return;
    }
    const selLabel = normalizeText(selected?.Name ?? '').trim();
    if (selected && selLabel !== normalizeText(v).trim()) {
      onChange('');
    }
  };

  const pickCustomer = useCallback(
    (c: Customer) => {
      clearBlurTimer();
      onChange(c.CustomerId);
      setInputValue(c.Name ?? '');
      setOpen(false);
    },
    [onChange]
  );

  const openPanel = useCallback(() => {
    clearBlurTimer();
    setOpen(true);
    inputRef.current?.focus();
  }, []);

  if (disabled) {
    return (
      <div
        className="input w-full text-sm py-1.5 text-text-primary bg-background-secondary/40 cursor-not-allowed"
        id={id}
      >
        {selected?.Name ?? '—'}
      </div>
    );
  }

  const showPanel = open;
  const hasFilter = inputValue.trim().length > 0;
  const emptyMessage = hasFilter
    ? 'Eşleşen müşteri yok.'
    : customers.length === 0
      ? 'Kayıtlı müşteri yok.'
      : 'Müşteri yok.';

  return (
    <div ref={rootRef} className="relative">
      <span className="absolute inset-y-0 left-2 flex items-center pointer-events-none text-text-secondary z-[1]">
        <MagnifyingGlassIcon size={16} weight="regular" aria-hidden />
      </span>
      <button
        type="button"
        tabIndex={-1}
        className="absolute inset-y-0 right-1 z-[1] my-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-background-hover hover:text-text-primary transition-colors"
        aria-label="Müşteri listesini aç"
        onMouseDown={(e) => e.preventDefault()}
        onClick={openPanel}
      >
        <CaretDownIcon size={18} weight="bold" aria-hidden />
      </button>
      <input
        ref={inputRef}
        id={id}
        type="text"
        autoComplete="off"
        value={inputValue}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => {
          clearBlurTimer();
          setOpen(true);
        }}
        onBlur={() => {
          blurTimerRef.current = setTimeout(() => setOpen(false), 180);
        }}
        className="input w-full pl-8 pr-10 text-sm py-1.5"
        placeholder="Listeyi açıp kaydırın veya yazarak filtreleyin…"
        aria-label="Müşteri ara"
        aria-expanded={showPanel}
        aria-controls={id ? `${id}-suggestions` : undefined}
        aria-autocomplete="list"
        role="combobox"
      />
      {value !== '' && value !== undefined && value !== null && !selected && (
        <p className="mt-1 text-xs text-amber-600/90" role="status">
          Seçili müşteri bu listede yok (ör. arşivlenmiş veya arama dışı kaldı). Kayıt için listeden müşteri seçin.
        </p>
      )}
      {showPanel && (
        <ul
          id={id ? `${id}-suggestions` : undefined}
          className="absolute left-0 right-0 top-full z-50 mt-0.5 max-h-72 overflow-y-auto overscroll-contain rounded-lg border border-background-border bg-background-panel py-1 shadow-xl"
          role="listbox"
        >
          {listItems.length === 0 ? (
            <li className="px-3 py-2 text-sm text-text-secondary">{emptyMessage}</li>
          ) : (
            listItems.map((c) => (
              <li key={c.CustomerId} role="option">
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-primary/15 focus:bg-primary/15 focus:outline-none transition-colors"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickCustomer(c)}
                >
                  <span className="font-medium text-text-primary">{c.Name}</span>
                  {c.TaxId ? (
                    <span className="block text-xs text-text-secondary mt-0.5">VN: {c.TaxId}</span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
