/**
 * Shared Registration Normalization Utility
 * Normalizes vehicle registration strings so that variations in hyphens, spaces, letter casing,
 * and leading zeros in numeric segments (e.g., "DL-01-ZE-0259" vs "DL-1-ZE-0259") match consistently.
 */
export function normalizeRegistration(str: string | undefined | null): string {
  if (!str) return '';
  const tokens = str.match(/[a-zA-Z]+|\d+/g);
  if (!tokens) return '';
  return tokens
    .map((token) => {
      if (/^\d+$/.test(token)) {
        return parseInt(token, 10).toString();
      }
      return token.toUpperCase();
    })
    .join('');
}
