import { apiClient } from './apiClient';
import type { Attachment, AttachmentCategory, AttachmentEntityType } from '../models';
import { compressImageFile } from '../utils/imageCompression';

/** Sunucu sınırıyla aynı (attachmentStorage.MAX_ATTACHMENT_BYTES) */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export const ATTACHMENT_CATEGORY_LABELS: Record<AttachmentCategory, string> = {
  SIGNED_WAYBILL: 'İmzalı irsaliye',
  DELIVERY_PHOTO: 'Teslim fotoğrafı',
  DAMAGE_PHOTO: 'Hasar fotoğrafı',
  SIGNED_CONTRACT: 'İmzalı sözleşme',
  OTHER: 'Diğer',
};

export interface UploadAttachmentParams {
  entityType: AttachmentEntityType;
  entityId: number;
  file: File;
  category?: AttachmentCategory;
  description?: string;
}

/**
 * Dosya ekleri API'si. Okuma izni bağlı kaydın görüntüleme izninden gelir;
 * yükleme attachments_upload, silme attachments_delete ister.
 */
export const attachmentService = {
  async listAsync(entityType: AttachmentEntityType, entityId: number): Promise<Attachment[]> {
    return apiClient.get<Attachment[]>(`/attachments?entityType=${entityType}&entityId=${entityId}`);
  },

  /**
   * Görselleri sıkıştırıp yükler. Türü desteklenmeyen veya sıkıştırma sonrası sınırı aşan dosyada hata fırlatır.
   */
  async uploadAsync({ entityType, entityId, file, category, description }: UploadAttachmentParams): Promise<Attachment> {
    if (!ACCEPTED_ATTACHMENT_TYPES.includes(file.type)) {
      throw new Error(`"${file.name}" desteklenmeyen bir dosya türü. İzin verilenler: JPEG, PNG, WebP, PDF.`);
    }

    let toSend = file;
    try {
      toSend = await compressImageFile(file);
    } catch {
      // Görsel çözülemezse (bozuk dosya vb.) orijinali gönder; sunucu içeriği ayrıca doğrular
      toSend = file;
    }
    if (toSend.size > MAX_ATTACHMENT_BYTES) {
      throw new Error(`"${file.name}" 10 MB sınırını aşıyor.`);
    }

    const form = new FormData();
    form.append('EntityType', entityType);
    form.append('EntityId', String(entityId));
    if (category) form.append('Category', category);
    if (description?.trim()) form.append('Description', description.trim());
    form.append('file', toSend, toSend.name);
    return apiClient.postFormData<Attachment>('/attachments', form);
  },

  async getFileBlobAsync(attachmentId: number): Promise<Blob> {
    return apiClient.getBlob(`/attachments/${attachmentId}/file`);
  },

  async deleteAsync(attachmentId: number): Promise<void> {
    await apiClient.delete<void>(`/attachments/${attachmentId}`);
  },
};
