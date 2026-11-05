import { Router } from 'express';
import { accessTokenMiddleware } from '../../../middlewares/accessToken.middleware';
import { groupMemberMiddleware } from '../../../middlewares/groupMember.middleware';
import { validate } from '../../../middlewares/validate.middleware';
import { createSettlementSchema, listSettlementsQuerySchema } from './dto/settlement.dto';
import { type SettlementController, settlementController } from './settlement.controller';

export class SettlementRoutes {
  readonly router = Router();

  constructor(controller: SettlementController) {
    const member = [accessTokenMiddleware, groupMemberMiddleware];

    this.router.post(
      '/groups/:groupId/settlements',
      ...member,
      validate(createSettlementSchema),
      controller.create,
    );
    this.router.get(
      '/groups/:groupId/settlements',
      ...member,
      validate(listSettlementsQuerySchema, 'query'),
      controller.list,
    );
  }
}

export const settlementRoutes = new SettlementRoutes(settlementController);
