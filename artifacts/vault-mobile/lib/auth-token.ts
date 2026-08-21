import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export const AUTH_TOKEN_KEY = 'auth_session_token';

/**
 * Session token storage: SecureStore on native, localStorage on web
 * (SecureStore is unavailable in Expo web builds).
 */
export const tokenStorage = {
  async get(): Promise<string | null> {
    if (Platform.OS === 'web') {
      try {
        return globalThis.localStorage?.getItem(AUTH_TOKEN_KEY) ?? null;
      } catch {
        return null;
      }
    }
    return SecureStore.getItemAsync(AUTH_TOKEN_KEY);
  },
  async set(value: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        globalThis.localStorage?.setItem(AUTH_TOKEN_KEY, value);
      } catch {}
      return;
    }
    await SecureStore.setItemAsync(AUTH_TOKEN_KEY, value);
  },
  async remove(): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        globalThis.localStorage?.removeItem(AUTH_TOKEN_KEY);
      } catch {}
      return;
    }
    await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
  },
};
