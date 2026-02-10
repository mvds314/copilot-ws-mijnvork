import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// In-memory rate limiter for development (when Upstash is not configured)
class InMemoryRateLimiter {
  private tokens: Map<string, { count: number; resetAt: number }> = new Map();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  async limit(identifier: string): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> {
    const now = Date.now();
    const bucket = this.tokens.get(identifier);

    if (!bucket || now > bucket.resetAt) {
      // New window
      this.tokens.set(identifier, { count: 1, resetAt: now + this.windowMs });
      return {
        success: true,
        limit: this.maxRequests,
        remaining: this.maxRequests - 1,
        reset: now + this.windowMs,
      };
    }

    if (bucket.count >= this.maxRequests) {
      // Rate limit exceeded
      return {
        success: false,
        limit: this.maxRequests,
        remaining: 0,
        reset: bucket.resetAt,
      };
    }

    // Increment count
    bucket.count++;
    this.tokens.set(identifier, bucket);

    return {
      success: true,
      limit: this.maxRequests,
      remaining: this.maxRequests - bucket.count,
      reset: bucket.resetAt,
    };
  }
}

// Rate limiter instance - uses Upstash if configured, otherwise falls back to in-memory
let rateLimiter: Ratelimit | InMemoryRateLimiter;

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  // Production: Use Upstash Redis
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });

  rateLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '1 m'), // 10 requests per minute
    analytics: true,
    prefix: 'ratelimit',
  });
} else {
  // Development: Use in-memory rate limiter
  // NOTE: This is not suitable for production with multiple instances
  rateLimiter = new InMemoryRateLimiter(10, 60 * 1000); // 10 requests per minute
  console.warn('Using in-memory rate limiter. For production, configure Upstash Redis.');
}

export { rateLimiter };
