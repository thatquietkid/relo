import { createApp } from './app.js';
import { createSupabaseEmployeeRepositoryFromEnv } from './employee/supabase-repository.js';
import { loadConfig } from './shared/config.js';

const config = loadConfig();
const app = await createApp({}, {
  createEmployeeRepository: createSupabaseEmployeeRepositoryFromEnv,
}, config);

await app.listen({ host: config.host, port: config.port });
