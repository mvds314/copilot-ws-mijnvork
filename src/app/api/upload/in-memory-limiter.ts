/**
 * Simple in-memory rate limiter for development/fallback
 * Used when Upstash Redis is not configured
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export class InMemoryRateLimiter {
  private store: Map<string, RateLimitEntry> = new Map();
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;

    // Clean up expired entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.resetTime < now) {
        this.store.delete(key);
      }
    }
  }

  async limit(identifier: string): Promise<{
    success: boolean;
    limit: number;
    reset: number;
    remaining: number;
  }> {
    const now = Date.now();
    const entry = this.store.get(identifier);

    // No entry or expired entry
    if (!entry || entry.resetTime < now) {
      const resetTime = now + this.windowMs;
      this.store.set(identifier, {
        count: 1,
        resetTime,
      });
      return {
        success: true,
        limit: this.maxRequests,
        reset: resetTime,
        remaining: this.maxRequests - 1,
      };
    }

    // Entry exists and is valid
    if (entry.count >= this.maxRequests) {
      return {
        success: false,
        limit: this.maxRequests,
        reset: entry.resetTime,
        remaining: 0,
      };
    }

    // Increment count
    entry.count++;
    this.store.set(identifier, entry);

    return {
      success: true,
      limit: this.maxRequests,
      reset: entry.resetTime,
      remaining: this.maxRequests - entry.count,
    };
  }
}
