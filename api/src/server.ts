import { createApp } from './app.js';
import { getConfig } from './shared/config.js';

const app = await createApp();
const config = getConfig();

await app.listen({ host: config.host, port: config.port });
