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
