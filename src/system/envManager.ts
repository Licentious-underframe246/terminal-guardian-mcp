// ============================================================
// Terminal Guardian MCP — Environment Variables Manager
// Reads process.env with automatic secret masking
// ============================================================

export interface EnvVariable {
  key: string;
  value: string;
  masked: boolean;
  category: EnvCategory;
}

export type EnvCategory =
  | 'secret'
  | 'path'
  | 'system'
  | 'runtime'
  | 'app'
  | 'unknown';

// Patterns whose VALUES are fully masked
const SECRET_KEY_PATTERNS: RegExp[] = [
  /secret/i,
  /password/i,
  /passwd/i,
  /token/i,
  /api[_-]?key/i,
  /auth/i,
  /credential/i,
  /private[_-]?key/i,
  /access[_-]?key/i,
  /signing[_-]?key/i,
  /encryption[_-]?key/i,
  /jwt/i,
  /bearer/i,
  /session/i,
  /database[_-]?url/i,
  /db[_-]?url/i,
  /connection[_-]?string/i,
  /dsn/i,
  /mongo/i,
  /postgres/i,
  /mysql/i,
  /redis[_-]?url/i,
  /smtp/i,
  /webhook/i,
  /stripe/i,
  /twilio/i,
  /sendgrid/i,
  /aws[_-]?(secret|access)/i,
  /gcp[_-]?key/i,
  /azure[_-]?(key|secret)/i,
  /supabase[_-]?(key|secret)/i,
];

const SECRET_VALUE_PATTERNS: RegExp[] = [
  /^[A-Za-z0-9+/]{40,}={0,2}$/, 
  /^sk[-_][a-zA-Z0-9]{20,}$/,    
  /^ghp_[a-zA-Z0-9]{36}$/,       
  /^xox[bpoa]-[0-9]+-/,         
  /^ey[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/, // JWT
];

function categorize(key: string): EnvCategory {
  if (SECRET_KEY_PATTERNS.some((p) => p.test(key))) return 'secret';
  if (/^PATH$|^LD_LIBRARY|^DYLD_|^MANPATH|^PKG_CONFIG/i.test(key)) return 'path';
  if (/^(HOME|USER|SHELL|LANG|LC_|TZ|TERM|LOGNAME|HOSTNAME|PWD|OLDPWD)$/i.test(key)) return 'system';
  if (/^(NODE|NPM|NVM|PYTHON|JAVA|GO|RUBY|CARGO|DENO|BUN)/i.test(key)) return 'runtime';
  return 'unknown';
}

function maskValue(value: string): string {
  if (value.length === 0) return '';
  if (value.length <= 4) return '****';
  return `${value.slice(0, 2)}${'*'.repeat(Math.min(value.length - 4, 12))}${value.slice(-2)}`;
}

function isSecretValue(key: string, value: string): boolean {
  if (SECRET_KEY_PATTERNS.some((p) => p.test(key))) return true;
  if (value.length >= 20 && SECRET_VALUE_PATTERNS.some((p) => p.test(value))) return true;
  return false;
}

export interface GetEnvOptions {
  filter?: string | undefined;       
  category?: EnvCategory | undefined;
  includeMasked?: boolean;          
  keys?: string[] | undefined;       
}

export interface EnvSummary {
  total: number;
  masked: number;
  visible: number;
  categories: Record<EnvCategory, number>;
  variables: EnvVariable[];
}

export class EnvManager {
  getVariables(options: GetEnvOptions = {}): EnvSummary {
    const { filter, category, includeMasked = true, keys } = options;

    const raw = process.env;
    const entries = Object.entries(raw).filter(
      (e): e is [string, string] => e[1] !== undefined,
    );

    const variables: EnvVariable[] = entries
      .map(([key, value]): EnvVariable => {
        const cat = categorize(key);
        const masked = isSecretValue(key, value);
        return {
          key,
          value: masked ? maskValue(value) : value,
          masked,
          category: cat,
        };
      })
      .filter((v) => {
        if (keys && keys.length > 0) return keys.includes(v.key);
        if (filter && !v.key.toLowerCase().includes(filter.toLowerCase())) return false;
        if (category && v.category !== category) return false;
        if (!includeMasked && v.masked) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.masked !== b.masked) return a.masked ? 1 : -1;
        return a.key.localeCompare(b.key);
      });

    const categoryCounts: Record<EnvCategory, number> = {
      secret: 0, path: 0, system: 0, runtime: 0, app: 0, unknown: 0,
    };
    for (const v of variables) {
      categoryCounts[v.category]++;
    }

    return {
      total: variables.length,
      masked: variables.filter((v) => v.masked).length,
      visible: variables.filter((v) => !v.masked).length,
      categories: categoryCounts,
      variables,
    };
  }

  getSingle(key: string): EnvVariable | null {
    const value = process.env[key];
    if (value === undefined) return null;
    const masked = isSecretValue(key, value);
    return {
      key,
      value: masked ? maskValue(value) : value,
      masked,
      category: categorize(key),
    };
  }

  hasKey(key: string): boolean {
    return key in process.env;
  }
}