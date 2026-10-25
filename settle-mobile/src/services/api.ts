import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// EXPO_PUBLIC_* vars are inlined by Metro at bundle time.
// Dev override: set EXPO_PUBLIC_API_URL=http://localhost:4025 in settle-mobile/.env
// Production builds fall back to the live API.
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || 'https://api.settleinpeace.com';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('@settle_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
