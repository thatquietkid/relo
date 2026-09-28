import type { OutboxEvent } from '../outbox-loop.js';
export interface ExportStore { complete(exportId: string, outputPath: string): Promise<void>; }
export function makeReportExportHandler({ exports }: { exports: ExportStore }) { return async (event: OutboxEvent): Promise<void> => { const exportId = typeof event.payload.exportId === 'string' ? event.payload.exportId : ''; if (!exportId) return; await exports.complete(exportId, `private/reports/${exportId}.json`); }; }
