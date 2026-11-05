import { Router } from 'express';
import { accessTokenMiddleware } from '../../../middlewares/accessToken.middleware';
import { groupMemberMiddleware } from '../../../middlewares/groupMember.middleware';
import { validate } from '../../../middlewares/validate.middleware';
import { exportParamsSchema } from './dto/export.dto';
import { type ExportController, exportController } from './export.controller';

/** Membership for /exports/:exportId is checked in the service against the export's group. */
export class ExportRoutes {
  readonly router = Router();

  constructor(controller: ExportController) {
    const byId = validate(exportParamsSchema, 'params');

    this.router.post(
      '/groups/:groupId/exports',
      accessTokenMiddleware,
      groupMemberMiddleware,
      controller.request,
    );
    this.router.get('/exports/:exportId', accessTokenMiddleware, byId, controller.status);
    this.router.get('/exports/:exportId/download', accessTokenMiddleware, byId, controller.download);
  }
}

export const exportRoutes = new ExportRoutes(exportController);
