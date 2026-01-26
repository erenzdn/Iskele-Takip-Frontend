import { apiClient } from './apiClient';
import { TemplateImage, ImageUsageStats } from '../models';

export interface UploadImageRequest {
  FileName: string;
  MimeType: string;
  ImageData: string; // data:image/...;base64,...
}

export interface UploadImageResponse {
  ImageId: number;
  FileSize: number;
}

export const templateImageService = {
  async getAllAsync(all?: boolean): Promise<TemplateImage[]> {
    const query = all ? '?all=true' : '';
    return apiClient.get<TemplateImage[]>(`/template-images${query}`);
  },

  async getByIdAsync(id: number): Promise<Blob> {
    return apiClient.getBlob(`/template-images/${id}`);
  },

  async getMetaAsync(id: number): Promise<TemplateImage> {
    return apiClient.get<TemplateImage>(`/template-images/${id}/meta`);
  },

  async uploadAsync(file: File): Promise<UploadImageResponse> {
    // Dosya boyutu kontrolü (5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      throw new Error(`Dosya boyutu 5MB'dan büyük olamaz. Seçilen dosya: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
    }

    // Format kontrolü
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      throw new Error(`Desteklenmeyen dosya formatı. İzin verilen formatlar: JPEG, PNG, GIF, WebP`);
    }

    // Base64'e çevir
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const imageData = e.target?.result as string;
          const request: UploadImageRequest = {
            FileName: file.name,
            MimeType: file.type,
            ImageData: imageData,
          };

          const response = await apiClient.post<UploadImageResponse>('/template-images', request);
          resolve(response);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  async deleteAsync(id: number): Promise<void> {
    return apiClient.delete<void>(`/template-images/${id}`);
  },

  async getUsageStatsAsync(): Promise<ImageUsageStats> {
    return apiClient.get<ImageUsageStats>('/template-images/stats/usage');
  },
};
