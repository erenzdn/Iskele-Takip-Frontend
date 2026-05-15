import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { XIcon, CheckCircleIcon, WarningCircleIcon, InfoIcon, WarningIcon } from '@phosphor-icons/react';
import { useToastStore, Toast, ToastVariant } from '../hooks/useToast';

/* ─── Variant stilleri ────────────────────────────────────────────────────── */
const VARIANT_STYLES: Record<
  ToastVariant,
  { bg: string; border: string; icon: string; iconComponent: typeof CheckCircleIcon }
> = {
  success: {
    bg: 'bg-toast-success-bg',
    border: 'border-toast-success-border',
    icon: 'text-toast-success-icon',
    iconComponent: CheckCircleIcon,
  },
  error: {
    bg: 'bg-toast-error-bg',
    border: 'border-toast-error-border',
    icon: 'text-toast-error-icon',
    iconComponent: WarningCircleIcon,
  },
  warning: {
    bg: 'bg-toast-warning-bg',
    border: 'border-toast-warning-border',
    icon: 'text-toast-warning-icon',
    iconComponent: WarningIcon,
  },
  info: {
    bg: 'bg-toast-info-bg',
    border: 'border-toast-info-border',
    icon: 'text-toast-info-icon',
    iconComponent: InfoIcon,
  },
};

/* ─── Tek bir Toast kartı ─────────────────────────────────────────────────── */
function ToastCard({ toast: t, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => onDismiss(t.id), 280); // animasyon süresi kadar bekle
  }, [t.id, onDismiss]);

  // Otomatik kapanma
  useEffect(() => {
    if (t.duration <= 0) return;
    timerRef.current = setTimeout(dismiss, t.duration);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [t.duration, dismiss]);

  // Hover'da zamanlayıcıyı duraklat
  const handleMouseEnter = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  const handleMouseLeave = () => {
    if (t.duration > 0) {
      timerRef.current = setTimeout(dismiss, t.duration);
    }
  };

  const style = VARIANT_STYLES[t.variant];
  const Icon = style.iconComponent;

  return (
    <div
      role="alert"
      aria-live="assertive"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`
        flex items-start gap-3 px-4 py-3 rounded-lg border shadow-lg backdrop-blur-sm
        min-w-[320px] max-w-[480px]
        ${style.bg} ${style.border}
        ${exiting ? 'animate-toast-exit' : 'animate-toast-enter'}
        transition-all duration-280
      `}
    >
      <Icon size={20} weight="fill" className={`shrink-0 mt-0.5 ${style.icon}`} aria-hidden />
      <p className="flex-1 text-sm text-text-inverse leading-relaxed whitespace-pre-line break-words">
        {t.message}
      </p>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 p-0.5 rounded text-text-inverse/60 hover:text-text-inverse hover:bg-background-hover/30 transition-colors"
        aria-label="Kapat"
      >
        <XIcon size={16} weight="bold" />
      </button>
    </div>
  );
}

/* ─── Container (portal ile body'ye render) ───────────────────────────────── */
export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return createPortal(
    <div
      aria-label="Bildirimler"
      className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastCard toast={t} onDismiss={removeToast} />
        </div>
      ))}
    </div>,
    document.body
  );
}
