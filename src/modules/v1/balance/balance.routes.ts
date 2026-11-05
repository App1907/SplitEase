import { Router } from 'express';
import { accessTokenMiddleware } from '../../../middlewares/accessToken.middleware';
import { groupMemberMiddleware } from '../../../middlewares/groupMember.middleware';
import { validate } from '../../../middlewares/validate.middleware';
import { type BalanceController, balanceController } from './balance.controller';
import { groupParamsSchema } from './dto/balance.dto';

export class BalanceRoutes {
  readonly router = Router();

  constructor(controller: BalanceController) {
    const member = [accessTokenMiddleware, validate(groupParamsSchema, 'params'), groupMemberMiddleware];
    this.router.get('/groups/:groupId/balances', ...member, controller.groupBalances);
    this.router.get('/groups/:groupId/settle-plan', ...member, controller.settlePlan);
    this.router.get('/balances/me', accessTokenMiddleware, controller.myBalances);
  }
}

export const balanceRoutes = new BalanceRoutes(balanceController);
