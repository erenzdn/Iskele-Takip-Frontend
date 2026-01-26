import { create } from 'zustand';
import { LoginUserDto } from '../models';

interface AuthState {
  token: string | null;
  user: LoginUserDto | null;
  isAuthenticated: boolean;
  login: (token: string, user: LoginUserDto) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('auth_token'),
  user: localStorage.getItem('auth_user') ? JSON.parse(localStorage.getItem('auth_user')!) : null,
  isAuthenticated: !!localStorage.getItem('auth_token'),
  login: (token: string, user: LoginUserDto) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
    set({ token, user, isAuthenticated: true });
  },
  logout: () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    set({ token: null, user: null, isAuthenticated: false });
  },
}));

