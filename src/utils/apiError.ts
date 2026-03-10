/**
 * API hata yanıtından kullanıcıya gösterilecek mesajı çıkarır.
 * apiClient hatalarda responseText ekler; backend genelde { message: "..." } veya { errors: [...] } döner.
 */
function tryParseMessageFromText(text: string): string | null {
  if (!text || typeof text !== 'string') return null;
  try {
    const data = JSON.parse(text) as { message?: string; errors?: Array<{ msg?: string; param?: string; path?: string }> };
    if (typeof data?.message === 'string') return data.message;
    if (Array.isArray(data?.errors) && data.errors.length > 0) {
      const parts = data.errors.map((e) => {
        const field = e.param || e.path || 'Alan';
        const msg = e.msg || 'Geçersiz değer';
        return `${field}: ${msg}`;
      });
      return parts.join('; ');
    }
  } catch {
    const firstLine = text.split('\n')[0]?.trim();
    if (firstLine) return firstLine;
  }
  return null;
}

export function getApiErrorMessage(error: unknown): string {
  const err = error as { message?: string; responseText?: string };
  if (!err) return 'Beklenmeyen hata';

  const fromResponse = tryParseMessageFromText(err.responseText ?? '');
  if (fromResponse) return fromResponse;

  const msg = err.message ?? '';
  const jsonMatch = msg.match(/\s-\s+(\{[\s\S]*\})\s*$/);
  if (jsonMatch) {
    const fromMessage = tryParseMessageFromText(jsonMatch[1]);
    if (fromMessage) return fromMessage;
  }

  return msg || 'Beklenmeyen hata';
}
