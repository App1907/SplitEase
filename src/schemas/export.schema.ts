import { Schema, model, type Types } from 'mongoose';
import { ExportStatus } from '../enum/enum';

export interface IExport {
  _id: Types.ObjectId;
  groupId: Types.ObjectId;
  requestedBy: Types.ObjectId;
  status: ExportStatus;
  /** Time zone of the requester; dates in the CSV are rendered in it. */
  timezone: string;
  filePath?: string | null;
  fileName?: string | null;
  rowCount?: number;
  error?: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const exportSchema = new Schema<IExport>(
  {
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: Object.values(ExportStatus), default: ExportStatus.QUEUED },
    timezone: { type: String, required: true },
    filePath: { type: String, default: null },
    fileName: { type: String, default: null },
    rowCount: { type: Number },
    error: { type: String, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

exportSchema.index({ requestedBy: 1, createdAt: -1 });

export const ExportModel = model<IExport>('Export', exportSchema);
