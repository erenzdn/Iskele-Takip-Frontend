import { apiClient } from './apiClient';
import { QuotePackage, QuotePackageDetail } from '../models';

export interface PackageManualItemRequest {
  productId: number;
  quantity: number;
}

export interface CreateQuotePackageRequest {
  packageName: string;
  description?: string;
  defaultDiscount?: number;
  sourceQuoteId?: number;
  items?: PackageManualItemRequest[];
}

export interface CreateQuotePackageResponse {
  PackageId?: number;
  packageId?: number;
  id?: number;
  message?: string;
}

function normalizePackage(raw: any): QuotePackage {
  const rawId =
    raw?.PackageId ??
    raw?.packageId ??
    raw?.id ??
    raw?.PackageID ??
    raw?.packageID ??
    raw?.Package_ID ??
    raw?.package_id;
  const normalizedId = String(rawId ?? '').trim();
  return {
    PackageId: normalizedId,
    PackageName: String(raw?.PackageName ?? raw?.packageName ?? raw?.name ?? '').trim(),
    Description: raw?.Description ?? raw?.description ?? undefined,
    DefaultDiscount: Number(raw?.DefaultDiscount ?? raw?.defaultDiscount ?? 0),
    CreatedAt: raw?.CreatedAt ?? raw?.createdAt ?? undefined,
    UpdatedAt: raw?.UpdatedAt ?? raw?.updatedAt ?? undefined,
  };
}

function normalizePackageDetail(raw: any): QuotePackageDetail {
  const base = normalizePackage(raw);
  const rawItems = Array.isArray(raw?.items) ? raw.items : Array.isArray(raw?.Items) ? raw.Items : [];
  return {
    ...base,
    items: rawItems.map((item: any) => ({
      ProductId: item?.ProductId ?? item?.productId ?? item?.ItemId ?? item?.itemId,
      ItemId: item?.ItemId ?? item?.itemId ?? item?.ProductId ?? item?.productId,
      ItemName: item?.ItemName ?? item?.itemName ?? item?.ProductName ?? item?.productName,
      Quantity: Number(item?.Quantity ?? item?.quantity ?? 0),
    })),
  };
}

export const packageService = {
  async getAllAsync(): Promise<QuotePackage[]> {
    const payload = await apiClient.get<any>('/packages');
    const list: any[] = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload?.packages)
      ? payload.packages
      : [];
    return list
      .map(normalizePackage)
      .filter((p: QuotePackage) => String(p.PackageId).trim().length > 0);
  },

  async getByIdAsync(id: string | number): Promise<QuotePackageDetail> {
    const detail = await apiClient.get<any>(`/packages/${id}`);
    return normalizePackageDetail(detail);
  },

  async createAsync(data: CreateQuotePackageRequest): Promise<CreateQuotePackageResponse> {
    return apiClient.post<CreateQuotePackageResponse>('/packages', data);
  },

  async deleteAsync(id: string | number): Promise<void> {
    return apiClient.delete<void>(`/packages/${id}`);
  },
};

