export const TWITTER_USER_URL = "https://api.twitter.com/2/users/me";

// The OAuth code is single-use, so a rate-limited lookup can't simply be retried
// by the browser. Wait out short X rate-limit windows here instead of failing.
const MAX_ATTEMPTS = 3;
const MAX_RETRY_WAIT_MS = 5_000;
const DEFAULT_RETRY_WAIT_MS = 1_000;

export type TwitterUserResult =
  | { ok: true; user: Record<string, unknown> & { id: string } }
  | { ok: false; status: number; retryAfterSeconds?: number };

type Options = {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

function retryWaitMs(res: Response, now: number): number {
  const retryAfter = Number(res.headers.get("retry-after") ?? Number.NaN);
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return retryAfter * 1000;
  // X reports the window reset as epoch seconds
  const reset = Number(res.headers.get("x-rate-limit-reset") ?? Number.NaN);
  if (Number.isFinite(reset) && reset > 0) return Math.max(0, reset * 1000 - now);
  return DEFAULT_RETRY_WAIT_MS;
}

export async function fetchTwitterUser(
  accessToken: string,
  {
    fetch: fetchImpl = fetch,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now = Date.now,
  }: Options = {}
): Promise<TwitterUserResult> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetchImpl(`${TWITTER_USER_URL}?user.fields=profile_image_url`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 429) {
      const waitMs = retryWaitMs(res, now());
      if (attempt < MAX_ATTEMPTS && waitMs <= MAX_RETRY_WAIT_MS) {
        await sleep(waitMs);
        continue;
      }
      return { ok: false, status: 429, retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)) };
    }

    const body = (await res.json().catch(() => null)) as { data?: Record<string, unknown> } | null;
    const user = body?.data;
    if (!res.ok || typeof user?.id !== "string") return { ok: false, status: res.status };
    return { ok: true, user: user as Record<string, unknown> & { id: string } };
  }
}
