import { pathToFileURL } from 'node:url';

export interface WorkerRuntime {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
}

export function createWorker(): WorkerRuntime {
  let running = false;

  return {
    async start() {
      running = true;
    },
    async stop() {
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
  const handleShutdown = () => resolveShutdown?.();

  process.once('SIGINT', handleShutdown);
  process.once('SIGTERM', handleShutdown);

  try {
    await worker.start();
    const keepAlive = setInterval(() => undefined, 60_000);
    await new Promise<void>((resolve) => {
      resolveShutdown = resolve;
    });
    clearInterval(keepAlive);
  } finally {
    process.off('SIGINT', handleShutdown);
    process.off('SIGTERM', handleShutdown);
    await worker.stop();
  }
}

const isMainModule = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  await runWorkerProcess();
}
