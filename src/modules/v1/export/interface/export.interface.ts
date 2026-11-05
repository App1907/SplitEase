import { type ExportStatus } from '../../../../enum/enum';

export interface ExportStatusResponse {
  exportId: string;
  groupId: string;
  status: ExportStatus;
  progress: number;
  rowCount?: number;
  error?: string;
  downloadUrl?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface ExportDownload {
  filePath: string;
  fileName: string;
}
