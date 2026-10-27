/**
 * Rate limiter for dhaka.nonarkara.org API.
 * Uses native Cloudflare Workers Rate Limiting when available, with in-isolate fallback.
 */

export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface RateLimitEnv {
  RATE_LIMITER?: RateLimitBinding;
}

export interface RateLimitOptions {
  limit: number;
  windowSeconds: number;
  scope: string;
}

export interface RateLimitVerdict {
  allowed: boolean;
  retryAfter: number;
  mode: "native" | "isolate";
}

const counters = new Map<string, { count: number; resetAt: number }>();
const MAX_KEYS = 4096;

function clientKey(request: Request, scope: string): string {
  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  return `${scope}:${ip}`;
}

export async function checkRateLimit(
  request: Request,
  env: RateLimitEnv | undefined,
  options: RateLimitOptions,
): Promise<RateLimitVerdict> {
  const key = clientKey(request, options.scope);

  if (env && env.RATE_LIMITER && typeof env.RATE_LIMITER.limit === "function") {
    try {
      const result = await env.RATE_LIMITER.limit({ key });
      if (result && result.success === false) {
        return { allowed: false, retryAfter: options.windowSeconds, mode: "native" };
      }
      return { allowed: true, retryAfter: 0, mode: "native" };
    } catch {
      return { allowed: true, retryAfter: 0, mode: "native" };
    }
  }

  const now = Date.now();
  const windowMs = options.windowSeconds * 1000;
  const existing = counters.get(key);
  if (!existing || existing.resetAt <= now) {
    if (counters.size >= MAX_KEYS) {
      for (const [k, v] of counters) if (v.resetAt <= now) counters.delete(k);
      if (counters.size >= MAX_KEYS) counters.clear();
    }
    counters.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0, mode: "isolate" };
  }
  existing.count += 1;
  if (existing.count > options.limit) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      mode: "isolate",
    };
  }
  return { allowed: true, retryAfter: 0, mode: "isolate" };
}

export function rateLimitStateForTest(): { size: number } {
  return { size: counters.size };
}

export function resetRateLimitStateForTest(): void {
  counters.clear();
}
