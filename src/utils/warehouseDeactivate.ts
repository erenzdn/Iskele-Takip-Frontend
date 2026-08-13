import type { ApiErrorResponse, WarehouseApiErrorCode } from '../models';
import { getApiErrorMessage, getWarehouseDeleteErrorMessage } from './apiError';

export interface StructuredApiError {
  message: string;
  code?: WarehouseApiErrorCode | string;
  status?: number;
}

export interface WarehouseDeactivateErrorDialog {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function parseStructuredApiError(error: unknown): StructuredApiError {
  const err = error as {
    message?: string;
    status?: number;
    code?: string;
    responseText?: string;
  };
  const status = err?.status;
  let code = err?.code;
  let message = '';

  if (err?.responseText) {
    try {
      const data = JSON.parse(err.responseText) as ApiErrorResponse;
      if (typeof data?.message === 'string') message = data.message;
      if (!code && typeof data?.code === 'string') code = data.code;
    } catch {
      // no-op
    }
  }

  if (!message) {
    message = getApiErrorMessage(error);
  }

  return { message, code, status };
}

export function resolveWarehouseDeactivateError(
  error: unknown,
  actions: {
    onGoToStock?: () => void;
    onGoToRentals?: () => void;
  }
): WarehouseDeactivateErrorDialog | null {
  const parsed = parseStructuredApiError(error);
  const message = parsed.message || getWarehouseDeleteErrorMessage(error);

  switch (parsed.code) {
    case 'WAREHOUSE_HAS_STOCK':
      return {
        title: 'Stok bulundu',
        message,
        actionLabel: 'Stok sekmesine git',
        onAction: actions.onGoToStock,
      };
    case 'WAREHOUSE_HAS_ACTIVE_RENTALS':
      return {
        title: 'Aktif kira var',
        message,
        actionLabel: 'Kiradakileri gör',
        onAction: actions.onGoToRentals,
      };
    default:
      return null;
  }
}
