import { twMerge } from 'tailwind-merge';

import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMillions(value: number | null | undefined, currency = "EUR"): string {
  if (value == null) return "POA";
  const symbol = currency === "EUR" ? "€" : `${currency} `;
  if (value >= 1_000_000_000) return `${symbol}${(value / 1_000_000_000).toFixed(2)}B`;
  return `${symbol}${(value / 1_000_000).toFixed(1)}M`;
}
