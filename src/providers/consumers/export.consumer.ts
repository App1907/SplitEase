import { RABBITMQ } from '../../common/constant';
import { type ExportRequestedEvent } from '../../interfaces/events.interface';
import { type ExportService, exportService } from '../../modules/v1/export/export.service';
import { BaseConsumer } from './base.consumer';

export class ExportConsumer extends BaseConsumer<ExportRequestedEvent> {
  protected readonly queue = RABBITMQ.QUEUES.EXPORT;
  // CSV generation is CPU/memory heavy: take one job at a time per consumer instance.
  protected override readonly prefetch = 1;

  constructor(private readonly exports: ExportService) {
    super();
  }

  protected async handle(event: ExportRequestedEvent): Promise<void> {
    await this.exports.process(event.data.exportId);
  }

  protected override async onFinalFailure(event: ExportRequestedEvent, error: unknown): Promise<void> {
    await this.exports.markFailed(event.data.exportId, error);
  }
}

export const exportConsumer = new ExportConsumer(exportService);
