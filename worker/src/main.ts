import { createServer, type Server } from 'node:http';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { runOutboxLoop } from './outbox-loop.js';
import { createSupabaseOutboxRepository } from './supabase-outbox-repository.js';
import { createHandlers } from './handlers/index.js';

export interface WorkerRuntime {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
}

export function getWorkerHealthPort(env: NodeJS.ProcessEnv = process.env): number | undefined {
  const value = env.WORKER_HTTP_PORT?.trim();
  if (!value) {
    return undefined;
  }

  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65_535 ? port : undefined;
}

async function startHealthServer(port: number): Promise<Server> {
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (request.method === 'GET' && pathname === '/healthz') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'not_found' }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => {
      server.off('error', reject);
      resolve();
    });
  });

  return server;
}

async function stopHealthServer(server: Server | undefined): Promise<void> {
  if (!server || !server.listening) {
    return;
  }

  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
}

export function createWorker(): WorkerRuntime {
  let running = false;
  let controller: AbortController | undefined;
  let loop: Promise<void> | undefined;

  return {
    async start() {
      running = true;
      if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        controller = new AbortController();
        loop = runOutboxLoop(createSupabaseOutboxRepository(), createHandlers(), process.env.WORKER_ID ?? randomUUID(), controller.signal).catch(() => undefined);
      }
    },
    async stop() {
      controller?.abort();
      await loop;
      running = false;
    },
    isRunning() {
      return running;
    },
  };
}

export async function runWorkerProcess(): Promise<void> {
  const worker = createWorker();
  let resolveShutdown: (() => void) | undefined;
  let shutdownRequested = false;
  let healthServer: Server | undefined;
  const handleShutdown = () => {
    shutdownRequested = true;
    resolveShutdown?.();
  };

  process.once('SIGINT', handleShutdown);
  process.once('SIGTERM', handleShutdown);

  try {
    await worker.start();
    const healthPort = getWorkerHealthPort();
    if (healthPort !== undefined) {
      healthServer = await startHealthServer(healthPort);
    }
    const keepAlive = setInterval(() => undefined, 60_000);
    await new Promise<void>((resolve) => {
      resolveShutdown = resolve;
      if (shutdownRequested) {
        resolve();
      }
    });
    clearInterval(keepAlive);
  } finally {
    process.off('SIGINT', handleShutdown);
    process.off('SIGTERM', handleShutdown);
    await stopHealthServer(healthServer);
    await worker.stop();
  }
}

const isMainModule = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  await runWorkerProcess();
}
