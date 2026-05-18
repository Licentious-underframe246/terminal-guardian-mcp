import type { GuardianConfig } from '../types/index.js';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private minuteBucket: RateLimitBucket;
  private hourBucket: RateLimitBucket;
  private readonly maxPerMinute: number;
  private readonly maxPerHour: number;
  private readonly enabled: boolean;

  constructor(config: GuardianConfig['rateLimit']) {
    this.enabled = config.enabled;
    this.maxPerMinute = config.maxRequestsPerMinute;
    this.maxPerHour = config.maxRequestsPerHour;

    const now = Date.now();
    this.minuteBucket = { count: 0, resetAt: now + 60_000 };
    this.hourBucket = { count: 0, resetAt: now + 3_600_000 };
  }

  check(): { allowed: boolean; reason?: string; retryAfter?: number } {
    if (!this.enabled) return { allowed: true };

    const now = Date.now();

    // Reset buckets if expired
    if (now >= this.minuteBucket.resetAt) {
      this.minuteBucket = { count: 0, resetAt: now + 60_000 };
    }
    if (now >= this.hourBucket.resetAt) {
      this.hourBucket = { count: 0, resetAt: now + 3_600_000 };
    }

    if (this.minuteBucket.count >= this.maxPerMinute) {
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${this.maxPerMinute} requests per minute`,
        retryAfter: Math.ceil((this.minuteBucket.resetAt - now) / 1000),
      };
    }

    if (this.hourBucket.count >= this.maxPerHour) {
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${this.maxPerHour} requests per hour`,
        retryAfter: Math.ceil((this.hourBucket.resetAt - now) / 1000),
      };
    }

    this.minuteBucket.count++;
    this.hourBucket.count++;
    return { allowed: true };
  }

  getStatus(): {
    minuteUsage: number;
    minuteLimit: number;
    minuteResetsIn: number;
    hourUsage: number;
    hourLimit: number;
    hourResetsIn: number;
  } {
    const now = Date.now();
    return {
      minuteUsage: this.minuteBucket.count,
      minuteLimit: this.maxPerMinute,
      minuteResetsIn: Math.max(0, Math.ceil((this.minuteBucket.resetAt - now) / 1000)),
      hourUsage: this.hourBucket.count,
      hourLimit: this.maxPerHour,
      hourResetsIn: Math.max(0, Math.ceil((this.hourBucket.resetAt - now) / 1000)),
    };
  }
}
