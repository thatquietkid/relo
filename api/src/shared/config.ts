export interface ApiConfig {
  host: string;
  port: number;
}

export function getConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const port = Number(env.PORT ?? 3000);

  return {
    host: env.HOST ?? '0.0.0.0',
    port: Number.isInteger(port) && port > 0 ? port : 3000,
  };
}
