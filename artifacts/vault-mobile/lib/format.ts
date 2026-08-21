export function formatMillions(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'On request';
  if (value >= 1_000_000_000) return `\u20AC${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `\u20AC${(value / 1_000_000).toFixed(0)}M`;
  if (value >= 1_000) return `\u20AC${(value / 1_000).toFixed(0)}K`;
  return `\u20AC${value.toFixed(0)}`;
}

/**
 * The API returns web-root-relative image paths (e.g. /deal-images/x.jpg).
 * Native <Image> needs absolute URLs, so resolve them against the app domain.
 */
export function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `https://${process.env.EXPO_PUBLIC_DOMAIN}${url.startsWith('/') ? url : `/${url}`}`;
}

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  return new Date(iso).toLocaleDateString();
}
