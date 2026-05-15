import { createContext, useContext, type ReactNode } from 'react';

export interface HeaderActionsContextValue {
  setActions: (actions: ReactNode) => void;
}

export const HeaderActionsContext = createContext<HeaderActionsContextValue | null>(null);

export function useHeaderActions() {
  const context = useContext(HeaderActionsContext);
  if (!context) {
    throw new Error('useHeaderActions must be used inside MainLayout');
  }
  return context;
}
