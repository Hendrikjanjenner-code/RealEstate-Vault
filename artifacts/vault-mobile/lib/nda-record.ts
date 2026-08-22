import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { tokenStorage } from '@/lib/auth-token';

function getApiBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_DOMAIN) {
    return `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
  }
  return '';
}

/**
 * Fetches the signed NDA record (a self-contained HTML page) for an access
 * request using bearer-token auth, then opens it: on web in a new tab, on
 * native via the share sheet (view, save, or send the file).
 */
export async function openSignedNdaRecord(requestId: number): Promise<void> {
  const token = await tokenStorage.get();
  const res = await fetch(
    `${getApiBaseUrl()}/api/access-requests/${requestId}/nda-record`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      credentials: 'include',
    },
  );
  if (!res.ok) {
    throw new Error(`Failed to load NDA record (${res.status})`);
  }
  const html = await res.text();

  if (Platform.OS === 'web') {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    // Give the new tab time to load before revoking.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }

  const file = new File(Paths.cache, `nda-record-${requestId}.html`);
  if (file.exists) file.delete();
  file.write(html);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/html',
      dialogTitle: 'Signed NDA Record',
      UTI: 'public.html',
    });
  } else {
    throw new Error('Sharing is not available on this device');
  }
}
