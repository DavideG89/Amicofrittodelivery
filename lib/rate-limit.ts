type RateLimitConfig = {
  windowMs: number
  max: number
}

type RateLimitResult = {
  allowed: boolean
  remaining: number
  resetAt: number
  headers: Record<string, string>
}

type Bucket = {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

export function createRateLimiter(config: RateLimitConfig) {
  const { windowMs, max } = config

  return (key: string): RateLimitResult => {
    const now = Date.now()
    const bucket = buckets.get(key)

    if (!bucket || now > bucket.resetAt) {
      const resetAt = now + windowMs
      buckets.set(key, { count: 1, resetAt })
      return buildResult(true, max, max - 1, resetAt)
    }

    if (bucket.count >= max) {
      return buildResult(false, max, 0, bucket.resetAt)
    }

    bucket.count += 1
    return buildResult(true, max, max - bucket.count, bucket.resetAt)
  }
}

function buildResult(allowed: boolean, limit: number, remaining: number, resetAt: number): RateLimitResult {
  return {
    allowed,
    remaining,
    resetAt,
    headers: {
      'X-RateLimit-Limit': String(limit),
      'X-RateLimit-Remaining': String(Math.max(remaining, 0)),
      'X-RateLimit-Reset': String(Math.ceil(resetAt / 1000)),
    },
  }
}
