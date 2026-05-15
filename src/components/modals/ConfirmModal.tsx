interface ConfirmModalProps {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'default';
  loading?: boolean;
  /** true: yalnızca onay düğmesi (alert / bilgi mesajı) */
  singleAction?: boolean;
  /** Örn. z-[70] — ana modalın üzerinde göstermek için */
  zIndexClass?: string;
}

export default function ConfirmModal({
  open,
  title = 'Onaylıyor musunuz?',
  message,
  confirmLabel = 'Evet',
  cancelLabel = 'Hayır',
  onConfirm,
  onCancel,
  variant = 'default',
  loading = false,
  singleAction = false,
  zIndexClass = 'z-[60]',
}: ConfirmModalProps) {
  if (!open) return null;

  const confirmClass = variant === 'danger' ? 'btn-danger' : 'btn-primary';

  return (
    <div
      className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 ${zIndexClass}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div className="bg-background-panel rounded-panel w-full max-w-md p-6 shadow-xl">
        <h3 id="confirm-modal-title" className="text-xl font-bold mb-3">
          {title}
        </h3>
        <p className="text-text-secondary mb-6 whitespace-pre-line">{message}</p>
        <div className="flex gap-3 justify-end">
          {!singleAction && (
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="btn-secondary flex-1"
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={
              singleAction
                ? `${confirmClass} w-full sm:w-auto min-w-[140px]`
                : `${confirmClass} flex-1`
            }
          >
            {loading ? 'İşleniyor...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
