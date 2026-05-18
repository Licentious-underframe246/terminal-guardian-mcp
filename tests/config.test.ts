import { describe, it, expect } from 'vitest';
import { loadConfig, DEFAULT_CONFIG } from '../src/config/loader.js';

describe('ConfigLoader', () => {
  it('should return default config when no file exists', () => {
    const config = loadConfig('/nonexistent/path/terminal-guardian.config.json');
    expect(config).toHaveProperty('workspace');
  });

  it('should have correct default values', () => {
    const config = DEFAULT_CONFIG;
    expect(config.execution.timeout).toBe(30_000);
    expect(config.security.blockDangerousCommands).toBe(true);
    expect(config.security.allowSudo).toBe(false);
    expect(config.security.requireConfirmationForWarnings).toBe(true);
    expect(config.rateLimit.enabled).toBe(true);
    expect(config.docker.enabled).toBe(false);
    expect(config.git.enabled).toBe(true);
    expect(config.logging.enabled).toBe(true);
  });

  it('should have non-empty allowed paths', () => {
    expect(DEFAULT_CONFIG.workspace.allowedPaths.length).toBeGreaterThan(0);
  });

  it('should have reasonable rate limits', () => {
    expect(DEFAULT_CONFIG.rateLimit.maxRequestsPerMinute).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.rateLimit.maxRequestsPerHour).toBeGreaterThan(
      DEFAULT_CONFIG.rateLimit.maxRequestsPerMinute,
    );
  });
});
