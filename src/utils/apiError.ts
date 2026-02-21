/**
 * API hata yanıtından kullanıcıya gösterilecek mesajı çıkarır.
 * apiClient hatalarda responseText ekler; backend genelde { message: "..." } döner.
 */
export function getApiErrorMessage(error: unknown): string {
  const err = error as { message?: string; responseText?: string };
  if (!err) return 'Beklenmeyen hata';
  const text = err.responseText;
  if (text) {
    try {
      const data = JSON.parse(text) as { message?: string };
      if (typeof data?.message === 'string') return data.message;
    } catch {
      // JSON değilse ilk satır veya tam metin
      const firstLine = text.split('\n')[0]?.trim();
      if (firstLine) return firstLine;
    }
  }
  return err.message || 'Beklenmeyen hata';
}
