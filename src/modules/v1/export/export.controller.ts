import { type Request, type Response } from 'express';
import { MESSAGES } from '../../../common/messages';
import { ApiResponse } from '../../../common/responses';
import { requireCtx, requireGroup, requireUser } from '../../../common/utils';
import { validated } from '../../../middlewares/validate.middleware';
import { exportParamsSchema } from './dto/export.dto';
import { type ExportService, exportService } from './export.service';

export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  request = async (req: Request, res: Response): Promise<void> => {
    const data = await this.exportService.request(
      requireGroup(req),
      requireUser(req).userId,
      requireCtx(req),
    );
    ApiResponse.accepted(req, res, MESSAGES.EXPORT_QUEUED, data);
  };

  status = async (req: Request, res: Response): Promise<void> => {
    const { exportId } = validated(req, exportParamsSchema, 'params');
    const data = await this.exportService.getStatus(exportId, requireUser(req).userId);
    ApiResponse.ok(req, res, MESSAGES.EXPORT_STATUS, data);
  };

  download = async (req: Request, res: Response): Promise<void> => {
    const { exportId } = validated(req, exportParamsSchema, 'params');
    const file = await this.exportService.getDownload(exportId, requireUser(req).userId);
    await new Promise<void>((resolve, reject) => {
      res.download(
        file.filePath,
        file.fileName,
        { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'private, no-store' } },
        (error) => (error ? reject(error) : resolve()),
      );
    });
  };
}

export const exportController = new ExportController(exportService);
