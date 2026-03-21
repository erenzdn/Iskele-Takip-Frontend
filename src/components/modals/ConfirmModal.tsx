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
}: ConfirmModalProps) {
  if (!open) return null;

  const confirmClass = variant === 'danger' ? 'btn-danger' : 'btn-primary';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
      <div className="bg-background-panel rounded-panel w-full max-w-md p-6 shadow-xl">
        <h3 className="text-xl font-bold mb-3">{title}</h3>
        <p className="text-text-secondary mb-6 whitespace-pre-line">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="btn-secondary flex-1"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`${confirmClass} flex-1`}
          >
            {loading ? 'İşleniyor...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
