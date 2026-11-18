import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePortalTarget } from '../tabs/TabContext';
import { XIcon } from '@phosphor-icons/react';
import PdfPagesView from './PdfPagesView';

interface PdfPreviewModalProps {
  open: boolean;
  pdfUrl: string | null;
  title?: string;
  downloadFileName?: string;
  onClose: () => void;
}

const HEADER_H = 56;

export default function PdfPreviewModal({
  open,
  pdfUrl,
  title = 'PDF Önizleme',
  downloadFileName = 'belge.pdf',
  onClose,
}: PdfPreviewModalProps) {
  const portalTarget = usePortalTarget();
  const [pageWidth, setPageWidth] = useState(794);

  useEffect(() => {
    if (!open) return;
    const updatePageWidth = () => {
      setPageWidth(Math.min(Math.floor(window.innerWidth * 0.82), 794));
    };
    updatePageWidth();
    window.addEventListener('resize', updatePageWidth);
    return () => window.removeEventListener('resize', updatePageWidth);
  }, [open]);

  const handleDownload = () => {
    if (!pdfUrl) return;
    const a = document.createElement('a');
    a.href = pdfUrl;
    a.download = downloadFileName;
    a.click();
  };

  if (!open || !pdfUrl) return null;

  const modalContent = (
    <div
      className="fixed inset-0 flex flex-col z-[150]"
      style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
    >
      <div className="shrink-0 flex items-center justify-between px-6 py-3 bg-background-panel border-b border-background-border">
        <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownload}
            className="btn-secondary text-sm px-4 py-1.5"
          >
            İndir
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-text-secondary hover:bg-background-hover hover:text-text-primary transition-colors"
            aria-label="Kapat"
          >
            <XIcon size={22} weight="regular" />
          </button>
        </div>
      </div>
      <div
        className="w-full flex-1 min-h-0 relative bg-background-main overflow-auto"
        style={{ height: `calc(100vh - ${HEADER_H}px)` }}
      >
        <div className="flex flex-col items-center gap-4 py-6 px-4">
          <PdfPagesView pdfUrl={pdfUrl} pageWidth={pageWidth} />
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, portalTarget);
}
