// Self-hosted cloud-sync servers can be slow to answer /api/config (cold
// starts, large theme payloads, weak hardware). Auto-sync already serializes
// requests, so give them a generous budget instead of failing at 20s.
export const CLOUD_REQUEST_TIMEOUT_MS = 60_000;

export function fetchCloud(
  url: URL,
  init: { method: string; headers: Record<string, string>; body: string | null },
  timeoutMs = CLOUD_REQUEST_TIMEOUT_MS
): Promise<Response> {
  return fetch(url, {
    ...init,
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
  });
}
