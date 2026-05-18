import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiter } from '../src/security/rateLimiter.js';

describe('RateLimiter', () => {
  describe('disabled mode', () => {
    it('should always allow requests when disabled', () => {
      const limiter = new RateLimiter({
        enabled: false,
        maxRequestsPerMinute: 1,
        maxRequestsPerHour: 1,
      });

      for (let i = 0; i < 10; i++) {
        expect(limiter.check().allowed).toBe(true);
      }
    });
  });

  describe('minute limit', () => {
    it('should block after exceeding minute limit', () => {
      const limiter = new RateLimiter({
        enabled: true,
        maxRequestsPerMinute: 3,
        maxRequestsPerHour: 1000,
      });

      expect(limiter.check().allowed).toBe(true);
      expect(limiter.check().allowed).toBe(true);
      expect(limiter.check().allowed).toBe(true);
      const blocked = limiter.check();
      expect(blocked.allowed).toBe(false);
      expect(blocked.reason).toContain('per minute');
      expect(blocked.retryAfter).toBeGreaterThan(0);
    });
  });

  describe('hour limit', () => {
    it('should block after exceeding hour limit', () => {
      const limiter = new RateLimiter({
        enabled: true,
        maxRequestsPerMinute: 1000,
        maxRequestsPerHour: 3,
      });

      expect(limiter.check().allowed).toBe(true);
      expect(limiter.check().allowed).toBe(true);
      expect(limiter.check().allowed).toBe(true);
      const blocked = limiter.check();
      expect(blocked.allowed).toBe(false);
      expect(blocked.reason).toContain('per hour');
    });
  });

  describe('status reporting', () => {
    it('should report accurate usage', () => {
      const limiter = new RateLimiter({
        enabled: true,
        maxRequestsPerMinute: 10,
        maxRequestsPerHour: 100,
      });

      limiter.check();
      limiter.check();
      const status = limiter.getStatus();
      expect(status.minuteUsage).toBe(2);
      expect(status.minuteLimit).toBe(10);
      expect(status.hourUsage).toBe(2);
      expect(status.hourLimit).toBe(100);
      expect(status.minuteResetsIn).toBeGreaterThan(0);
      expect(status.hourResetsIn).toBeGreaterThan(0);
    });
  });
});
