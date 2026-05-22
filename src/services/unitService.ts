import { apiClient } from './apiClient';
import { Unit } from '../models';

export interface CreateUnitRequest {
  UnitName: string;
}

export interface UpdateUnitRequest {
  UnitName: string;
}

export const unitService = {
  async getAllAsync(): Promise<Unit[]> {
    return apiClient.get<Unit[]>('/units');
  },

  async createAsync(data: CreateUnitRequest): Promise<Unit> {
    return apiClient.post<Unit>('/units', data);
  },

  async updateAsync(id: number, data: UpdateUnitRequest): Promise<void> {
    return apiClient.patch<void>(`/units/${id}`, data);
  },

  async deleteAsync(id: number): Promise<void> {
    return apiClient.delete<void>(`/units/${id}`);
  },
};
