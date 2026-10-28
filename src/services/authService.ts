import { apiClient } from './apiClient';
import { LoginRequest, LoginResponse } from '../models';

export const authService = {
  async loginAsync(credentials: LoginRequest): Promise<LoginResponse> {
    const requestBody = {
      username: credentials.username,
      password: credentials.password,
      // Uygulama file:// origin'inden çalıştığı için cookie taşınamaz; refresh token gövdede alınır.
      tokenTransport: 'body',
    };
    return apiClient.post<LoginResponse>('/auth/login', requestBody);
  },

  async logoutAsync(refreshToken: string | null): Promise<void> {
    await apiClient.post('/auth/logout', refreshToken ? { refreshToken } : undefined);
  },
};
