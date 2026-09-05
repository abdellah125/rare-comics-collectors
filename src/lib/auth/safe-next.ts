/**
 * Only ever redirect to a local path. Rejects protocol-relative URLs (//host),
 * backslash variants that browsers normalise to //, control characters and
 * anything carrying a scheme.
 */
export function safeLocalPath(next: unknown, fallback: string): string {
  if (typeof next !== "string") return fallback;
  const value = next.trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\") || /[\\\r\n]/.test(value) || value.includes("://")) return fallback;
  return value;
}
