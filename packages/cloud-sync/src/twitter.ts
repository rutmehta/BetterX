export const TWITTER_USER_URL = "https://api.twitter.com/2/users/me";

// Keep the OAuth callback responsive: only wait out short rate-limit windows inline
const MAX_RATE_LIMIT_RETRIES = 2;
const MAX_RATE_LIMIT_WAIT_MS = 5_000;
const DEFAULT_RATE_LIMIT_WAIT_MS = 1_000;

export type TwitterUser = Record<string, unknown> & { id: string };

export type TwitterUserResult =
  | { ok: true; user: TwitterUser }
  | { ok: false; status: number; retryAfterSeconds?: number };

type FetchUserOptions = {
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

// X sends `x-rate-limit-reset` (epoch seconds); fall back to standard `retry-after`
export function rateLimitWaitMs(headers: Headers, now = Date.now()): number | undefined {
  const reset = Number(headers.get("x-rate-limit-reset"));
  if (headers.get("x-rate-limit-reset") && Number.isFinite(reset)) {
    return Math.max(0, reset * 1000 - now);
  }
  const retryAfter = headers.get("retry-after");
  if (!retryAfter) return undefined;
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(retryAfter);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

export async function fetchTwitterUser(
  accessToken: string,
  {
    fetchImpl = fetch,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now = Date.now,
  }: FetchUserOptions = {}
): Promise<TwitterUserResult> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetchImpl(`${TWITTER_USER_URL}?user.fields=profile_image_url`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 429) {
      const waitMs = rateLimitWaitMs(res.headers, now());
      const delay = waitMs ?? DEFAULT_RATE_LIMIT_WAIT_MS;
      if (attempt < MAX_RATE_LIMIT_RETRIES && delay <= MAX_RATE_LIMIT_WAIT_MS) {
        await sleep(delay);
        continue;
      }
      return {
        ok: false,
        status: 429,
        retryAfterSeconds: Math.max(1, Math.ceil(delay / 1000)),
      };
    }

    const body = (await res.json().catch(() => null)) as { data?: Record<string, unknown> } | null;
    const user = body?.data;
    if (!res.ok || typeof user?.id !== "string") return { ok: false, status: res.status };
    return { ok: true, user: user as TwitterUser };
  }
}
