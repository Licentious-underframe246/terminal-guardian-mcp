import { spawn } from 'child_process';
import { resolve, isAbsolute } from 'path';
import { existsSync } from 'fs';
import { analyzeCommand, isBlocked } from '../security/riskAnalyzer.js';
import { logCommand, logSecurityEvent } from '../logging/logger.js';
import type { CommandResult, GuardianConfig, RiskAssessment } from '../types/index.js';

interface ExecuteOptions {
  cwd?: string | undefined;
  env?: Record<string, string> | undefined;
  timeout?: number | undefined;
  confirmed?: boolean | undefined;
}

// ── Cross-platform shell detection ────────────────────────────
const IS_WINDOWS = process.platform === 'win32';

function resolveShell(configuredShell: string): { shell: string; args: string[] } {
  // If user explicitly configured a specific shell (not "auto"), respect it
  if (configuredShell && configuredShell !== 'auto' && configuredShell !== '/bin/bash') {
    return IS_WINDOWS
      ? { shell: configuredShell, args: ['/d', '/s', '/c'] }
      : { shell: configuredShell, args: ['-c'] };
  }

  if (IS_WINDOWS) {
    // Prefer PowerShell Core → PowerShell → cmd
    const pwsh = process.env['PWSH_PATH'] ?? 'pwsh';
    return { shell: pwsh, args: ['-NoProfile', '-NonInteractive', '-Command'] };
  }

  // Unix: prefer bash, fallback to sh
  const bash = existsSync('/bin/bash') ? '/bin/bash'
    : existsSync('/usr/bin/bash') ? '/usr/bin/bash'
    : existsSync('/usr/local/bin/bash') ? '/usr/local/bin/bash'
    : '/bin/sh';

  return { shell: bash, args: ['-c'] };
}

export class TerminalExecutor {
  private readonly config: GuardianConfig;
  private activeProcesses: Set<number> = new Set();
  private readonly shellInfo: { shell: string; args: string[] };

  constructor(config: GuardianConfig) {
    this.config = config;
    this.shellInfo = resolveShell(config.execution.shell);
  }

  async execute(command: string, options: ExecuteOptions = {}): Promise<CommandResult> {
    const startTime = Date.now();
    const workingDir = this.resolveWorkingDir(options.cwd);
    const timeout = options.timeout ?? this.config.execution.timeout;
    const confirmed = options.confirmed ?? false;

    // Perform risk analysis
    const riskAssessment = analyzeCommand(command, {
      customBlocklist: this.config.security.customBlocklist,
      customAllowlist: this.config.security.customAllowlist,
      allowSudo: this.config.security.allowSudo,
    });

    // Security gate
    if (this.config.security.blockDangerousCommands && isBlocked(riskAssessment)) {
      logSecurityEvent(
        `Blocked command: ${command}`,
        { command, workingDir, riskAssessment },
        riskAssessment.level,
        true,
      );
      return {
        command,
        exitCode: -1,
        stdout: '',
        stderr: `[Terminal Guardian] Command blocked: ${riskAssessment.level}\n${riskAssessment.reasons.join('\n')}`,
        duration: Date.now() - startTime,
        timedOut: false,
        workingDir,
        timestamp: new Date().toISOString(),
        riskAssessment,
      };
    }

    // Require confirmation for warnings
    if (
      this.config.security.requireConfirmationForWarnings &&
      riskAssessment.level === 'WARNING' &&
      !confirmed
    ) {
      logSecurityEvent(
        `Unconfirmed warning command: ${command}`,
        { command, workingDir, riskAssessment },
        riskAssessment.level,
        false,
      );
      return {
        command,
        exitCode: -2,
        stdout: '',
        stderr: `[Terminal Guardian] Command requires confirmation.\nRisk: ${riskAssessment.level}\nReasons:\n${riskAssessment.reasons.map((r) => `  • ${r}`).join('\n')}\n\nRe-run with confirmed=true to proceed.`,
        duration: Date.now() - startTime,
        timedOut: false,
        workingDir,
        timestamp: new Date().toISOString(),
        riskAssessment,
      };
    }

    return await this.runProcess(command, workingDir, timeout, startTime, riskAssessment);
  }

  private async runProcess(
    command: string,
    cwd: string,
    timeout: number,
    startTime: number,
    riskAssessment: RiskAssessment,
  ): Promise<CommandResult> {
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const { shell, args } = this.shellInfo;
      const proc = spawn(shell, [...args, command], {
        cwd,
        env: { ...process.env } as Record<string, string>,
        stdio: ['pipe', 'pipe', 'pipe'],
        // On Windows, shell: true would double-wrap — we handle it manually above
      });

      if (proc.pid !== undefined) {
        this.activeProcesses.add(proc.pid);
      }

      // Handle spawn error immediately (e.g. shell not found)
      proc.on('error', (err) => {
        clearTimeout(timer);
        if (proc.pid !== undefined) this.activeProcesses.delete(proc.pid);

        const hint = err.message.includes('ENOENT')
          ? `\nShell not found: "${shell}". On Windows, ensure PowerShell or WSL is available. Check the "execution.shell" setting in terminal-guardian.config.json.`
          : '';

        resolve({
          command,
          exitCode: -1,
          stdout: '',
          stderr: `Process error: ${err.message}${hint}`,
          duration: Date.now() - startTime,
          timedOut: false,
          workingDir: cwd,
          timestamp: new Date().toISOString(),
          riskAssessment,
        });
      });

      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGTERM');
        setTimeout(() => {
          if (!proc.killed) proc.kill('SIGKILL');
        }, 2000);
      }, timeout);

      proc.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        if (stdout.length + text.length <= this.config.execution.maxOutputSize) {
          stdout += text;
        } else {
          stdout += '\n[Terminal Guardian] Output truncated (max size reached)';
        }
      });

      proc.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        if (stderr.length + text.length <= this.config.execution.maxOutputSize) {
          stderr += text;
        }
      });

      proc.on('close', (code) => {
        clearTimeout(timer);
        if (proc.pid !== undefined) this.activeProcesses.delete(proc.pid);

        const duration = Date.now() - startTime;
        const result: CommandResult = {
          command,
          exitCode: code ?? -1,
          stdout,
          stderr,
          duration,
          timedOut,
          workingDir: cwd,
          timestamp: new Date().toISOString(),
          riskAssessment,
        };

        if (this.config.logging.logCommands) {
          logCommand(command, {
            exitCode: code,
            duration,
            cwd,
            timedOut,
            riskLevel: riskAssessment.level,
            shell,
            ...(this.config.logging.logOutputs ? { stdout, stderr } : {}),
          });
        }

        resolve(result);
      });
    });
  }

  private resolveWorkingDir(cwd?: string): string {
    const base = resolve(this.config.workspace.rootDir);
    if (!cwd) return base;
    const resolved = isAbsolute(cwd) ? cwd : resolve(base, cwd);
    if (!existsSync(resolved)) return base;
    return resolved;
  }

  getShellInfo(): { shell: string; args: string[] } {
    return this.shellInfo;
  }

  getActiveProcessCount(): number {
    return this.activeProcesses.size;
  }
}
