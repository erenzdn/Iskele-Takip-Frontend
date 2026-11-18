import { useEffect, useState } from 'react';
import { TagIcon } from '@phosphor-icons/react';
import type { DocumentCategoryRef } from '../../models';
import { useAuthStore } from '../../store/authStore';
import { invalidateData } from '../../store/dataInvalidationStore';
import { useDocumentCategoryStore } from '../../services/documentCategoryService';
import { DocumentCategoryChip } from './DocumentCategoryChips';
import DocumentCategoryPickerModal from './DocumentCategoryPickerModal';
import DocumentCategoryManagerModal from './DocumentCategoryManagerModal';

interface DocumentCategoryHeaderControlProps {
  type: 'quote' | 'contract';
  id: number;
  label: string;
  categories?: DocumentCategoryRef[] | null;
}

/**
 * Teklif / sözleşme detay başlığında kategori rozetleri + "Kategori" düğmesi.
 * Kategoriler kaydın diğer alanlarından bağımsız kaydedilir (ayrı uç nokta), düzenleme modunu beklemez.
 */
export default function DocumentCategoryHeaderControl({ type, id, label, categories }: DocumentCategoryHeaderControlProps) {
  const permissions = useAuthStore((s) => s.user?.permissions);
  const canEdit = Boolean(permissions?.includes(type === 'quote' ? 'quotes_update' : 'contracts_update'));
  const canManage = Boolean(permissions?.includes('quotes_update') || permissions?.includes('contracts_update'));
  const [current, setCurrent] = useState<DocumentCategoryRef[]>(categories ?? []);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);

  // Kayıt değişince / yeniden yüklenince sunucudaki listeyle senkronla.
  // Alan hiç gelmediyse (ör. PATCH yanıtı kategorisiz döndüyse) mevcut rozetler korunur.
  const serverKey =
    categories === undefined
      ? undefined
      : (categories ?? []).map((c) => `${c.DocumentCategoryId}:${c.Name}:${c.Color}`).join('|');
  useEffect(() => {
    if (categories === undefined) return;
    setCurrent(categories ?? []);
    // serverKey içerik değişimini temsil eder
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, serverKey]);

  if (!canEdit && current.length === 0) return null;

  return (
    <>
      <span className="inline-flex flex-wrap items-center gap-0.5">
        {current.map((category) => (
          <DocumentCategoryChip key={category.DocumentCategoryId} category={category} />
        ))}
        {canEdit && (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex items-center gap-1 rounded border border-dashed border-background-border px-1.5 py-px text-[10px] font-medium text-text-secondary hover:text-text-primary hover:border-text-secondary"
            title="Kategorileri düzenle"
          >
            <TagIcon size={11} aria-hidden />
            {current.length === 0 ? 'Kategori ekle' : 'Düzenle'}
          </button>
        )}
      </span>
      <DocumentCategoryPickerModal
        open={pickerOpen}
        entity={{ type, id, label }}
        initialCategoryIds={current.map((c) => c.DocumentCategoryId)}
        onClose={() => setPickerOpen(false)}
        onSaved={(next) => {
          setCurrent(next);
          invalidateData(type === 'quote' ? 'quotes' : 'contracts');
        }}
        onManage={canManage ? () => setManagerOpen(true) : undefined}
      />
      <DocumentCategoryManagerModal
        open={managerOpen}
        onClose={() => setManagerOpen(false)}
        onChanged={() => {
          // Yeniden adlandırma / renk / silme rozetlere hemen yansısın
          const pool = new Map(
            useDocumentCategoryStore.getState().categories.map((c) => [c.DocumentCategoryId, c])
          );
          setCurrent((prev) =>
            prev.flatMap((c) => {
              const fresh = pool.get(c.DocumentCategoryId);
              return fresh ? [{ DocumentCategoryId: fresh.DocumentCategoryId, Name: fresh.Name, Color: fresh.Color }] : [];
            })
          );
          invalidateData('quotes');
          invalidateData('contracts');
        }}
      />
    </>
  );
}
