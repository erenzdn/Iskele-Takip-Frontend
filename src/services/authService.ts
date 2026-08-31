import { apiClient } from './apiClient';
import { LoginRequest, LoginResponse } from '../models';

export const authService = {
  async loginAsync(credentials: LoginRequest): Promise<LoginResponse> {
    const requestBody = {
      username: credentials.username,
      password: credentials.password,
    };
    return apiClient.post<LoginResponse>('/auth/login', requestBody);
  },

  async logoutAsync(): Promise<void> {
    await apiClient.post('/auth/logout');
  },
};

