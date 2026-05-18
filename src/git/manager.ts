import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve, join } from 'path';
import type { GitStatus, GitFileChange, GitLogEntry, GitDiff, GitDiffChunk, GuardianConfig } from '../types/index.js';

export class GitManager {
  private readonly config: GuardianConfig['git'];
  private readonly rootDir: string;

  constructor(config: GuardianConfig['git'], rootDir: string) {
    this.config = config;
    this.rootDir = resolve(rootDir);
  }

  private run(command: string, cwd?: string): string {
    if (!this.config.enabled) {
      throw new Error('Git integration is disabled');
    }

    const dir = cwd ?? this.rootDir;
    try {
      return execSync(command, {
        cwd: dir,
        encoding: 'utf-8',
        timeout: 10_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Git command failed: ${msg}`);
    }
  }

  private isGitRepo(dir?: string): boolean {
    const target = dir ?? this.rootDir;
    return existsSync(join(target, '.git'));
  }

  getStatus(repoPath?: string): GitStatus {
    const dir = repoPath ? resolve(this.rootDir, repoPath) : this.rootDir;

    if (!this.isGitRepo(dir)) {
      throw new Error(`Not a git repository: ${dir}`);
    }

    let branch = 'HEAD';
    try {
      branch = this.run('git rev-parse --abbrev-ref HEAD', dir);
    } catch {
    }

    let upstream: string | undefined;
    let ahead = 0;
    let behind = 0;
    try {
      upstream = this.run(`git rev-parse --abbrev-ref ${branch}@{upstream}`, dir);
      const aheadBehind = this.run(
        `git rev-list --left-right --count ${branch}...${upstream}`,
        dir,
      );
      const parts = aheadBehind.split('\t');
      ahead = parseInt(parts[0] ?? '0', 10);
      behind = parseInt(parts[1] ?? '0', 10);
    } catch {
    }

    const porcelain = this.run('git status --porcelain=v1 -u', dir);
    const staged: GitFileChange[] = [];
    const unstaged: GitFileChange[] = [];
    const untracked: string[] = [];
    const conflicted: string[] = [];

    for (const line of porcelain.split('\n').filter(Boolean)) {
      const x = line[0] ?? ' ';
      const y = line[1] ?? ' ';
      const file = line.slice(3);

      if (x === '?' && y === '?') {
        untracked.push(file);
        continue;
      }

      const statusLabel = this.statusLabel(x);
      if (x !== ' ' && x !== '?') {
        if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) {
          conflicted.push(file);
        } else {
          staged.push({ path: file, status: x, statusLabel });
        }
      }

      const unstagedLabel = this.statusLabel(y);
      if (y !== ' ' && y !== '?' && y !== 'U') {
        unstaged.push({ path: file, status: y, statusLabel: unstagedLabel });
      }
    }

    return {
      branch,
      upstream,
      ahead,
      behind,
      staged,
      unstaged,
      untracked,
      conflicted,
      isClean: staged.length === 0 && unstaged.length === 0 && untracked.length === 0,
    };
  }

  private statusLabel(code: string): string {
    const labels: Record<string, string> = {
      M: 'modified',
      A: 'added',
      D: 'deleted',
      R: 'renamed',
      C: 'copied',
      U: 'unmerged',
      '?': 'untracked',
      '!': 'ignored',
    };
    return labels[code] ?? code;
  }

  getDiff(staged: boolean = false, file?: string, repoPath?: string): GitDiff[] {
    const dir = repoPath ? resolve(this.rootDir, repoPath) : this.rootDir;
    const flags = staged ? '--cached' : '';
    const target = file ? `-- ${file}` : '';
    const raw = this.run(`git diff ${flags} --unified=3 ${target}`.trim(), dir);

    return this.parseDiff(raw);
  }

  private parseDiff(raw: string): GitDiff[] {
    const diffs: GitDiff[] = [];
    const fileBlocks = raw.split(/^diff --git /m).filter(Boolean);

    for (const block of fileBlocks) {
      const lines = block.split('\n');
      const headerLine = lines[0] ?? '';
      const fileMatch = headerLine.match(/b\/(.+)$/);
      const file = fileMatch?.[1] ?? 'unknown';

      let additions = 0;
      let deletions = 0;
      const chunks: GitDiffChunk[] = [];
      let currentChunk: GitDiffChunk | null = null;

      for (const line of lines) {
        if (line.startsWith('@@')) {
          if (currentChunk) chunks.push(currentChunk);
          const hunkMatch = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
          if (hunkMatch) {
            currentChunk = {
              oldStart: parseInt(hunkMatch[1] ?? '0', 10),
              oldLines: parseInt(hunkMatch[2] ?? '1', 10),
              newStart: parseInt(hunkMatch[3] ?? '0', 10),
              newLines: parseInt(hunkMatch[4] ?? '1', 10),
              lines: [],
            };
          }
        } else if (currentChunk) {
          currentChunk.lines.push(line);
          if (line.startsWith('+') && !line.startsWith('+++')) additions++;
          if (line.startsWith('-') && !line.startsWith('---')) deletions++;
        }
      }
      if (currentChunk) chunks.push(currentChunk);

      diffs.push({ file, additions, deletions, chunks });
    }

    return diffs;
  }

  getLog(maxEntries?: number, repoPath?: string): GitLogEntry[] {
    const dir = repoPath ? resolve(this.rootDir, repoPath) : this.rootDir;
    const limit = maxEntries ?? this.config.maxLogEntries;

    const format = '%H%x1F%h%x1F%s%x1F%an%x1F%ae%x1F%aI%x1F%D';
    const raw = this.run(`git log --pretty=format:"${format}" -${limit}`, dir);

    if (!raw) return [];

    return raw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        // Remove surrounding quotes from format output
        const clean = line.replace(/^"|"$/g, '');
        const parts = clean.split('\x1F');
        return {
          hash: parts[0] ?? '',
          shortHash: parts[1] ?? '',
          subject: parts[2] ?? '',
          author: parts[3] ?? '',
          email: parts[4] ?? '',
          date: parts[5] ?? '',
          refs: (parts[6] ?? '')
            .split(',')
            .map((r) => r.trim())
            .filter(Boolean),
        };
      });
  }

  getBranches(repoPath?: string): { local: string[]; remote: string[]; current: string } {
    const dir = repoPath ? resolve(this.rootDir, repoPath) : this.rootDir;

    const raw = this.run('git branch -a --format=%(refname:short)', dir);
    const current = this.run('git rev-parse --abbrev-ref HEAD', dir);

    const all = raw.split('\n').filter(Boolean);
    const local = all.filter((b) => !b.startsWith('remotes/'));
    const remote = all
      .filter((b) => b.startsWith('remotes/'))
      .map((b) => b.replace(/^remotes\//, ''));

    return { local, remote, current };
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }
}
