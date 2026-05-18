import { z } from 'zod';

// ============================================================
// MCP Tool Input Schemas
// ============================================================

export const RunCommandSchema = z.object({
  command: z.string().min(1).max(4096).describe('Shell command to execute'),
  cwd: z
    .string()
    .optional()
    .describe('Working directory relative to workspace root'),
  timeout: z
    .number()
    .int()
    .min(1000)
    .max(300_000)
    .optional()
    .describe('Execution timeout in milliseconds (default: 30000)'),
  confirmed: z
    .boolean()
    .optional()
    .default(false)
    .describe('Set to true to confirm execution of WARNING-level commands'),
});

export const AnalyzeCommandSchema = z.object({
  command: z.string().min(1).max(4096).describe('Shell command to analyze for safety'),
});

export const ListFilesSchema = z.object({
  path: z
    .string()
    .optional()
    .default('.')
    .describe('Directory path relative to workspace root'),
  recursive: z
    .boolean()
    .optional()
    .default(false)
    .describe('Whether to list files recursively'),
});

export const ReadFileSchema = z.object({
  path: z.string().min(1).describe('File path relative to workspace root'),
});

export const SearchFilesSchema = z.object({
  query: z.string().min(1).max(256).describe('Text to search for'),
  path: z
    .string()
    .optional()
    .default('.')
    .describe('Directory to search in (relative to workspace root)'),
  pattern: z
    .string()
    .optional()
    .default('**/*')
    .describe('Glob pattern to match files (e.g., "**/*.ts")'),
});

export const DockerPsSchema = z.object({
  all: z
    .boolean()
    .optional()
    .default(true)
    .describe('Include stopped containers'),
});

export const DockerLogsSchema = z.object({
  container: z.string().min(1).describe('Container ID or name'),
  tail: z
    .number()
    .int()
    .min(1)
    .max(10_000)
    .optional()
    .default(100)
    .describe('Number of log lines to return'),
  timestamps: z
    .boolean()
    .optional()
    .default(true)
    .describe('Include timestamps in log output'),
});

export const DockerStatsSchema = z.object({
  container: z.string().min(1).describe('Container ID or name'),
});

export const DockerRestartSchema = z.object({
  container: z.string().min(1).describe('Container ID or name'),
  confirmed: z
    .boolean()
    .optional()
    .default(false)
    .describe('Confirm container restart (required)'),
});

export const GitStatusSchema = z.object({
  path: z
    .string()
    .optional()
    .describe('Repository path relative to workspace root'),
});

export const GitDiffSchema = z.object({
  path: z
    .string()
    .optional()
    .describe('Repository path relative to workspace root'),
  staged: z
    .boolean()
    .optional()
    .default(false)
    .describe('Show staged changes instead of working tree diff'),
  file: z.string().optional().describe('Limit diff to a specific file'),
});

export const GitLogSchema = z.object({
  path: z
    .string()
    .optional()
    .describe('Repository path relative to workspace root'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe('Maximum number of commits to return'),
});

// Type exports
export type RunCommandInput = z.infer<typeof RunCommandSchema>;
export type AnalyzeCommandInput = z.infer<typeof AnalyzeCommandSchema>;
export type ListFilesInput = z.infer<typeof ListFilesSchema>;
export type ReadFileInput = z.infer<typeof ReadFileSchema>;
export type SearchFilesInput = z.infer<typeof SearchFilesSchema>;
export type DockerPsInput = z.infer<typeof DockerPsSchema>;
export type DockerLogsInput = z.infer<typeof DockerLogsSchema>;
export type DockerStatsInput = z.infer<typeof DockerStatsSchema>;
export type DockerRestartInput = z.infer<typeof DockerRestartSchema>;
export type GitStatusInput = z.infer<typeof GitStatusSchema>;
export type GitDiffInput = z.infer<typeof GitDiffSchema>;
export type GitLogInput = z.infer<typeof GitLogSchema>;
