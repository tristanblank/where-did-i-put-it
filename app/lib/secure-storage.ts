import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Storage adapter for supabase-js's auth session.
//
// The session holds a long-lived refresh token — the thing that mints new
// access tokens indefinitely without re-authenticating. In AsyncStorage
// that sits in plaintext in the app's sandbox: readable on a rooted or
// jailbroken device, and on Android it can ride along into a cloud backup.
// SecureStore puts it in the iOS Keychain / Android Keystore instead.
//
// SecureStore caps a value at 2048 *bytes* and a Supabase session runs
// well past that, so values are chunked. 512 chars is the chunk size
// because UTF-8 tops out at 4 bytes per char — that's the only size that
// stays under the cap without having to reason about what's in the
// session. It costs a handful of extra keychain reads, which are fast.

const CHUNK_CHARS = 512;

// expo-secure-store is native-only; on web it throws on import-time use.
// The web build is a dev convenience here, not a shipped surface, so it
// falls back rather than trying to do something clever with localStorage.
const isWeb = Platform.OS === 'web';

const chunkKey = (key: string, i: number) => `${key}.${i}`;

async function readChunkCount(key: string): Promise<number | null> {
  const raw = await SecureStore.getItemAsync(key);
  if (raw === null) return null;
  const count = Number(raw);
  return Number.isInteger(count) && count >= 0 ? count : null;
}

async function removeChunked(key: string) {
  const count = await readChunkCount(key);
  await SecureStore.deleteItemAsync(key);
  if (count === null) return;
  for (let i = 0; i < count; i++) {
    await SecureStore.deleteItemAsync(chunkKey(key, i));
  }
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    if (isWeb) return AsyncStorage.getItem(key);

    const count = await readChunkCount(key);

    // No manifest. Either nothing was ever stored, or this is a session
    // written by the pre-SecureStore build — carry that one over rather
    // than silently signing the user out on upgrade.
    if (count === null) {
      const legacy = await AsyncStorage.getItem(key);
      if (legacy === null) return null;
      await this.setItem(key, legacy);
      await AsyncStorage.removeItem(key);
      return legacy;
    }

    const parts = await Promise.all(
      Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(chunkKey(key, i)))
    );

    // A manifest with a chunk missing under it means a write was torn
    // apart partway through. There's no partial session worth salvaging,
    // so drop it and let the user sign in again.
    if (parts.some((p) => p === null)) {
      await removeChunked(key);
      return null;
    }

    return parts.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    if (isWeb) return AsyncStorage.setItem(key, value);

    await removeChunked(key);

    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_CHARS) {
      chunks.push(value.slice(i, i + CHUNK_CHARS));
    }

    for (let i = 0; i < chunks.length; i++) {
      await SecureStore.setItemAsync(chunkKey(key, i), chunks[i]);
    }
    // Manifest last, so it's the commit point: a crash mid-write leaves
    // orphaned chunks and no manifest, which reads back as "nothing
    // stored" rather than as a half a session.
    await SecureStore.setItemAsync(key, String(chunks.length));
  },

  async removeItem(key: string): Promise<void> {
    if (isWeb) return AsyncStorage.removeItem(key);
    await removeChunked(key);
  },
};
