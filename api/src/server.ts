import { createApp } from './app.js';
import { createSupabaseEmployeeRepositoryFromEnv } from './employee/supabase-repository.js';
import { getConfig } from './shared/config.js';

const app = await createApp({}, {
  createEmployeeRepository: createSupabaseEmployeeRepositoryFromEnv,
});
const config = getConfig();

await app.listen({ host: config.host, port: config.port });
