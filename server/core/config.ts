export interface ServerConfig {
  port: number;
  nodeEnv: string;
  appVersion: string;
  engineVersion: string;
  limits: {
    maxVariables: number;
    maxConstraints: number;
    timeoutMs: number;
    tolerance: number;
  };
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const cleaned = raw.trim().replace(/[_, ]/g, '');
  if (!/^\d+$/.test(cleaned)) return fallback;
  const parsed = Number.parseInt(cleaned, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePositiveFloat(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeTimeoutMs(raw: string | undefined, fallbackMs: number): number {
  const parsed = parsePositiveInt(raw, fallbackMs);
  // Guard against environments specifying seconds (e.g. 120 instead of 120000)
  if (parsed <= 600) {
    return parsed * 1000;
  }
  return Math.max(5_000, parsed);
}

export function loadServerConfig(): ServerConfig {
  return {
    port: parsePositiveInt(process.env.PORT, 3000),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    appVersion: '1.0.0',
    engineVersion: '1.0.0-mvp',
    limits: {
      maxVariables: parsePositiveInt(process.env.SOLVER_MAX_VARIABLES, 100),
      maxConstraints: parsePositiveInt(process.env.SOLVER_MAX_CONSTRAINTS, 200),
      timeoutMs: normalizeTimeoutMs(process.env.SOLVER_TIMEOUT_MS, 120_000),
      tolerance: parsePositiveFloat(process.env.SOLVER_TOLERANCE, 1e-9),
    },
  };
}
