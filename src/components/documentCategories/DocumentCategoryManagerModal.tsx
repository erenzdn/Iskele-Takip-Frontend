import { XIcon } from '@phosphor-icons/react';
import DocumentCategoryManagerPanel from './DocumentCategoryManagerPanel';

interface DocumentCategoryManagerModalProps {
  open: boolean;
  onClose: () => void;
  /** Ad/renk değişikliği, sıralama veya silme sonrası listelerin yenilenmesi için */
  onChanged?: () => void;
}

/** Listelerden açılan "Kategorileri yönet" penceresi; içerik Sistem Ayarları ile ortaktır. */
export default function DocumentCategoryManagerModal({ open, onClose, onChanged }: DocumentCategoryManagerModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="bg-background-panel rounded-panel w-full max-w-lg shadow-xl flex flex-col max-h-[85vh]">
        <div className="flex items-start justify-between px-5 pt-5 pb-3">
          <div>
            <h3 className="text-xl font-bold">Teklif / Sözleşme Kategorileri</h3>
            <p className="text-xs text-text-secondary mt-1">
              Kategoriler teklif ve sözleşmelerde ortaktır; teklif sözleşmeye dönüşünce kategorileri de taşınır.
              Bu ayarlara Sistem Ayarları › Kategoriler'den de ulaşabilirsiniz.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-text-secondary hover:text-text-primary p-1" aria-label="Kapat">
            <XIcon size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-5">
          <DocumentCategoryManagerPanel onChanged={onChanged} />
        </div>
      </div>
    </div>
  );
}
