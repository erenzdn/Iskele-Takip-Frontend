import type { ReactNode } from 'react';

/**
 * Sayfanın kendi araç çubuğundaki (filtre paneli vb.) aksiyon butonları.
 * Üst sekme çubuğu yalnızca sekmelere ayrıldığı için sayfa aksiyonları
 * sayfanın içinde, sağa yaslı olarak gösterilir.
 */
export function PageActions({ children, className = 'ml-auto' }: { children: ReactNode; className?: string }) {
  if (children == null || children === false) return null;
  return <div className={`flex flex-wrap items-center justify-end gap-1.5 ${className}`}>{children}</div>;
}
