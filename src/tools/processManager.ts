// ============================================================
// Terminal Guardian MCP — Process Manager
// Cross-platform process listing and termination
// ============================================================

import { execSync } from 'child_process';

export interface ProcessInfo {
  pid: number;
  ppid: number;
  name: string;
  command: string;
  cpu: number;   
  memory: number; 
  status: string;
  user: string;
  started: string;
}

export interface KillResult {
  pid: number;
  signal: string;
  success: boolean;
  error?: string | undefined;
}

const IS_WINDOWS = process.platform === 'win32';

// ── Listing ───────────────────────────────────────────────────

function listUnix(filter?: string): ProcessInfo[] {
  const raw = execSync(
    'ps aux --no-headers 2>/dev/null || ps aux',
    { encoding: 'utf-8', timeout: 8000 },
  ).trim();

  return raw
    .split('\n')
    .filter(Boolean)
    .map((line): ProcessInfo | null => {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 11) return null;

      const user    = parts[0] ?? '';
      const pid     = parseInt(parts[1] ?? '0', 10);
      const cpu     = parseFloat(parts[2] ?? '0');
      const rssKb   = parseInt(parts[5] ?? '0', 10);
      const stat    = parts[7] ?? '';
      const started = parts[8] ?? '';
      const command = parts.slice(10).join(' ');
      const name    = command.split('/').pop()?.split(' ')[0] ?? command.slice(0, 32);

      return { pid, ppid: 0, name, command, cpu, memory: rssKb * 1024, status: stat, user, started };
    })
    .filter((p): p is ProcessInfo => p !== null && !isNaN(p.pid) && p.pid > 0)
    .filter((p) => !filter || p.name.toLowerCase().includes(filter.toLowerCase()) || p.command.toLowerCase().includes(filter.toLowerCase()));
}

function listWindows(filter?: string): ProcessInfo[] {
  const raw = execSync(
    'tasklist /fo csv /nh',
    { encoding: 'utf-8', timeout: 8000 },
  ).trim();

  return raw
    .split('\n')
    .filter(Boolean)
    .map((line): ProcessInfo | null => {
      const cols = line.replace(/\r/g, '').split('","').map((c) => c.replace(/^"|"$/g, ''));
      if (cols.length < 5) return null;

      const name    = cols[0] ?? '';
      const pid     = parseInt(cols[1] ?? '0', 10);
      const memStr  = (cols[4] ?? '0').replace(/[^0-9]/g, '');
      const memKb   = parseInt(memStr, 10);

      return { pid, ppid: 0, name, command: name, cpu: 0, memory: memKb * 1024, status: 'running', user: '', started: '' };
    })
    .filter((p): p is ProcessInfo => p !== null && !isNaN(p.pid) && p.pid > 0)
    .filter((p) => !filter || p.name.toLowerCase().includes(filter.toLowerCase()));
}

export function listProcesses(options: {
  filter?: string | undefined;
  sortBy?: 'cpu' | 'memory' | 'pid' | 'name';
  limit?: number;
} = {}): ProcessInfo[] {
  const { filter, sortBy = 'cpu', limit = 50 } = options;

  let procs: ProcessInfo[];
  try {
    procs = IS_WINDOWS ? listWindows(filter) : listUnix(filter);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to list processes: ${msg}`);
  }

  procs.sort((a, b) => {
    switch (sortBy) {
      case 'cpu':    return b.cpu - a.cpu;
      case 'memory': return b.memory - a.memory;
      case 'pid':    return a.pid - b.pid;
      case 'name':   return a.name.localeCompare(b.name);
    }
  });

  return procs.slice(0, limit);
}

// ── Kill ──────────────────────────────────────────────────────

export type KillSignal = 'SIGTERM' | 'SIGKILL' | 'SIGINT' | 'SIGHUP';

const PROTECTED_PIDS = new Set([0, 1, 2]);

const PROTECTED_NAMES = [
  'systemd', 'init', 'kernel', 'kthreadd', 'launchd',
  'winlogon', 'csrss', 'smss', 'wininit', 'services',
  'lsass', 'svchost',
];

function isProtected(pid: number): boolean {
  if (PROTECTED_PIDS.has(pid)) return true;
  if (pid === process.pid) return true;

  try {
    const procs = IS_WINDOWS ? listWindows() : listUnix();
    const target = procs.find((p) => p.pid === pid);
    if (target) {
      const nameLower = target.name.toLowerCase();
      if (PROTECTED_NAMES.some((n) => nameLower.includes(n))) return true;
      if (!IS_WINDOWS && target.user === 'root' && process.getuid?.() !== 0) return true;
    }
  } catch {
    // If we can't check, be safe
  }

  return false;
}

export function killProcess(pid: number, signal: KillSignal = 'SIGTERM'): KillResult {
  if (isProtected(pid)) {
    return {
      pid,
      signal,
      success: false,
      error: `PID ${pid} is a protected system process and cannot be killed`,
    };
  }

  try {
    if (IS_WINDOWS) {
      const flag = signal === 'SIGKILL' ? '/f' : '';
      execSync(`taskkill ${flag} /pid ${pid}`, { timeout: 5000 });
    } else {
      process.kill(pid, signal);
    }
    return { pid, signal, success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const friendly = msg.includes('ESRCH')
      ? `Process ${pid} does not exist`
      : msg.includes('EPERM')
        ? `Permission denied — cannot kill PID ${pid}`
        : msg;
    return { pid, signal, success: false, error: friendly };
  }
}