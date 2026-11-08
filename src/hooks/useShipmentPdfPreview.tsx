import { useCallback, useEffect, useState } from 'react';
import PdfPreviewModal from '../components/modals/PdfPreviewModal';
import type { Shipment } from '../models';
import { shipmentService } from '../services/shipmentService';
import { toast } from './useToast';
import { getApiErrorMessage } from '../utils/apiError';

/**
 * Sevkiyat fişi PDF önizlemesi (yerleşik sevk fişi düzeni). Blob URL'leri kapanınca serbest bırakılır.
 */
export function useShipmentPdfPreview() {
  const [preview, setPreview] = useState<{ url: string; shipment: Shipment } | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);

  useEffect(() => {
    return () => {
      if (preview) window.URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  const openPreview = useCallback(async (shipment: Shipment) => {
    try {
      setLoadingId(shipment.ShipmentId);
      const blob = await shipmentService.getPdfBlobAsync(shipment.ShipmentId);
      setPreview({ url: window.URL.createObjectURL(blob), shipment });
    } catch (err) {
      toast.error(getApiErrorMessage(err) || 'Sevk fişi PDF oluşturulamadı.');
    } finally {
      setLoadingId(null);
    }
  }, []);

  const element = (
    <PdfPreviewModal
      open={preview != null}
      pdfUrl={preview?.url ?? null}
      title={preview ? `Sevkiyat Fişi ${preview.shipment.ShipmentNo}` : 'Sevkiyat Fişi'}
      downloadFileName={preview ? `sevk_fisi_${preview.shipment.ShipmentNo}.pdf` : 'sevk_fisi.pdf'}
      onClose={() => setPreview(null)}
    />
  );

  return { openPreview, loadingId, element };
}
