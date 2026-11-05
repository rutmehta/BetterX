export const TWITTER_USER_URL = "https://api.twitter.com/2/users/me";

// The OAuth code is single-use, so failing the user lookup forces a full re-login.
// Ride out short 429s here instead of surfacing them immediately.
const MAX_ATTEMPTS = 3;
const MAX_RATE_LIMIT_WAIT_MS = 5_000;
const DEFAULT_RATE_LIMIT_WAIT_MS = 1_000;

export type TwitterUser = {
  id: string;
  username?: unknown;
  profile_image_url?: unknown;
};

export type TwitterUserResult =
  | { ok: true; user: TwitterUser }
  | { ok: false; status: number; retryAfterSeconds?: number };

type FetchTwitterUserOptions = {
  fetch?: (input: string, init?: RequestInit) => Promise<Response>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

// Retry-After (seconds) or x-rate-limit-reset (epoch seconds), whichever X sent
export function rateLimitWaitMs(res: Response, now: number): number | null {
  const retryAfter = Number(res.headers.get("retry-after"));
  if (res.headers.has("retry-after") && Number.isFinite(retryAfter) && retryAfter >= 0) {
    return retryAfter * 1000;
  }
  const reset = Number(res.headers.get("x-rate-limit-reset"));
  if (res.headers.has("x-rate-limit-reset") && Number.isFinite(reset)) {
    return Math.max(0, reset * 1000 - now);
  }
  return null;
}

export async function fetchTwitterUser(
  accessToken: string,
  options: FetchTwitterUserOptions = {}
): Promise<TwitterUserResult> {
  const doFetch = options.fetch ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const now = options.now ?? Date.now;

  for (let attempt = 1; ; attempt++) {
    const res = await doFetch(`${TWITTER_USER_URL}?user.fields=profile_image_url`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 429) {
      const waitMs = rateLimitWaitMs(res, now()) ?? DEFAULT_RATE_LIMIT_WAIT_MS * attempt;
      if (attempt >= MAX_ATTEMPTS || waitMs > MAX_RATE_LIMIT_WAIT_MS) {
        return { ok: false, status: 429, retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)) };
      }
      await sleep(waitMs);
      continue;
    }

    const body = (await res.json().catch(() => null)) as { data?: Record<string, unknown> } | null;
    const user = body?.data;
    if (!res.ok || typeof user?.id !== "string") return { ok: false, status: res.status };
    return { ok: true, user: user as TwitterUser };
  }
}
