/** Bounds a fetch with AbortController — without this, a slow/unreachable upstream (this hit OpenSky's auth endpoint in practice) hangs the whole function for minutes before Supabase's own platform timeout ever kicks in. */
export function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}
