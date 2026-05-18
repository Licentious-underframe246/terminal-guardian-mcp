<div align="center">

<img src="https://raw.githubusercontent.com/7Majesty-M/terminal-guardian-mcp/main/docs/assets/banner.png" alt="Terminal Guardian MCP" width="100%" />

# Terminal Guardian MCP

**Secure, sandboxed terminal access for AI assistants via the Model Context Protocol**

[![CI](https://github.com/7Majesty-M/terminal-guardian-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/7Majesty-M/terminal-guardian-mcp/actions)
[![npm version](https://img.shields.io/npm/v/terminal-guardian-mcp)](https://www.npmjs.com/package/terminal-guardian-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-purple.svg)](https://modelcontextprotocol.io)

[Features](#features) · [Quick Start](#quick-start) · [Claude Desktop](#claude-desktop-integration) · [Tools](#mcp-tools) · [Security](#security-philosophy) · [Configuration](#configuration) · [Roadmap](#roadmap)

</div>

---

## Overview

**Terminal Guardian MCP** is a production-grade [Model Context Protocol](https://modelcontextprotocol.io) server that gives AI assistants like Claude **safe, controlled, and auditable access to your terminal**. Every command is analyzed for risk, logged with full context, and executed inside configurable safety boundaries.

Built for developers who want to leverage AI in their workflows without compromising system integrity.

```
AI Assistant → Terminal Guardian MCP → Risk Analysis → Sandboxed Execution → Structured Result
```

> ⚠️ **This server provides real terminal access.** Configure it carefully. Review the [Security Philosophy](#security-philosophy) before deploying.

---

## Features

### 🛡️ Risk Analysis Engine
Every command passes through a multi-layer safety analysis before execution:

| Risk Level | Example Commands | Behavior |
|------------|-----------------|----------|
| `SAFE` | `ls`, `git status`, `npm list` | Executed immediately |
| `WARNING` | `rm -rf ./dist`, `docker stop app` | Requires explicit confirmation |
| `DANGEROUS` | `sudo apt-get`, `curl \| bash` | Blocked by default |
| `BLOCKED` | `rm -rf /`, `shutdown`, fork bombs | Always blocked, always logged |

### ⚡ Secure Terminal Execution
- Shell command execution with full `stdout`/`stderr` capture
- Configurable per-command timeouts (default: 30s, max: 5m)
- SIGTERM → SIGKILL escalation for hanging processes
- Working directory isolation within workspace root
- Output size limits to prevent memory exhaustion

### 📁 Filesystem Access
- File listing, reading, and content search
- Configurable workspace root with path traversal prevention
- Glob pattern matching for targeted file searches
- Project structure analysis with language detection

### 🐳 Docker Integration *(optional)*
- List and inspect containers
- Read container logs with timestamp support
- Real-time resource stats (CPU, memory, network, block I/O)
- Container restart with confirmation gate
- Disabled by default — opt-in via config

### 🌿 Git Repository Analysis
- Full `git status` with staged/unstaged/untracked breakdown
- Diff viewer with per-file additions/deletions
- Commit history with author, date, and refs
- Branch listing (local + remote)
- Read-only by default (push/commit require explicit opt-in)

### 📊 Session Logging
- Structured JSON logs via [pino](https://getpino.io)
- Every command, tool call, and security event is recorded
- Configurable log levels and output destinations
- Optional output logging (disabled by default for privacy)

### 🔒 Rate Limiting
- Per-minute and per-hour request limits
- In-memory bucket algorithm with automatic reset
- Clear error messages with retry-after hints

---

## Quick Start

### Prerequisites

- Node.js ≥ 18.0.0
- npm or yarn

### Install from npm

```bash
npm install -g terminal-guardian-mcp
```

### Install from source

```bash
git clone https://github.com/7Majesty-M/terminal-guardian-mcp.git
cd terminal-guardian-mcp
npm install
npm run build
```

### Run directly

```bash
terminal-guardian-mcp
# or from source:
node dist/index.js
```

---

## Claude Desktop Integration

Add Terminal Guardian to your Claude Desktop configuration:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`  
**Linux:** `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "terminal-guardian": {
      "command": "npx",
      "args": ["terminal-guardian-mcp"],
      "env": {
        "GUARDIAN_CONFIG": "/path/to/your/terminal-guardian.config.json"
      }
    }
  }
}
```

Or if installed globally:

```json
{
  "mcpServers": {
    "terminal-guardian": {
      "command": "terminal-guardian-mcp",
      "env": {
        "GUARDIAN_CONFIG": "/absolute/path/to/terminal-guardian.config.json"
      }
    }
  }
}
```

After saving, **restart Claude Desktop**. You should see Terminal Guardian appear in the tools list.

---

## MCP Tools

### `run_command`
Execute a shell command with full safety analysis.

```json
{
  "command": "npm run build",
  "cwd": "./my-project",
  "timeout": 60000,
  "confirmed": false
}
```

**Returns:**
```json
{
  "success": true,
  "data": {
    "command": "npm run build",
    "exitCode": 0,
    "stdout": "...",
    "stderr": "",
    "duration": 4230,
    "timedOut": false,
    "workingDir": "/workspace/my-project",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "riskAssessment": {
      "level": "SAFE",
      "score": 5,
      "reasons": ["No dangerous patterns detected"],
      "blocked": false
    }
  }
}
```

### `analyze_command`
Analyze a command without running it.

```json
{ "command": "rm -rf ./old-build" }
```

**Returns:**
```json
{
  "level": "WARNING",
  "score": 40,
  "reasons": ["Recursive deletion — verify target path carefully"],
  "requiresConfirmation": true,
  "blocked": false,
  "recommendation": "Review this command carefully before proceeding."
}
```

### `list_files`
List directory contents.

```json
{ "path": "./src", "recursive": true }
```

### `read_file`
Read a file's content.

```json
{ "path": "./src/index.ts" }
```

### `search_files`
Search for text across files.

```json
{
  "query": "TODO",
  "path": "./src",
  "pattern": "**/*.ts"
}
```

### `docker_ps`
List Docker containers.

```json
{ "all": true }
```

### `docker_logs`
Fetch container logs.

```json
{
  "container": "my-app",
  "tail": 200,
  "timestamps": true
}
```

### `docker_stats`
Get container resource usage.

```json
{ "container": "my-app" }
```

### `git_status`
Get repository status.

```json
{ "path": "." }
```

### `git_diff`
View file changes.

```json
{
  "staged": false,
  "file": "src/api.ts"
}
```

### `git_log`
View commit history.

```json
{ "limit": 20 }
```

---

## Architecture

```
terminal-guardian-mcp/
├── src/
│   ├── index.ts              # MCP server entrypoint & tool routing
│   ├── types/
│   │   └── index.ts          # Shared TypeScript types
│   ├── config/
│   │   └── loader.ts         # Config file loading with deep merge
│   ├── security/
│   │   ├── riskAnalyzer.ts   # Multi-layer command risk analysis
│   │   └── rateLimiter.ts    # Per-minute/hour request throttling
│   ├── tools/
│   │   ├── executor.ts       # Shell command execution engine
│   │   └── schemas.ts        # Zod input validation schemas
│   ├── filesystem/
│   │   └── manager.ts        # Safe file access with path enforcement
│   ├── docker/
│   │   └── manager.ts        # Dockerode integration (optional)
│   ├── git/
│   │   └── manager.ts        # Git operations via child_process
│   └── logging/
│       └── logger.ts         # Pino-based structured logging
├── tests/                    # Vitest unit tests
├── .github/workflows/        # CI/CD pipeline
├── Dockerfile                # Multi-stage production image
├── docker-compose.yml        # Development compose file
└── terminal-guardian.config.json
```

### Design Principles

- **Security First**: Risk analysis runs before every command, not as an afterthought
- **Least Privilege**: Docker disabled, git write-operations disabled, sudo blocked by default
- **Transparency**: Every action is logged with full context
- **Defense in Depth**: Multiple independent safety layers (blocklist → pattern analysis → rate limit → output limits)
- **Type Safety**: Strict TypeScript + Zod runtime validation on all tool inputs

---

## Configuration

Create `terminal-guardian.config.json` in your project root (or specify via `GUARDIAN_CONFIG` env var):

```json
{
  "workspace": {
    "rootDir": "/home/user/projects",
    "allowedPaths": ["/home/user/projects", "/home/user/projects/src"],
    "maxFileSize": 10485760,
    "maxFilesPerOperation": 100
  },
  "execution": {
    "timeout": 30000,
    "maxOutputSize": 1048576,
    "maxConcurrentProcesses": 5,
    "shell": "/bin/bash"
  },
  "security": {
    "enableRiskAnalysis": true,
    "blockDangerousCommands": true,
    "requireConfirmationForWarnings": true,
    "allowSudo": false,
    "allowNetworkCommands": true,
    "customBlocklist": ["curl.*my-internal-secret.*"],
    "customAllowlist": ["sudo systemctl restart nginx"]
  },
  "rateLimit": {
    "enabled": true,
    "maxRequestsPerMinute": 60,
    "maxRequestsPerHour": 500
  },
  "docker": {
    "enabled": false,
    "socketPath": "/var/run/docker.sock",
    "allowContainerRestart": false,
    "allowLogAccess": true
  },
  "git": {
    "enabled": true,
    "allowPush": false,
    "allowCommit": false,
    "maxLogEntries": 50
  },
  "logging": {
    "enabled": true,
    "level": "info",
    "logDir": "./logs",
    "logCommands": true,
    "logOutputs": false,
    "logSecurityEvents": true,
    "prettyPrint": false
  }
}
```

### Configuration Reference

| Key | Default | Description |
|-----|---------|-------------|
| `workspace.rootDir` | `"."` | Absolute root for all filesystem operations |
| `workspace.maxFileSize` | `10485760` | Max readable file size in bytes (10MB) |
| `execution.timeout` | `30000` | Default command timeout in ms |
| `execution.maxOutputSize` | `1048576` | Max stdout+stderr size in bytes (1MB) |
| `security.allowSudo` | `false` | Whether sudo commands are permitted |
| `security.customBlocklist` | `[]` | Additional regex patterns to always block |
| `security.customAllowlist` | `[]` | Patterns that bypass risk analysis |
| `docker.enabled` | `false` | Enable Docker tool integration |
| `docker.allowContainerRestart` | `false` | Allow restarting containers |
| `git.allowPush` | `false` | Allow `git push` via run_command |
| `logging.logOutputs` | `false` | Log stdout/stderr (may contain secrets!) |

---

## Security Philosophy

Terminal Guardian operates on a **deny-by-default** model with explicit allowlisting:

### What is always blocked
- Recursive filesystem deletion targeting system paths (`rm -rf /`)
- Fork bombs (`:(){:|:&};:`)
- System power management (`shutdown`, `reboot`, `halt`)
- Filesystem formatting (`mkfs`, `wipefs`, `dd of=/dev/`)
- Reverse shells and TCP redirections
- `chmod 777 /` and similar root-level permission changes

### What requires confirmation
- Recursive deletions of any path
- Docker container stop/kill/remove
- Force kills (`kill -9`, `killall`)
- Permission modifications (`chmod`, `chown`)
- Git destructive operations (`reset --hard`, `push`)
- Service management (`systemctl stop`)

### What is always safe
- Read-only commands: `ls`, `cat`, `grep`, `find`
- Git inspection: `status`, `log`, `diff`, `branch`
- Docker read operations: `ps`, `images`, `inspect`
- npm read operations: `list`, `outdated`, `audit`
- System info: `whoami`, `uptime`, `df`, `uname`

### Threat model
- **AI hallucination safety**: Blocks commands that an AI might suggest incorrectly
- **Prompt injection defense**: Rate limiting and explicit confirmation prevent automation abuse
- **Supply chain protection**: Blocks pipe-to-shell patterns (`curl | bash`)
- **Privilege escalation**: sudo blocked by default, must be explicitly allowed per-deployment
- **Data exfiltration**: Output size limits, no secret logging by default

---

## Docker Usage

Build and run the server in Docker:

```bash
# Build image
docker build -t terminal-guardian-mcp .

# Run with docker-compose
docker-compose up -d

# View logs
docker-compose logs -f terminal-guardian
```

The container runs as a non-root user (`guardian:guardian`) with a read-only root filesystem.

---

## Development

```bash
# Install dependencies
npm install

# Start in watch mode
npm run dev

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Type checking
npm run typecheck

# Lint
npm run lint

# Format
npm run format

# Build for production
npm run build
```

---

## Usage Examples

### With Claude Desktop

Once configured, you can ask Claude:

> "Check the git status of my project and tell me what files have changed"

> "Run the test suite and show me any failures"

> "List the Docker containers that are currently running and check if the database container is healthy"

> "Search my codebase for all TODO comments and summarize them"

> "What's the current branch and how many commits ahead of origin are we?"

### Tool call examples

**Safe command:**
```
User: Run `ls -la` in the src directory
Claude: [calls run_command with {"command": "ls -la", "cwd": "src"}]
→ Returns file listing immediately (SAFE level)
```

**Command requiring confirmation:**
```
User: Clean up the dist directory
Claude: [calls analyze_command first, sees WARNING]
        "This command (rm -rf ./dist) requires confirmation. It will recursively delete the dist directory. Should I proceed?"
User: Yes, go ahead
Claude: [calls run_command with confirmed: true]
```

**Blocked command:**
```
User: Run rm -rf /
Claude: [calls run_command, gets BLOCKED response]
        "I cannot execute this command. Terminal Guardian has blocked it because it would recursively delete the entire root filesystem. This is an unconditionally blocked operation."
```

---

## Roadmap

- [ ] **v1.1** — Process management tools (`list_processes`, `kill_process`)
- [ ] **v1.1** — Environment variable inspection (with secret masking)
- [ ] **v1.2** — Docker container exec with sandbox isolation
- [ ] **v1.2** — Network diagnostics (`ping`, `curl` with output limits)
- [ ] **v1.3** — AI-powered commit message generation via git diff analysis
- [ ] **v1.3** — Workspace templates for common project types
- [ ] **v1.4** — WebSocket transport support (alongside stdio)
- [ ] **v1.5** — Remote SSH execution with key-based auth
- [ ] **v2.0** — Full gVisor/nsjail sandbox integration
- [ ] **v2.0** — Per-session permission scoping
- [ ] **v2.0** — Audit log export (JSON/CSV/SIEM formats)

---

## Contributing

Contributions are welcome! Please read through the existing issues before opening new ones.

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'feat: add my feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request

Please ensure:
- All tests pass (`npm test`)
- TypeScript compiles without errors (`npm run typecheck`)
- Code is formatted (`npm run format`)
- New security patterns have corresponding test cases

---

## Related Projects

- [Model Context Protocol](https://modelcontextprotocol.io) — The protocol specification
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) — Official SDK
- [Claude Desktop](https://claude.ai/download) — The AI assistant this was built for

---

## License

MIT © [Terminal Guardian Contributors](LICENSE)

---

<div align="center">

Built with ❤️ for the AI infrastructure community

**[⭐ Star this project](https://github.com/7Majesty-M/terminal-guardian-mcp)** if it's useful to you

</div>

---

## Windows Support

Terminal Guardian auto-detects the available shell at startup — no manual configuration needed.

| Platform | Default Shell | Fallback |
|----------|--------------|---------|
| Linux / macOS | `/bin/bash` | `/bin/sh` |
| Windows | `pwsh` (PowerShell Core) | `cmd.exe` |

### Windows quick start

```bash
# Option 1: PowerShell Core (recommended)
winget install Microsoft.PowerShell

# Option 2: WSL (run bash natively)
# No config change needed — shell auto-detects

# Option 3: Git Bash
# Set in terminal-guardian.config.json:
```

```json
{
  "execution": {
    "shell": "C:\\Program Files\\Git\\bin\\bash.exe"
  }
}
```

> **Note**: On Windows without WSL, Unix commands like `ls`, `grep`, `cat` require PowerShell equivalents (`Get-ChildItem`, `Select-String`, `Get-Content`) or Git Bash.
