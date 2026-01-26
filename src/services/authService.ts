import { apiClient } from './apiClient';
import { LoginRequest, LoginResponse } from '../models';

export const authService = {
  async loginAsync(credentials: LoginRequest): Promise<LoginResponse> {
    // Backend camelCase bekliyor
    const requestBody = {
      username: credentials.username,
      password: credentials.password,
    };
    console.log('[AUTH] Request body (camelCase):', requestBody);
    return apiClient.post<LoginResponse>('/auth/login', requestBody);
  },
};

