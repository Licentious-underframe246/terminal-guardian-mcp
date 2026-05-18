import pino from 'pino';
import { mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { randomUUID } from 'crypto';
import type { GuardianConfig, SessionLogEntry, RiskLevel } from '../types/index.js';

let loggerInstance: pino.Logger | null = null;
const sessionLog: SessionLogEntry[] = [];

export function initLogger(config: GuardianConfig['logging']): pino.Logger {
  if (!config.enabled) {
    loggerInstance = pino({ level: 'silent' });
    return loggerInstance;
  }

  const logDir = resolve(config.logDir);
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  const transport = config.prettyPrint
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined;

  loggerInstance = pino(
    {
      level: config.level,
      base: { service: 'terminal-guardian-mcp' },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    transport
      ? pino.transport(transport)
      : pino.destination({
          dest: resolve(logDir, 'guardian.log'),
          sync: false,
          mkdir: true,
        }),
  );

  return loggerInstance;
}

export function getLogger(): pino.Logger {
  if (!loggerInstance) {
    loggerInstance = pino({ level: 'info' });
  }
  return loggerInstance;
}

export function logSessionEvent(entry: Omit<SessionLogEntry, 'id' | 'timestamp'>): void {
  const fullEntry: SessionLogEntry = {
    ...entry,
    id: randomUUID(),
    timestamp: new Date().toISOString(),
  };
  sessionLog.push(fullEntry);

  const logger = getLogger();
  switch (entry.type) {
    case 'security_event':
      logger.warn({ event: fullEntry }, `[SECURITY] ${entry.action}`);
      break;
    case 'command':
      logger.info({ event: fullEntry }, `[CMD] ${entry.action}`);
      break;
    default:
      logger.debug({ event: fullEntry }, `[${entry.type.toUpperCase()}] ${entry.action}`);
  }
}

export function logSecurityEvent(
  action: string,
  details: Record<string, unknown>,
  riskLevel: RiskLevel,
  blocked: boolean,
): void {
  logSessionEvent({
    type: 'security_event',
    action,
    details,
    riskLevel,
    blocked,
  });
}

export function logCommand(
  command: string,
  details: Record<string, unknown>,
  duration?: number,
): void {
  logSessionEvent({
    type: 'command',
    action: command,
    details,
    duration,
  });
}

export function getSessionLog(): SessionLogEntry[] {
  return [...sessionLog];
}

export function clearSessionLog(): void {
  sessionLog.length = 0;
}
