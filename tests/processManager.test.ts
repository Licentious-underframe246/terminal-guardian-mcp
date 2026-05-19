import { describe, it, expect } from 'vitest';
import { listProcesses, killProcess } from '../src/tools/processManager.js';

describe('ProcessManager', () => {
  describe('listProcesses', () => {
    it('should return a non-empty list', () => {
      const procs = listProcesses();
      expect(procs.length).toBeGreaterThan(0);
    });

    it('should respect limit', () => {
      const procs = listProcesses({ limit: 5 });
      expect(procs.length).toBeLessThanOrEqual(5);
    });

    it('should filter by name', () => {
      const procs = listProcesses({ filter: 'node' });
      // May or may not have node processes, but should not throw
      expect(Array.isArray(procs)).toBe(true);
    });

    it('should return valid ProcessInfo objects', () => {
      const procs = listProcesses({ limit: 3 });
      for (const p of procs) {
        expect(p.pid).toBeGreaterThan(0);
        expect(typeof p.name).toBe('string');
        expect(typeof p.cpu).toBe('number');
        expect(typeof p.memory).toBe('number');
      }
    });

    it('should sort by memory', () => {
      const procs = listProcesses({ sortBy: 'memory', limit: 10 });
      for (let i = 1; i < procs.length; i++) {
        expect(procs[i - 1]!.memory).toBeGreaterThanOrEqual(procs[i]!.memory);
      }
    });

    it('should sort by pid', () => {
      const procs = listProcesses({ sortBy: 'pid', limit: 10 });
      for (let i = 1; i < procs.length; i++) {
        expect(procs[i - 1]!.pid).toBeLessThanOrEqual(procs[i]!.pid);
      }
    });
  });

  describe('killProcess', () => {
    it('should refuse to kill PID 1 (init/systemd)', () => {
      const result = killProcess(1, 'SIGTERM');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/protected/i);
    });

    it('should refuse to kill PID 0', () => {
      const result = killProcess(0, 'SIGTERM');
      expect(result.success).toBe(false);
    });

    it('should refuse to kill own process', () => {
      const result = killProcess(process.pid, 'SIGTERM');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/protected/i);
    });

    it('should fail gracefully for non-existent PID', () => {
      // PID 9999999 very likely does not exist
      const result = killProcess(9999999, 'SIGTERM');
      expect(result.success).toBe(false);
      expect(typeof result.error).toBe('string');
    });

    it('should return correct structure', () => {
      const result = killProcess(9999999, 'SIGTERM');
      expect(result).toMatchObject({
        pid: 9999999,
        signal: 'SIGTERM',
        success: expect.any(Boolean),
      });
    });
  });
});