import type { EventHandler } from '../outbox-loop.js';
export function createHandlers(overrides: Record<string, EventHandler> = {}): Record<string, EventHandler> { return { ...overrides }; }
