import { apiClient } from './apiClient';
import { PermissionsResponse } from '../models';

export const permissionService = {
  async getAllAsync(): Promise<PermissionsResponse> {
    return apiClient.get<PermissionsResponse>('/permissions');
  },
};
