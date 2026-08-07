/**
 * Environment variable validation.
 * Called at startup to fail-fast on missing configuration.
 */

const REQUIRED_VARS = [
  { name: 'DATABASE_URL', description: 'Database connection string' },
] as const;

const OPTIONAL_VARS = [
  { name: 'NEXTAUTH_SECRET', description: 'JWT signing secret (required in production)', requiredInProd: true },
  { name: 'NEXTAUTH_URL', description: 'Public URL of the app', requiredInProd: true },
  { name: 'SCHEDULER_SECRET', description: 'Bearer token for POST /api/scheduler/tick (endpoint disabled if unset)' },
  { name: 'LOG_LEVEL', description: 'Minimum log level (debug|info|warn|error)' },
  { name: 'API_ALLOWED_ORIGINS', description: 'Comma-separated CORS origins for API routes' },
  { name: 'MCP_ALLOWED_ORIGINS', description: 'Comma-separated CORS origins for /api/mcp endpoint' },
  { name: 'NEXT_PUBLIC_APP_URL', description: 'Public URL for MCP discovery response' },
] as const;

interface EnvValidationResult {
  valid: boolean;
  missing: string[];
  warnings: string[];
}

export function validateEnv(): EnvValidationResult {
  const missing: string[] = [];
  const warnings: string[] = [];
  const isProd = process.env.NODE_ENV === 'production';

  for (const v of REQUIRED_VARS) {
    if (!process.env[v.name]) {
      missing.push(`${v.name} (${v.description})`);
    }
  }

  for (const v of OPTIONAL_VARS) {
    if ('requiredInProd' in v && v.requiredInProd && isProd && !process.env[v.name]) {
      missing.push(`${v.name} (${v.description}) — REQUIRED IN PRODUCTION`);
    } else if (!process.env[v.name] && !('requiredInProd' in v && v.requiredInProd)) {
      warnings.push(`${v.name} not set — using defaults`);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
  };
}

/**
 * Validate and throw if critical vars are missing.
 */
export function assertEnv(): void {
  const result = validateEnv();
  if (!result.valid) {
    throw new Error(
      `Missing required environment variables:\n  - ${result.missing.join('\n  - ')}`
    );
  }
  if (result.warnings.length > 0) {
    for (const w of result.warnings) {
      console.warn(`[ENV] ${w}`);
    }
  }
}