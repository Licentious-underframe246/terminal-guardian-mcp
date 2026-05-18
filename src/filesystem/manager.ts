import {
  readdirSync,
  statSync,
  readFileSync,
  existsSync,
  lstatSync,
} from 'fs';
import { resolve, relative, join, extname, basename } from 'path';
import { glob } from 'glob';
import type { FileInfo, FileContent, SearchResult, GuardianConfig } from '../types/index.js';

const MIME_MAP: Record<string, string> = {
  '.ts': 'text/typescript',
  '.tsx': 'text/typescript',
  '.js': 'text/javascript',
  '.jsx': 'text/javascript',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.html': 'text/html',
  '.css': 'text/css',
  '.py': 'text/x-python',
  '.sh': 'text/x-shellscript',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  '.toml': 'text/toml',
  '.env': 'text/plain',
  '.gitignore': 'text/plain',
  '.dockerignore': 'text/plain',
};

export class FilesystemManager {
  private readonly rootDir: string;
  private readonly allowedPaths: string[];
  private readonly maxFileSize: number;
  private readonly maxFilesPerOperation: number;

  constructor(config: GuardianConfig['workspace']) {
    this.rootDir = resolve(config.rootDir);
    this.allowedPaths = config.allowedPaths.map((p) => resolve(this.rootDir, p));
    this.maxFileSize = config.maxFileSize;
    this.maxFilesPerOperation = config.maxFilesPerOperation;
  }

  private assertAllowed(targetPath: string): string {
    const resolved = resolve(this.rootDir, targetPath);
    const isAllowed =
      resolved.startsWith(this.rootDir) ||
      this.allowedPaths.some((ap) => resolved.startsWith(ap));

    if (!isAllowed) {
      throw new Error(
        `Access denied: '${targetPath}' is outside the allowed workspace (${this.rootDir})`,
      );
    }
    return resolved;
  }

  listFiles(dirPath: string = '.', recursive: boolean = false): FileInfo[] {
    const resolved = this.assertAllowed(dirPath);

    if (!existsSync(resolved)) {
      throw new Error(`Directory not found: ${dirPath}`);
    }

    const stat = statSync(resolved);
    if (!stat.isDirectory()) {
      throw new Error(`Path is not a directory: ${dirPath}`);
    }

    const results: FileInfo[] = [];
    this.collectFiles(resolved, results, recursive, 0);
    return results.slice(0, this.maxFilesPerOperation);
  }

  private collectFiles(
    dir: string,
    results: FileInfo[],
    recursive: boolean,
    depth: number,
  ): void {
    if (results.length >= this.maxFilesPerOperation) return;
    if (depth > 10) return; // Prevent excessive recursion

    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= this.maxFilesPerOperation) break;
      if (entry.startsWith('.') && depth > 0) continue; // Skip hidden in subdirs

      const fullPath = join(dir, entry);
      try {
        const lstat = lstatSync(fullPath);
        const rel = relative(this.rootDir, fullPath);
        const ext = extname(entry);

        const info: FileInfo = {
          name: entry,
          path: rel,
          type: lstat.isDirectory() ? 'directory' : lstat.isSymbolicLink() ? 'symlink' : 'file',
          size: lstat.size,
          modified: lstat.mtime.toISOString(),
          permissions: (lstat.mode & 0o777).toString(8),
          ...(ext ? { extension: ext } : {}),
        };

        results.push(info);

        if (recursive && lstat.isDirectory()) {
          this.collectFiles(fullPath, results, recursive, depth + 1);
        }
      } catch {
        // Skip unreadable entries
      }
    }
  }

  readFile(filePath: string): FileContent {
    const resolved = this.assertAllowed(filePath);

    if (!existsSync(resolved)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const stat = statSync(resolved);
    if (!stat.isFile()) {
      throw new Error(`Path is not a file: ${filePath}`);
    }

    if (stat.size > this.maxFileSize) {
      throw new Error(
        `File too large: ${filePath} (${Math.round(stat.size / 1024)}KB > ${Math.round(this.maxFileSize / 1024)}KB limit)`,
      );
    }

    const content = readFileSync(resolved, 'utf-8');
    const lines = content.split('\n').length;
    const ext = extname(filePath);

    return {
      path: relative(this.rootDir, resolved),
      content,
      size: stat.size,
      lines,
      encoding: 'utf-8',
      mimeType: MIME_MAP[ext] ?? 'text/plain',
    };
  }

  async searchFiles(query: string, dirPath: string = '.', filePattern: string = '**/*'): Promise<SearchResult[]> {
    const resolved = this.assertAllowed(dirPath);
    const results: SearchResult[] = [];

    let files: string[];
    try {
      files = await glob(filePattern, {
        cwd: resolved,
        absolute: true,
        ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/.next/**'],
      });
    } catch {
      return [];
    }

    const queryLower = query.toLowerCase();

    for (const file of files.slice(0, this.maxFilesPerOperation)) {
      try {
        const stat = statSync(file);
        if (!stat.isFile() || stat.size > this.maxFileSize) continue;

        const content = readFileSync(file, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line === undefined) continue;
          const idx = line.toLowerCase().indexOf(queryLower);
          if (idx !== -1) {
            const start = Math.max(0, i - 1);
            const end = Math.min(lines.length - 1, i + 1);
            results.push({
              path: relative(this.rootDir, file),
              line: i + 1,
              column: idx + 1,
              match: line.trim(),
              context: lines.slice(start, end + 1).join('\n'),
            });
            if (results.length >= 100) break;
          }
        }
      } catch {
        // Skip unreadable files
      }
      if (results.length >= 100) break;
    }

    return results;
  }

  analyzeProjectStructure(dirPath: string = '.'): {
    summary: string;
    fileCount: number;
    dirCount: number;
    totalSize: number;
    extensions: Record<string, number>;
    topFiles: FileInfo[];
  } {
    const files = this.listFiles(dirPath, true);
    const dirCount = files.filter((f) => f.type === 'directory').length;
    const fileCount = files.filter((f) => f.type === 'file').length;
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);

    const extensions: Record<string, number> = {};
    for (const f of files) {
      if (f.extension) {
        extensions[f.extension] = (extensions[f.extension] ?? 0) + 1;
      }
    }

    const packageJson = files.find((f) => f.name === 'package.json');
    const hasTs = (extensions['.ts'] ?? 0) > 0;
    const hasPy = (extensions['.py'] ?? 0) > 0;
    const hasDocker = files.some((f) => f.name === 'Dockerfile' || f.name === 'docker-compose.yml');

    const projectType = packageJson
      ? hasTs
        ? 'TypeScript/Node.js project'
        : 'JavaScript/Node.js project'
      : hasPy
        ? 'Python project'
        : 'Unknown project type';

    const summary = [
      projectType,
      hasDocker ? 'Docker support detected' : null,
      `${fileCount} files, ${dirCount} directories`,
      `Total size: ${Math.round(totalSize / 1024)}KB`,
    ]
      .filter(Boolean)
      .join(' | ');

    return {
      summary,
      fileCount,
      dirCount,
      totalSize,
      extensions,
      topFiles: files
        .filter((f) => f.type === 'file')
        .sort((a, b) => b.size - a.size)
        .slice(0, 10),
    };
  }

  getRootDir(): string {
    return this.rootDir;
  }
}
