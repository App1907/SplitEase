import { ExportStatus } from '../enum/enum';
import { type IExport, ExportModel } from '../schemas/export.schema';
import { BaseRepository, toObjectId, type Id } from './base.repository';

export class ExportRepository extends BaseRepository<IExport> {
  constructor() {
    super(ExportModel);
  }

  findInFlight(groupId: Id, requestedBy: Id): Promise<IExport | null> {
    return this.model
      .findOne({
        groupId: toObjectId(groupId),
        requestedBy: toObjectId(requestedBy),
        status: { $in: [ExportStatus.QUEUED, ExportStatus.PROCESSING] },
      })
      .sort({ createdAt: -1 })
      .lean<IExport>()
      .exec();
  }

  /** QUEUED -> PROCESSING (also re-claims PROCESSING after a crashed consumer's message is redelivered). */
  markProcessing(exportId: Id): Promise<IExport | null> {
    return this.findOneAndUpdate(
      { _id: exportId, status: { $in: [ExportStatus.QUEUED, ExportStatus.PROCESSING] } },
      { $set: { status: ExportStatus.PROCESSING, startedAt: new Date(), error: null } },
    );
  }

  async markDone(exportId: Id, filePath: string, fileName: string, rowCount: number): Promise<void> {
    await this.updateOne(
      { _id: exportId },
      {
        $set: {
          status: ExportStatus.DONE,
          filePath,
          fileName,
          rowCount,
          completedAt: new Date(),
          error: null,
        },
      },
    );
  }

  async markFailed(exportId: Id, error: string): Promise<void> {
    await this.updateOne(
      { _id: exportId, status: { $ne: ExportStatus.DONE } },
      { $set: { status: ExportStatus.FAILED, error: error.slice(0, 500), completedAt: new Date() } },
    );
  }
}

export const exportRepository = new ExportRepository();
