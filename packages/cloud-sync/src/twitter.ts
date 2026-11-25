export const TWITTER_USER_URL = "https://api.twitter.com/2/users/me";

// Longest we'll hold the OAuth callback open waiting for X's rate-limit window to reset
const MAX_RATE_LIMIT_WAIT_MS = 5_000;
const DEFAULT_RATE_LIMIT_WAIT_MS = 1_000;

export type TwitterUser = Record<string, unknown> & { id: string };

export type TwitterUserResult =
  | { ok: true; user: TwitterUser }
  | { ok: false; status: number; retryAfterSeconds?: number };

type FetchTwitterUserOptions = {
  fetch?: (input: string, init?: RequestInit) => Promise<Response>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

// X sends Retry-After (seconds) or x-rate-limit-reset (epoch seconds) on 429s
export function rateLimitWaitMs(res: Response, now: number): number | undefined {
  const retryAfterHeader = res.headers.get("retry-after");
  const retryAfter = retryAfterHeader === null ? Number.NaN : Number(retryAfterHeader);
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return retryAfter * 1000;
  const reset = Number(res.headers.get("x-rate-limit-reset"));
  if (Number.isFinite(reset) && reset > 0) return Math.max(0, reset * 1000 - now);
  return undefined;
}

export async function fetchTwitterUser(
  accessToken: string,
  options: FetchTwitterUserOptions = {}
): Promise<TwitterUserResult> {
  const doFetch = options.fetch ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const now = options.now ?? Date.now;

  const request = () =>
    doFetch(`${TWITTER_USER_URL}?user.fields=profile_image_url`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

  let res = await request();
  if (res.status === 429) {
    const waitMs = rateLimitWaitMs(res, now()) ?? DEFAULT_RATE_LIMIT_WAIT_MS;
    if (waitMs <= MAX_RATE_LIMIT_WAIT_MS) {
      await res.body?.cancel();
      await sleep(waitMs);
      res = await request();
    }
  }

  const body = (await res.json().catch(() => ({}))) as { data?: Record<string, unknown> };
  const user = body.data;
  if (res.ok && typeof user?.id === "string") return { ok: true, user: user as TwitterUser };

  const waitMs = res.status === 429 ? rateLimitWaitMs(res, now()) : undefined;
  return {
    ok: false,
    status: res.status,
    ...(waitMs !== undefined && { retryAfterSeconds: Math.ceil(waitMs / 1000) }),
  };
}
