import type { RiskAssessment, RiskLevel } from '../types/index.js';

// ============================================================
// Terminal Guardian MCP — Risk Analysis Engine
// ============================================================

interface RiskPattern {
  pattern: RegExp;
  level: RiskLevel;
  reason: string;
  score: number;
}

// Patterns that ALWAYS block execution
const BLOCKED_PATTERNS: RiskPattern[] = [
  // Recursive deletions of system paths
  {
    pattern: /rm\s+.*-[a-z]*r[a-z]*f[a-z]*\s+\/(?:\s|$)/i,
    level: 'BLOCKED',
    reason: 'Recursive force delete of root filesystem',
    score: 100,
  },
  {
    pattern: /rm\s+.*-[a-z]*rf[a-z]*\s+~(?:\s|$)/i,
    level: 'BLOCKED',
    reason: 'Recursive force delete of home directory',
    score: 100,
  },
  // Fork bombs
  {
    pattern: /:\(\)\s*\{.*:\|:.*\}/,
    level: 'BLOCKED',
    reason: 'Fork bomb detected — this will crash the system',
    score: 100,
  },
  { pattern: /\(\)\s*{\s*[|&]/, level: 'BLOCKED', reason: 'Potential fork bomb pattern', score: 100 },
  // System destruction commands
  {
    pattern: /\b(shutdown|reboot|halt|poweroff|init\s+[06])\b/i,
    level: 'BLOCKED',
    reason: 'System shutdown/reboot command is not permitted',
    score: 100,
  },
  {
    pattern: /\bmkfs\b/i,
    level: 'BLOCKED',
    reason: 'Filesystem formatting command could destroy data',
    score: 100,
  },
  {
    pattern: /\bdd\s+.*of=\/dev\//i,
    level: 'BLOCKED',
    reason: 'Writing directly to block device could destroy data',
    score: 100,
  },
  // Root-level chmod
  {
    pattern: /chmod\s+.*777\s+\//,
    level: 'BLOCKED',
    reason: 'chmod 777 on root filesystem is extremely dangerous',
    score: 100,
  },
  // Reverse shells and exfiltration
  {
    pattern: /\bbash\s+-i\s*>&\s*\/dev\/tcp\//i,
    level: 'BLOCKED',
    reason: 'Reverse shell attempt detected',
    score: 100,
  },
  {
    pattern: /\/dev\/tcp\//i,
    level: 'BLOCKED',
    reason: 'Bash TCP redirection (reverse shell vector)',
    score: 100,
  },
  // Cron/scheduled tasks tampering
  {
    pattern: /\bchattr\s+.*\+i\s+\//i,
    level: 'BLOCKED',
    reason: 'Making system files immutable via chattr',
    score: 100,
  },
  // Wipefs / destructive disk tools
  {
    pattern: /\b(wipefs|shred\s+.*\/dev\/|badblocks\s+-w)\b/i,
    level: 'BLOCKED',
    reason: 'Destructive disk operation detected',
    score: 100,
  },
];

// Patterns that are DANGEROUS but might be allowed with explicit override
const DANGEROUS_PATTERNS: RiskPattern[] = [
  {
    pattern: /\bsudo\b/i,
    level: 'DANGEROUS',
    reason: 'sudo escalates privileges and can bypass security controls',
    score: 80,
  },
  {
    pattern: /\bsu\s+-\b/i,
    level: 'DANGEROUS',
    reason: 'Switching to root user',
    score: 80,
  },
  {
    pattern: /\bchmod\s+[0-9]*[67][0-9][0-9]\s/i,
    level: 'DANGEROUS',
    reason: 'Setting world-writable permissions',
    score: 75,
  },
  {
    pattern: /\bchown\s+root\b/i,
    level: 'DANGEROUS',
    reason: 'Changing file ownership to root',
    score: 75,
  },
  {
    pattern: /\b(iptables|ufw|firewalld)\b.*(-F|-D|-X|--flush|--delete)/i,
    level: 'DANGEROUS',
    reason: 'Modifying or flushing firewall rules',
    score: 85,
  },
  {
    pattern: /\bcrontab\s+-[rie]\b/i,
    level: 'DANGEROUS',
    reason: 'Modifying scheduled tasks',
    score: 70,
  },
  {
    pattern: /\bpasswd\b/i,
    level: 'DANGEROUS',
    reason: 'Password modification command',
    score: 70,
  },
  {
    pattern: /\buseradd\b|\buserdel\b|\busermod\b/i,
    level: 'DANGEROUS',
    reason: 'User account management command',
    score: 75,
  },
  {
    pattern: /\bnc\b.*-e\s+.*sh/i,
    level: 'DANGEROUS',
    reason: 'Netcat with shell execution (potential backdoor)',
    score: 90,
  },
  {
    pattern: />\s*\/etc\//i,
    level: 'DANGEROUS',
    reason: 'Writing to /etc/ system configuration directory',
    score: 80,
  },
  {
    pattern: /\bcurl\b.*\|\s*(?:ba)?sh/i,
    level: 'DANGEROUS',
    reason: 'Piping remote script directly to shell (supply chain risk)',
    score: 85,
  },
  {
    pattern: /\bwget\b.*-O\s*-.*\|\s*(?:ba)?sh/i,
    level: 'DANGEROUS',
    reason: 'Piping downloaded script directly to shell',
    score: 85,
  },
];

// Patterns that deserve a WARNING
const WARNING_PATTERNS: RiskPattern[] = [
  {
    pattern: /\brm\s+-[a-z]*r/i,
    level: 'WARNING',
    reason: 'Recursive deletion — verify target path carefully',
    score: 40,
  },
  {
    pattern: /\brm\s+-[a-z]*f/i,
    level: 'WARNING',
    reason: 'Force deletion without confirmation',
    score: 35,
  },
  {
    pattern: /\bdocker\s+(stop|kill|rm|rmi|system\s+prune)\b/i,
    level: 'WARNING',
    reason: 'Docker destructive operation — may affect running services',
    score: 45,
  },
  {
    pattern: /\bdocker\s+exec\b/i,
    level: 'WARNING',
    reason: 'Executing commands inside a container',
    score: 30,
  },
  {
    pattern: /\bnpm\s+(publish|deprecate|unpublish)\b/i,
    level: 'WARNING',
    reason: 'npm publish/deprecate operation — affects public registry',
    score: 50,
  },
  {
    pattern: /\bgit\s+(push|reset\s+--hard|clean\s+-f)\b/i,
    level: 'WARNING',
    reason: 'Destructive or remote-modifying git operation',
    score: 40,
  },
  {
    pattern: /\bkill\s+-9\b/i,
    level: 'WARNING',
    reason: 'SIGKILL — force terminates a process without cleanup',
    score: 35,
  },
  {
    pattern: /\bkillall\b/i,
    level: 'WARNING',
    reason: 'killall terminates all matching processes',
    score: 40,
  },
  {
    pattern: /\bchmod\b/i,
    level: 'WARNING',
    reason: 'Modifying file permissions',
    score: 25,
  },
  {
    pattern: /\bchown\b/i,
    level: 'WARNING',
    reason: 'Modifying file ownership',
    score: 25,
  },
  {
    pattern: /\btruncate\b|\b>\s*[^>]/,
    level: 'WARNING',
    reason: 'File truncation or output redirection may overwrite files',
    score: 20,
  },
  {
    pattern: /\bsystemctl\s+(stop|disable|mask|kill)\b/i,
    level: 'WARNING',
    reason: 'Stopping or disabling a system service',
    score: 45,
  },
  {
    pattern: /\bpip\s+(uninstall|install)\b/i,
    level: 'WARNING',
    reason: 'Package installation/removal can affect system Python environment',
    score: 20,
  },
];

// Commands that are always SAFE regardless of other analysis
const SAFE_ALLOWLIST = [
  /^ls(\s|$)/i,
  /^pwd$/i,
  /^echo\s/i,
  /^cat\s/i,
  /^head\s/i,
  /^tail\s/i,
  /^grep\s/i,
  /^find\s/i,
  /^which\s/i,
  /^whereis\s/i,
  /^whoami$/i,
  /^date$/i,
  /^uname\s/i,
  /^uptime$/i,
  /^df\s/i,
  /^du\s/i,
  /^ps\s/i,
  /^top\s/i,
  /^htop$/i,
  /^git\s+(status|log|diff|branch|show|describe|tag|remote\s+-v|fetch|stash\s+list)(\s|$)/i,
  /^docker\s+(ps|images|info|version|inspect|stats)(\s|$)/i,
  /^npm\s+(list|ls|info|view|outdated|audit)(\s|$)/i,
  /^node\s+--version$/i,
  /^npm\s+--version$/i,
];

export interface AnalyzeOptions {
  customBlocklist?: string[];
  customAllowlist?: string[];
  allowSudo?: boolean;
}

export function analyzeCommand(command: string, options: AnalyzeOptions = {}): RiskAssessment {
  const { customBlocklist = [], customAllowlist = [], allowSudo = false } = options;

  const trimmed = command.trim();

  // Check custom allowlist first
  const customAllowPatterns = customAllowlist.map((p) => new RegExp(p, 'i'));
  if (customAllowPatterns.some((p) => p.test(trimmed))) {
    return buildAssessment('SAFE', 0, ['Command is in custom allowlist'], [], false, false);
  }

  // Check safe allowlist
  if (SAFE_ALLOWLIST.some((p) => p.test(trimmed))) {
    return buildAssessment('SAFE', 0, ['Command is in safe allowlist'], [], false, false);
  }

  // Check custom blocklist
  const customBlockPatterns = customBlocklist.map((p) => new RegExp(p, 'i'));
  const customBlocked = customBlockPatterns.find((p) => p.test(trimmed));
  if (customBlocked) {
    return buildAssessment(
      'BLOCKED',
      100,
      ['Command matches custom blocklist'],
      [customBlocked.source],
      false,
      true,
    );
  }

  // Accumulate risk signals
  const matchedPatterns: string[] = [];
  const reasons: string[] = [];
  let highestScore = 0;
  let highestLevel: RiskLevel = 'SAFE';

  // Check BLOCKED patterns
  for (const rp of BLOCKED_PATTERNS) {
    if (rp.pattern.test(trimmed)) {
      // Exception: if sudo is allowed and pattern is just sudo
      if (allowSudo && rp.pattern.source === /\bsudo\b/i.source) continue;
      matchedPatterns.push(rp.pattern.source);
      reasons.push(rp.reason);
      highestScore = Math.max(highestScore, rp.score);
      highestLevel = 'BLOCKED';
    }
  }

  if (highestLevel === 'BLOCKED') {
    return buildAssessment('BLOCKED', highestScore, reasons, matchedPatterns, false, true);
  }

  // Check DANGEROUS patterns
  for (const rp of DANGEROUS_PATTERNS) {
    if (rp.pattern.test(trimmed)) {
      if (allowSudo && rp.pattern.source === /\bsudo\b/i.source) continue;
      matchedPatterns.push(rp.pattern.source);
      reasons.push(rp.reason);
      highestScore = Math.max(highestScore, rp.score);
      highestLevel = 'DANGEROUS';
    }
  }

  if (highestLevel === 'DANGEROUS') {
    return buildAssessment('DANGEROUS', highestScore, reasons, matchedPatterns, false, true);
  }

  // Check WARNING patterns
  for (const rp of WARNING_PATTERNS) {
    if (rp.pattern.test(trimmed)) {
      matchedPatterns.push(rp.pattern.source);
      reasons.push(rp.reason);
      highestScore = Math.max(highestScore, rp.score);
      if (highestLevel === 'SAFE') highestLevel = 'WARNING';
    }
  }

  if (highestLevel === 'WARNING') {
    return buildAssessment('WARNING', highestScore, reasons, matchedPatterns, true, false);
  }

  // No patterns matched — treat as SAFE with low score
  return buildAssessment('SAFE', 5, ['No dangerous patterns detected'], [], false, false);
}

function buildAssessment(
  level: RiskLevel,
  score: number,
  reasons: string[],
  patterns: string[],
  requiresConfirmation: boolean,
  blocked: boolean,
): RiskAssessment {
  const recommendations: Record<RiskLevel, string> = {
    SAFE: 'Command is safe to execute.',
    WARNING: 'Review this command carefully before proceeding. Requires explicit confirmation.',
    DANGEROUS: 'This command poses serious risks. Execution is blocked by default.',
    BLOCKED: 'This command is unconditionally blocked and cannot be executed.',
  };

  return {
    level,
    score,
    reasons,
    patterns,
    requiresConfirmation,
    blocked,
    recommendation: recommendations[level] ?? 'Unknown risk level.',
  };
}

export function isBlocked(assessment: RiskAssessment): boolean {
  return assessment.blocked || assessment.level === 'BLOCKED' || assessment.level === 'DANGEROUS';
}
