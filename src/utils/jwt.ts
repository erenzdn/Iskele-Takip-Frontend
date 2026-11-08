function decodePayload(token: string | null): { exp?: number; iat?: number } | null {
  if (!token) return null;
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    return JSON.parse(atob(padded)) as { exp?: number; iat?: number };
  } catch {
    return null;
  }
}

/** JWT `exp` alanını milisaniye olarak döner; okunamazsa null. İmza doğrulamaz. */
export function getJwtExpiryMs(token: string | null): number | null {
  const exp = decodePayload(token)?.exp;
  return typeof exp === 'number' ? exp * 1000 : null;
}

/**
 * Sunucu saati ile cihaz saati arasındaki fark (ms). Token'ın `iat` değeri sunucunun
 * imzaladığı andır; yeni alınmış bir token için `iat - şimdi` ≈ saat farkı.
 */
export function getClockSkewMs(token: string | null, receivedAt = Date.now()): number {
  const iat = decodePayload(token)?.iat;
  return typeof iat === 'number' ? iat * 1000 - receivedAt : 0;
}
