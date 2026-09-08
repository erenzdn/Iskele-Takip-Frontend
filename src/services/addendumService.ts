import { apiClient } from './apiClient';
import type {
  Addendum,
  AddendumDetail,
  AddendumReversalPreview,
  AddendumReversalPreviewDetail,
  AddendumReversalSkipped,
  AddendumReversalWarning,
  ChangeType,
  CreateAddendumReversalRequest,
  CreateAddendumReversalResult,
} from '../models';
import { buildAddendumAddedLineSources, normalizeAddendumStatus, type AddendumLineSource } from '../utils/addendum';

export interface CreateAddendumRequest {
  EffectiveDate: string;
  Reason?: string;
  AddendumCode?: string;
}

export interface UpdateAddendumRequest {
  EffectiveDate?: string;
  Reason?: string | null;
  AddendumCode?: string | null;
}

export interface CreateAddendumDetailRequest {
  ChangeType: ChangeType;
  ContractDetailId?: number;
  ItemId?: number;
  WarehouseId?: number;
  IsManual?: boolean;
  Description?: string;
  QuantityChange?: number;
  NewUnitPrice?: number;
  NewMonthlyOverride?: number | null;
}

export type UpdateAddendumDetailRequest = Partial<CreateAddendumDetailRequest>;

export interface RejectAddendumRequest {
  RejectionReason: string;
}

export type { CreateAddendumReversalRequest, CreateAddendumReversalResult };

function nullableNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeDetail(raw: unknown): AddendumDetail {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    DetailId: Number(o.DetailId ?? o.detailId ?? 0),
    AddendumId: Number(o.AddendumId ?? o.addendumId ?? 0),
    ChangeType: String(o.ChangeType ?? o.changeType ?? 'ADD').toUpperCase() as ChangeType,
    ContractDetailId: (o.ContractDetailId ?? o.contractDetailId ?? null) as number | null,
    ItemId: (o.ItemId ?? o.itemId ?? null) as number | null,
    WarehouseId: (o.WarehouseId ?? o.warehouseId ?? null) as number | null,
    IsManual: Boolean(o.IsManual ?? o.isManual ?? false),
    Description: (o.Description ?? o.description ?? null) as string | null,
    QuantityChange:
      o.QuantityChange != null || o.quantityChange != null
        ? Number(o.QuantityChange ?? o.quantityChange)
        : null,
    NewUnitPrice:
      o.NewUnitPrice != null || o.newUnitPrice != null
        ? Number(o.NewUnitPrice ?? o.newUnitPrice)
        : null,
    NewMonthlyOverride:
      o.NewMonthlyOverride != null || o.newMonthlyOverride != null
        ? Number(o.NewMonthlyOverride ?? o.newMonthlyOverride)
        : null,
    ItemName: (o.ItemName ?? o.itemName ?? null) as string | null,
    ItemCode: (o.ItemCode ?? o.itemCode ?? null) as string | null,
    WarehouseName: (o.WarehouseName ?? o.warehouseName ?? null) as string | null,
    ContractDetailDescription: (o.ContractDetailDescription ??
      o.contractDetailDescription ??
      null) as string | null,
  };
}

function normalizeReversalWarning(raw: unknown): AddendumReversalWarning {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    sourceDetailId: Number(o.sourceDetailId ?? o.SourceDetailId ?? 0),
    message: String(o.message ?? o.Message ?? ''),
  };
}

function normalizeReversalSkipped(raw: unknown): AddendumReversalSkipped {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    sourceDetailId: Number(o.sourceDetailId ?? o.SourceDetailId ?? 0),
    changeType: String(o.changeType ?? o.ChangeType ?? ''),
    reason: String(o.reason ?? o.Reason ?? ''),
  };
}

function normalizeReversalPreviewDetail(raw: unknown): AddendumReversalPreviewDetail {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    ChangeType: String(o.ChangeType ?? o.changeType ?? 'DECREASE').toUpperCase() as ChangeType,
    ContractDetailId: nullableNumber(o.ContractDetailId ?? o.contractDetailId),
    QuantityChange:
      o.QuantityChange != null || o.quantityChange != null
        ? Number(o.QuantityChange ?? o.quantityChange)
        : null,
    ItemId: nullableNumber(o.ItemId ?? o.itemId),
    NewUnitPrice:
      o.NewUnitPrice != null || o.newUnitPrice != null
        ? Number(o.NewUnitPrice ?? o.newUnitPrice)
        : null,
    NewMonthlyOverride:
      o.NewMonthlyOverride != null || o.newMonthlyOverride != null
        ? Number(o.NewMonthlyOverride ?? o.newMonthlyOverride)
        : null,
    ItemName: (o.ItemName ?? o.itemName ?? null) as string | null,
    ItemCode: (o.ItemCode ?? o.itemCode ?? null) as string | null,
    ContractDetailDescription: (o.ContractDetailDescription ??
      o.contractDetailDescription ??
      null) as string | null,
    Description: (o.Description ?? o.description ?? null) as string | null,
  };
}

function normalizeReversalPreview(raw: unknown): AddendumReversalPreview {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const detailsRaw = o.reversalDetails ?? o.ReversalDetails;
  const warningsRaw = o.warnings ?? o.Warnings;
  const skippedRaw = o.skipped ?? o.Skipped;
  return {
    sourceAddendumId: Number(o.sourceAddendumId ?? o.SourceAddendumId ?? 0),
    sourceAddendumNumber: nullableNumber(o.sourceAddendumNumber ?? o.SourceAddendumNumber),
    sourceAddendumCode: (o.sourceAddendumCode ?? o.SourceAddendumCode ?? null) as string | null,
    reversalDetails: Array.isArray(detailsRaw) ? detailsRaw.map(normalizeReversalPreviewDetail) : [],
    warnings: Array.isArray(warningsRaw) ? warningsRaw.map(normalizeReversalWarning) : [],
    skipped: Array.isArray(skippedRaw) ? skippedRaw.map(normalizeReversalSkipped) : [],
  };
}

function normalizeAddendum(raw: unknown): Addendum {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const detailsRaw = o.details ?? o.Details;
  const details = Array.isArray(detailsRaw) ? detailsRaw.map(normalizeDetail) : undefined;
  const reversesAddendumId = nullableNumber(o.ReversesAddendumId ?? o.reversesAddendumId);
  const reversedByAddendumId = nullableNumber(o.ReversedByAddendumId ?? o.reversedByAddendumId);
  const isReversal =
    o.IsReversal != null || o.isReversal != null
      ? Boolean(o.IsReversal ?? o.isReversal)
      : reversesAddendumId != null;
  const isReversed =
    o.IsReversed != null || o.isReversed != null
      ? Boolean(o.IsReversed ?? o.isReversed)
      : reversedByAddendumId != null;
  return {
    AddendumId: Number(o.AddendumId ?? o.addendumId ?? 0),
    ContractId: Number(o.ContractId ?? o.contractId ?? 0),
    AddendumNo: (o.AddendumNo ?? o.addendumNo ?? null) as number | null,
    AddendumCode: (o.AddendumCode ?? o.addendumCode ?? null) as string | null,
    Status: normalizeAddendumStatus(o.Status ?? o.status),
    EffectiveDate: String(o.EffectiveDate ?? o.effectiveDate ?? ''),
    Reason: (o.Reason ?? o.reason ?? null) as string | null,
    RejectionReason: (o.RejectionReason ?? o.rejectionReason ?? null) as string | null,
    CreatedAt: (o.CreatedAt ?? o.createdAt) as string | undefined,
    UpdatedAt: (o.UpdatedAt ?? o.updatedAt) as string | undefined,
    SubmittedAt: (o.SubmittedAt ?? o.submittedAt ?? null) as string | null,
    ApprovedAt: (o.ApprovedAt ?? o.approvedAt ?? null) as string | null,
    RejectedAt: (o.RejectedAt ?? o.rejectedAt ?? null) as string | null,
    CreatedByUserId: (o.CreatedByUserId ?? o.createdByUserId ?? null) as number | null,
    CreatedByName: (o.CreatedByName ?? o.createdByName ?? null) as string | null,
    ApprovedByUserId: (o.ApprovedByUserId ?? o.approvedByUserId ?? null) as number | null,
    ApprovedByName: (o.ApprovedByName ?? o.approvedByName ?? null) as string | null,
    RejectedByUserId: (o.RejectedByUserId ?? o.rejectedByUserId ?? null) as number | null,
    RejectedByName: (o.RejectedByName ?? o.rejectedByName ?? null) as string | null,
    ReversesAddendumId: reversesAddendumId,
    ReversedByAddendumId: reversedByAddendumId,
    ReversedAt: (o.ReversedAt ?? o.reversedAt ?? null) as string | null,
    IsReversal: isReversal,
    IsReversed: isReversed,
    ReversesAddendumNumber: nullableNumber(o.ReversesAddendumNumber ?? o.reversesAddendumNumber),
    ReversesAddendumCode: (o.ReversesAddendumCode ?? o.reversesAddendumCode ?? null) as string | null,
    ReversedByAddendumNumber: nullableNumber(
      o.ReversedByAddendumNumber ?? o.reversedByAddendumNumber
    ),
    ReversedByAddendumCode: (o.ReversedByAddendumCode ?? o.reversedByAddendumCode ?? null) as
      | string
      | null,
    details,
    Details: details,
  };
}

function normalizeReversalResult(raw: unknown): CreateAddendumReversalResult {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const addendumRaw = o.addendum ?? o.Addendum ?? raw;
  const detailsRaw = o.details ?? o.Details;
  const warningsRaw = o.warnings ?? o.Warnings;
  const skippedRaw = o.skipped ?? o.Skipped;
  const addendum = normalizeAddendum(addendumRaw);
  const details = Array.isArray(detailsRaw)
    ? detailsRaw.map(normalizeDetail)
    : (addendum.details ?? addendum.Details ?? []);
  return {
    addendum: { ...addendum, details, Details: details },
    details,
    warnings: Array.isArray(warningsRaw) ? warningsRaw.map(normalizeReversalWarning) : [],
    skipped: Array.isArray(skippedRaw) ? skippedRaw.map(normalizeReversalSkipped) : [],
  };
}

function asList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items;
    if (Array.isArray(o.data)) return o.data;
    if (Array.isArray(o.addendums)) return o.addendums;
  }
  return [];
}

export const addendumService = {
  async listByContractAsync(contractId: number): Promise<Addendum[]> {
    const raw = await apiClient.get<unknown>(`/contracts/${contractId}/addendums`);
    return asList(raw).map(normalizeAddendum);
  },

  /** Onaylı zeyilnamelerde ADD ile oluşan sözleşme kalemlerini eşleştirir */
  async loadAddedLineSourcesAsync(contractId: number): Promise<Map<number, AddendumLineSource>> {
    const list = await this.listByContractAsync(contractId);
    const approved = list.filter((a) => a.Status === 'approved');
    if (approved.length === 0) return new Map();

    const enriched = await Promise.all(
      approved.map(async (addendum) => {
        const existingDetails = addendum.details ?? addendum.Details;
        if (existingDetails && existingDetails.length > 0) return addendum;
        try {
          return await this.getByIdAsync(addendum.AddendumId);
        } catch {
          return addendum;
        }
      })
    );

    return buildAddendumAddedLineSources(enriched);
  },

  async getByIdAsync(id: number): Promise<Addendum> {
    const raw = await apiClient.get<unknown>(`/addendums/${id}`);
    return normalizeAddendum(raw);
  },

  async createAsync(contractId: number, body: CreateAddendumRequest): Promise<Addendum> {
    const raw = await apiClient.post<unknown>(`/contracts/${contractId}/addendums`, body);
    return normalizeAddendum(raw);
  },

  async updateAsync(id: number, body: UpdateAddendumRequest): Promise<Addendum> {
    const raw = await apiClient.patch<unknown>(`/addendums/${id}`, body);
    return normalizeAddendum(raw);
  },

  async addDetailAsync(id: number, body: CreateAddendumDetailRequest): Promise<AddendumDetail> {
    const raw = await apiClient.post<unknown>(`/addendums/${id}/details`, body);
    return normalizeDetail(raw);
  },

  async updateDetailAsync(
    id: number,
    detailId: number,
    body: UpdateAddendumDetailRequest
  ): Promise<AddendumDetail> {
    const raw = await apiClient.patch<unknown>(`/addendums/${id}/details/${detailId}`, body);
    return normalizeDetail(raw);
  },

  async deleteDetailAsync(id: number, detailId: number): Promise<void> {
    await apiClient.delete(`/addendums/${id}/details/${detailId}`);
  },

  async submitAsync(id: number): Promise<Addendum> {
    const raw = await apiClient.post<unknown>(`/addendums/${id}/submit`, {});
    return normalizeAddendum(raw);
  },

  async approveAsync(id: number): Promise<Addendum> {
    const raw = await apiClient.post<unknown>(`/addendums/${id}/approve`, {});
    return normalizeAddendum(raw);
  },

  async rejectAsync(id: number, body: RejectAddendumRequest): Promise<Addendum> {
    const raw = await apiClient.post<unknown>(`/addendums/${id}/reject`, body);
    return normalizeAddendum(raw);
  },

  async deleteAsync(id: number): Promise<void> {
    await apiClient.delete(`/addendums/${id}`);
  },

  async getReversalPreviewAsync(id: number): Promise<AddendumReversalPreview> {
    const raw = await apiClient.get<unknown>(`/addendums/${id}/reversal-preview`);
    return normalizeReversalPreview(raw);
  },

  async reverseAsync(
    id: number,
    body: CreateAddendumReversalRequest
  ): Promise<CreateAddendumReversalResult> {
    const raw = await apiClient.post<unknown>(`/addendums/${id}/reverse`, body);
    return normalizeReversalResult(raw);
  },

  async generateDocumentAsync(
    id: number,
    templateId?: number,
    format: 'pdf' | 'docx' = 'pdf'
  ): Promise<Blob> {
    const payload: Record<string, unknown> = { format };
    if (templateId != null) payload.templateId = templateId;
    return apiClient.postBlob(`/addendums/${id}/generate-document`, payload);
  },

  async previewDocumentAsync(id: number, templateId?: number): Promise<Blob> {
    const payload: Record<string, unknown> = {};
    if (templateId != null) payload.templateId = templateId;
    return apiClient.postBlob(`/addendums/${id}/preview-document`, payload);
  },
};
