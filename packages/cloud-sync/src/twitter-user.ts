export const TWITTER_USER_URL = "https://api.twitter.com/2/users/me";

// The OAuth code is single-use and already spent by the time we look the user
// up, so a transient 429 here would force a full re-login. Retry briefly, but
// never hold the callback open longer than MAX_RETRY_WAIT_MS per attempt.
const MAX_RETRIES = 2;
const MAX_RETRY_WAIT_MS = 5_000;

export type TwitterUserResult =
  | { ok: true; user: Record<string, unknown> & { id: string } }
  | { ok: false; status: number; retryAfterSeconds?: number | undefined };

type Options = {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

/** Seconds until the rate limit lifts, from Retry-After or x-rate-limit-reset. */
export function retryAfterSeconds(headers: Headers, nowMs = Date.now()): number | undefined {
  const retryAfter = headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds));
    const date = Date.parse(retryAfter);
    if (!Number.isNaN(date)) return Math.max(0, Math.ceil((date - nowMs) / 1000));
  }
  const reset = Number(headers.get("x-rate-limit-reset"));
  if (reset > 0) return Math.max(0, Math.ceil(reset - nowMs / 1000));
  return undefined;
}

export async function fetchTwitterUser(
  accessToken: string,
  { fetchImpl = fetch, sleep = Bun.sleep, now = Date.now }: Options = {}
): Promise<TwitterUserResult> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetchImpl(`${TWITTER_USER_URL}?user.fields=profile_image_url`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 429) {
      const wait = retryAfterSeconds(res.headers, now());
      const waitMs = (wait ?? 1) * 1000;
      if (attempt < MAX_RETRIES && waitMs <= MAX_RETRY_WAIT_MS) {
        await sleep(waitMs);
        continue;
      }
      return { ok: false, status: 429, retryAfterSeconds: wait };
    }

    const body = (await res.json().catch(() => null)) as { data?: Record<string, unknown> } | null;
    const user = body?.data;
    if (!res.ok || typeof user?.id !== "string") return { ok: false, status: res.status };
    return { ok: true, user: user as Record<string, unknown> & { id: string } };
  }
}
