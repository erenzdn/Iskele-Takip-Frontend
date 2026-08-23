import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { XIcon } from '@phosphor-icons/react';
import { Document, Page, pdfjs } from 'react-pdf';

import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.js`;

interface PdfPreviewModalProps {
  open: boolean;
  pdfUrl: string | null;
  title?: string;
  downloadFileName?: string;
  onClose: () => void;
}

const HEADER_H = 56;
const PDF_MAGIC = '%PDF-';

function isPdfHeader(bytes: Uint8Array): boolean {
  if (bytes.length < PDF_MAGIC.length) return false;
  const header = new TextDecoder().decode(bytes.subarray(0, PDF_MAGIC.length));
  return header === PDF_MAGIC;
}

export default function PdfPreviewModal({
  open,
  pdfUrl,
  title = 'PDF Önizleme',
  downloadFileName = 'belge.pdf',
  onClose,
}: PdfPreviewModalProps) {
  const [numPages, setNumPages] = useState(0);
  const [pageWidth, setPageWidth] = useState(794);
  const [pdfBuffer, setPdfBuffer] = useState<ArrayBuffer | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!open) {
      setNumPages(0);
      return;
    }

    const updatePageWidth = () => {
      setPageWidth(Math.min(Math.floor(window.innerWidth * 0.82), 794));
    };

    updatePageWidth();
    window.addEventListener('resize', updatePageWidth);
    return () => window.removeEventListener('resize', updatePageWidth);
  }, [open]);

  useEffect(() => {
    setNumPages(0);
    setPdfBuffer(null);
    setLoadError(false);

    if (!open || !pdfUrl) {
      return;
    }

    let cancelled = false;

    const loadPdfBytes = async () => {
      try {
        const response = await fetch(pdfUrl);
        const buffer = await response.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        if (!isPdfHeader(bytes)) {
          throw new Error('Invalid PDF header');
        }
        if (!cancelled) {
          setPdfBuffer(buffer);
        }
      } catch {
        if (!cancelled) {
          setLoadError(true);
        }
      }
    };

    void loadPdfBytes();

    return () => {
      cancelled = true;
    };
  }, [open, pdfUrl]);

  const pdfFile = useMemo(() => {
    if (!pdfBuffer) return null;
    // pdf.js worker'a transfer edebildiği için kopya veriyoruz.
    return { data: new Uint8Array(pdfBuffer.slice(0)) };
  }, [pdfBuffer]);

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
          {loadError ? (
            <div className="text-error text-sm px-4">PDF görüntülenemedi.</div>
          ) : !pdfFile ? (
            <div className="text-text-secondary text-sm px-4">PDF yükleniyor...</div>
          ) : (
            <Document
              file={pdfFile}
              loading={<div className="text-text-secondary text-sm px-4">PDF yükleniyor...</div>}
              error={<div className="text-error text-sm px-4">PDF görüntülenemedi.</div>}
              noData={<div className="text-text-secondary text-sm px-4">PDF yükleniyor...</div>}
              onLoadSuccess={({ numPages: loadedPages }) => setNumPages(loadedPages)}
            >
              {numPages > 0 &&
                Array.from({ length: numPages }, (_, index) => (
                  <div key={`pdf-page-${index + 1}`} className="flex flex-col items-center gap-1">
                    <Page
                      pageNumber={index + 1}
                      width={pageWidth}
                      className="shadow-xl border border-background-border bg-white"
                      renderTextLayer
                      renderAnnotationLayer
                    />
                    <span className="text-xs text-text-secondary">
                      Sayfa {index + 1} / {numPages}
                    </span>
                  </div>
                ))}
            </Document>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
