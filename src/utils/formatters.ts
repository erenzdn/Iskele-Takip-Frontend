export const formatCurrency = (amount: number, decimals: number = 2): string => {
  return `₺${amount.toLocaleString('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
};

export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('tr-TR');
};

export const formatDateTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleString('tr-TR');
};

/** Kısa tarih+saat (saniyesiz), liste sütunları için */
export const formatShortDateTime = (dateString: string | null | undefined): string => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};/** Audit log özeti: "X alanı Y yaptı" formatına hazır; ChangedColumns veya action'dan türetir */
export const buildAuditLogSummary = (
  changedColumns: string | null | undefined,
  action: number
): string => {
  if (changedColumns && changedColumns.trim()) return changedColumns.trim();
  const labels: Record<number, string> = {
    0: 'Kayıt oluşturuldu',
    1: 'Kayıt güncellendi',
    2: 'Kayıt silindi',
  };
  return labels[action] ?? 'İşlem';
};