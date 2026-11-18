import { WarningIcon } from '@phosphor-icons/react';
import type { DocumentThemeStatus } from '../../hooks/useDocumentTheme';

/**
 * Sunucudaki belge stil sayfası bu uygulama sürümüyle aynı değilse "Önizle" yanında uyarı.
 * Backend ile uygulama farklı sürümdeyse editörde görülen satır/sayfa düzeni PDF'ten ayrışabilir.
 */
export default function DocumentThemeWarning({ status }: { status: DocumentThemeStatus }) {
  if (status !== 'out-of-sync') return null;
  return (
    <span
      role="status"
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 text-xs font-medium text-amber-500"
      title={
        'Sunucudaki belge stili bu uygulama sürümünden farklı (backend ile uygulama aynı sürümde değil). ' +
        'Önizleme, editörde gördüğünüzden farklı satır veya sayfa düzeninde çıkabilir. ' +
        'Uygulamayı ve sunucuyu aynı sürüme güncelleyin.'
      }
    >
      <WarningIcon size={16} weight="fill" />
      <span className="hidden md:inline">Sunucu sürümü farklı</span>
    </span>
  );
}
