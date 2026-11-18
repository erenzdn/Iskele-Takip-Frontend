import { useEffect, useMemo, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.js`;

const PDF_MAGIC = '%PDF-';

function isPdfHeader(bytes: Uint8Array): boolean {
  if (bytes.length < PDF_MAGIC.length) return false;
  const header = new TextDecoder().decode(bytes.subarray(0, PDF_MAGIC.length));
  return header === PDF_MAGIC;
}

interface PdfPagesViewProps {
  pdfUrl: string;
  /** Sayfa genişliği (px). */
  pageWidth: number;
  onPageCount?: (count: number) => void;
}

/** Blob URL'deki PDF'in tüm sayfalarını alt alta çizer. */
export default function PdfPagesView({ pdfUrl, pageWidth, onPageCount }: PdfPagesViewProps) {
  const [numPages, setNumPages] = useState(0);
  const [pdfBuffer, setPdfBuffer] = useState<ArrayBuffer | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    setNumPages(0);
    setPdfBuffer(null);
    setLoadError(false);

    let cancelled = false;
    const loadPdfBytes = async () => {
      try {
        const response = await fetch(pdfUrl);
        const buffer = await response.arrayBuffer();
        if (!isPdfHeader(new Uint8Array(buffer))) {
          throw new Error('Invalid PDF header');
        }
        if (!cancelled) setPdfBuffer(buffer);
      } catch {
        if (!cancelled) setLoadError(true);
      }
    };
    void loadPdfBytes();
    return () => {
      cancelled = true;
    };
  }, [pdfUrl]);

  const pdfFile = useMemo(() => {
    if (!pdfBuffer) return null;
    // pdf.js worker'a transfer edebildiği için kopya veriyoruz.
    return { data: new Uint8Array(pdfBuffer.slice(0)) };
  }, [pdfBuffer]);

  if (loadError) {
    return <div className="text-error text-sm px-4">PDF görüntülenemedi.</div>;
  }
  if (!pdfFile) {
    return <div className="text-text-secondary text-sm px-4">PDF yükleniyor...</div>;
  }

  return (
    <Document
      file={pdfFile}
      loading={<div className="text-text-secondary text-sm px-4">PDF yükleniyor...</div>}
      error={<div className="text-error text-sm px-4">PDF görüntülenemedi.</div>}
      noData={<div className="text-text-secondary text-sm px-4">PDF yükleniyor...</div>}
      onLoadSuccess={({ numPages: loadedPages }) => {
        setNumPages(loadedPages);
        onPageCount?.(loadedPages);
      }}
      className="flex flex-col items-center gap-4"
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
  );
}

/** Sunucudan gelen blob gerçekten PDF mi? Değilse anlaşılır bir hata mesajı döner. */
export async function validatePdfBlob(blob: Blob): Promise<string | null> {
  if (blob.size === 0) return 'Sunucu boş yanıt döndürdü.';
  const isPdf = blob.type === 'application/pdf' || blob.type === '';
  if (!isPdf && blob.size < 10000) {
    const text = await blob.text();
    try {
      const j = JSON.parse(text);
      return 'Önizleme hatası: ' + (j.message || text.slice(0, 200));
    } catch {
      return 'Sunucu PDF döndürmedi. Content-Type: ' + (blob.type || '(boş)');
    }
  }
  return null;
}
