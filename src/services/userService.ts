import { apiClient } from './apiClient';
import { User } from '../models';

export interface CreateUserRequest {
  Username: string;
  Password: string;
  FullName: string;
  Email?: string;
  IsActive: boolean;
  Permissions: string[];
}

export interface UpdateUserRequest {
  Password?: string;
  FullName?: string;
  Email?: string;
  IsActive?: boolean;
  Permissions?: string[];
}

export interface CreateUserResponse {
  UserId: number;
}

export const userService = {
  async getAllAsync(): Promise<User[]> {
    return apiClient.get<User[]>('/users');
  },

  async getByIdAsync(id: number): Promise<User> {
    return apiClient.get<User>(`/users/${id}`);
  },

  async searchAsync(searchText: string): Promise<User[]> {
    const allUsers = await apiClient.get<User[]>('/users');
    const search = searchText.toLowerCase();
    return allUsers.filter(
      (u) =>
        u.Username.toLowerCase().includes(search) ||
        u.FullName.toLowerCase().includes(search) ||
        (u.Email?.toLowerCase().includes(search) ?? false)
    );
  },

  async createAsync(data: CreateUserRequest): Promise<CreateUserResponse> {
    return apiClient.post<CreateUserResponse>('/users', data);
  },

  async updateAsync(id: number, data: UpdateUserRequest): Promise<void> {
    return apiClient.patch<void>(`/users/${id}`, data);
  },

  async deleteAsync(id: number): Promise<void> {
    return apiClient.delete<void>(`/users/${id}`);
  },
};
