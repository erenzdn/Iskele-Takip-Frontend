import { create } from 'zustand';
import { LoginUserDto } from '../models';

interface AuthState {
  token: string | null;
  user: LoginUserDto | null;
  isAuthenticated: boolean;
  login: (token: string, user: LoginUserDto) => void;
  logout: () => void;
}

function isValidPersistedUser(value: unknown): value is LoginUserDto {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  const hasValidUserId =
    typeof candidate.userId === 'number' ||
    typeof candidate.userId === 'string';
  const hasValidUsername = typeof candidate.username === 'string';
  return hasValidUserId && hasValidUsername;
}

function readPersistedAuth(): { token: string | null; user: LoginUserDto | null } {
  let token = localStorage.getItem('auth_token');
  let user: LoginUserDto | null = null;

  const rawUser = localStorage.getItem('auth_user');
  if (rawUser) {
    try {
      const parsed = JSON.parse(rawUser) as Record<string, unknown>;
      if (parsed.UserId !== undefined) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        token = null;
        user = null;
      } else if (!isValidPersistedUser(parsed)) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        token = null;
        user = null;
      } else {
        user = parsed as unknown as LoginUserDto;
      }
    } catch {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      token = null;
      user = null;
    }
  }

  if (!token || !user) {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    return { token: null, user: null };
  }

  return { token, user };
}

const { token: initialToken, user: initialUser } = readPersistedAuth();

export const useAuthStore = create<AuthState>((set) => ({
  token: initialToken,
  user: initialUser,
  isAuthenticated: !!initialToken && !!initialUser,
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
