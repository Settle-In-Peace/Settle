import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';

const TOKEN_KEY = '@settle_token';
const USER_KEY = '@settle_user';

export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  role?: string;
  phone?: string;
  createdAt?: string;
}

export interface AuthResponse {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  user?: User;
  error?: string;
}

export async function setToken(token: string): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function removeToken(): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_KEY);
  await AsyncStorage.removeItem(USER_KEY);
}

export async function storeUser(user: User): Promise<void> {
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
}

export async function getStoredUser(): Promise<User | null> {
  const userStr = await AsyncStorage.getItem(USER_KEY);
  if (!userStr) return null;
  try {
    return JSON.parse(userStr) as User;
  } catch {
    return null;
  }
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const response = await api.post<AuthResponse>('/auth/login', { email, password });
  const data = response.data;

  if (data.success && data.accessToken) {
    await setToken(data.accessToken);
    if (data.user) {
      await storeUser(data.user);
    }
  }

  return data;
}

export interface RegisterData {
  email: string;
  password: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}

export async function register(data: RegisterData): Promise<AuthResponse> {
  const payload: any = {
    ...data,
  };
  if (data.name && !data.firstName && !data.lastName) {
    payload.firstName = data.name;
  }
  const response = await api.post<AuthResponse>('/auth/register', payload);
  const result = response.data;

  if (result.success && result.accessToken) {
    await setToken(result.accessToken);
    if (result.user) {
      await storeUser(result.user);
    }
  }

  return result;
}

export async function getProfile(token: string): Promise<User> {
  const response = await api.get<User>('/auth/profile', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const user = response.data;
  if (user) {
    await storeUser(user);
  }

  return user;
}

export async function logout(): Promise<void> {
  await removeToken();
}

// Required by Apple App Review guideline 5.1.1(v) and Google Play's
// account-deletion policy: users must be able to delete their account
// from inside the app.
export async function deleteAccount(): Promise<{ success: boolean; message?: string }> {
  const response = await api.delete<{ success: boolean; message?: string }>('/auth/account');
  await removeToken();
  return response.data;
}
