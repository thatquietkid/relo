export interface ApiConfig {
  host: string;
  port: number;
  nodeEnv: 'development' | 'test' | 'production';
  frontendOrigin: string;
  supabaseUrl?: string;
  supabasePublishableKey?: string;
  supabaseServiceRoleKey?: string;
  readiness: {
    supabase: 'configured' | 'missing';
  };
}

function requiredProductionValue(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) {
    throw new Error(`${key} is required in production`);
  }
  return value;
}

function optionalValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value || undefined;
}

function assertUrl(value: string, key: string): string {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('unsupported protocol');
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    throw new Error(`${key} must be a valid HTTP(S) URL`);
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const rawNodeEnv = env.NODE_ENV ?? 'development';
  const nodeEnv: ApiConfig['nodeEnv'] = rawNodeEnv === 'production'
    ? 'production'
    : rawNodeEnv === 'test'
      ? 'test'
      : 'development';
  const port = Number(env.PORT ?? 3000);
  const supabaseUrl = nodeEnv === 'production'
    ? requiredProductionValue(env, 'SUPABASE_URL')
    : optionalValue(env, 'SUPABASE_URL');
  const supabasePublishableKey = nodeEnv === 'production'
    ? requiredProductionValue(env, 'SUPABASE_PUBLISHABLE_KEY')
    : optionalValue(env, 'SUPABASE_PUBLISHABLE_KEY');
  const validatedSupabaseUrl = supabaseUrl ? assertUrl(supabaseUrl, 'SUPABASE_URL') : undefined;
  const frontendOrigin = env.FRONTEND_ORIGIN?.trim() || 'http://127.0.0.1:4173';

  assertUrl(frontendOrigin, 'FRONTEND_ORIGIN');

  return {
    host: env.HOST ?? '0.0.0.0',
    port: Number.isInteger(port) && port > 0 ? port : 3000,
    nodeEnv,
    frontendOrigin,
    supabaseUrl: validatedSupabaseUrl,
    supabasePublishableKey,
    supabaseServiceRoleKey: optionalValue(env, 'SUPABASE_SERVICE_ROLE_KEY'),
    readiness: {
      supabase: validatedSupabaseUrl && supabasePublishableKey ? 'configured' : 'missing',
    },
  };
}

export const getConfig = loadConfig;
