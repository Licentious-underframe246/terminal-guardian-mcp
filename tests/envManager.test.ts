import { describe, it, expect, beforeAll } from 'vitest';
import { EnvManager } from '../src/system/envManager.js';

describe('EnvManager', () => {
  let manager: EnvManager;

  beforeAll(() => {
    manager = new EnvManager();
    // Plant test vars in process.env
    process.env['TEST_PLAIN_VAR'] = 'hello_world';
    process.env['TEST_API_KEY'] = 'sk-test-supersecretvalue12345';
    process.env['TEST_DATABASE_URL'] = 'postgres://user:pass@localhost/db';
    process.env['TEST_JWT_TOKEN'] = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
  });

  describe('getVariables', () => {
    it('should return variables', () => {
      const result = manager.getVariables();
      expect(result.total).toBeGreaterThan(0);
      expect(Array.isArray(result.variables)).toBe(true);
    });

    it('should mask API key values', () => {
      const result = manager.getVariables({ keys: ['TEST_API_KEY'] });
      const v = result.variables.find((x) => x.key === 'TEST_API_KEY');
      expect(v).toBeDefined();
      expect(v!.masked).toBe(true);
      expect(v!.value).not.toBe('sk-test-supersecretvalue12345');
      expect(v!.value).toContain('*');
    });

    it('should mask DATABASE_URL', () => {
      const result = manager.getVariables({ keys: ['TEST_DATABASE_URL'] });
      const v = result.variables.find((x) => x.key === 'TEST_DATABASE_URL');
      expect(v!.masked).toBe(true);
    });

    it('should mask JWT token', () => {
      const result = manager.getVariables({ keys: ['TEST_JWT_TOKEN'] });
      const v = result.variables.find((x) => x.key === 'TEST_JWT_TOKEN');
      expect(v!.masked).toBe(true);
    });

    it('should NOT mask plain variables', () => {
      const result = manager.getVariables({ keys: ['TEST_PLAIN_VAR'] });
      const v = result.variables.find((x) => x.key === 'TEST_PLAIN_VAR');
      expect(v).toBeDefined();
      expect(v!.masked).toBe(false);
      expect(v!.value).toBe('hello_world');
    });

    it('should filter by key name substring', () => {
      const result = manager.getVariables({ filter: 'TEST_' });
      expect(result.variables.every((v) => v.key.includes('TEST_'))).toBe(true);
    });

    it('should count masked vs visible correctly', () => {
      const result = manager.getVariables({ keys: ['TEST_PLAIN_VAR', 'TEST_API_KEY'] });
      expect(result.masked).toBe(1);
      expect(result.visible).toBe(1);
      expect(result.total).toBe(2);
    });

    it('should exclude masked vars when includeMasked=false', () => {
      const result = manager.getVariables({ filter: 'TEST_', includeMasked: false });
      expect(result.variables.every((v) => !v.masked)).toBe(true);
    });

    it('should return category stats', () => {
      const result = manager.getVariables();
      expect(result.categories).toHaveProperty('secret');
      expect(result.categories).toHaveProperty('system');
      expect(result.categories).toHaveProperty('unknown');
    });
  });

  describe('getSingle', () => {
    it('should return a single variable', () => {
      const v = manager.getSingle('TEST_PLAIN_VAR');
      expect(v).not.toBeNull();
      expect(v!.key).toBe('TEST_PLAIN_VAR');
      expect(v!.value).toBe('hello_world');
    });

    it('should return null for non-existent key', () => {
      const v = manager.getSingle('THIS_KEY_DOES_NOT_EXIST_XYZ');
      expect(v).toBeNull();
    });

    it('should mask secret single variable', () => {
      const v = manager.getSingle('TEST_API_KEY');
      expect(v!.masked).toBe(true);
      expect(v!.value).not.toBe('sk-test-supersecretvalue12345');
    });
  });

  describe('hasKey', () => {
    it('should detect existing key', () => {
      expect(manager.hasKey('TEST_PLAIN_VAR')).toBe(true);
    });

    it('should return false for missing key', () => {
      expect(manager.hasKey('DEFINITELY_NOT_SET_XYZ_123')).toBe(false);
    });
  });

  describe('masked value format', () => {
    it('should show partial value (not full stars)', () => {
      const v = manager.getSingle('TEST_API_KEY');
      // Should have some visible chars at start/end
      expect(v!.value).toMatch(/^.{2}\*+.{2}$/);
    });

    it('should mask very short values with ****', () => {
      process.env['TEST_SHORT_SECRET_TOKEN'] = 'ab';
      const v = manager.getSingle('TEST_SHORT_SECRET_TOKEN');
      expect(v!.masked).toBe(true);
      expect(v!.value).toBe('****');
      delete process.env['TEST_SHORT_SECRET_TOKEN'];
    });
  });
});