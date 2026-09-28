import { describe, expect, it } from 'vitest';
import { createWorker, getWorkerHealthPort } from '../src/main.js';

describe('worker runtime', () => {
  it('does not expose an HTTP port unless free-plan compatibility is enabled', () => {
    expect(getWorkerHealthPort({ NODE_ENV: 'production' })).toBeUndefined();
    expect(getWorkerHealthPort({ NODE_ENV: 'production', WORKER_HTTP_PORT: '10000' })).toBe(10000);
  });

  it('stops cleanly and is idempotent', async () => {
    const worker = createWorker();

    await worker.start();
    await worker.stop();
    await worker.stop();

    expect(worker.isRunning()).toBe(false);
  });
});
