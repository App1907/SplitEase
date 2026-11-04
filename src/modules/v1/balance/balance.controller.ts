import { type Request, type Response } from 'express';
import { MESSAGES } from '../../../common/messages';
import { ApiResponse } from '../../../common/responses';
import { requireGroup, requireUser } from '../../../common/utils';
import { type BalanceService, balanceService } from './balance.service';

export class BalanceController {
  constructor(private readonly balanceService: BalanceService) {}

  groupBalances = async (req: Request, res: Response): Promise<void> => {
    const data = await this.balanceService.getGroupBalances(requireGroup(req));
    ApiResponse.ok(req, res, MESSAGES.BALANCES_FETCHED, data);
  };

  settlePlan = async (req: Request, res: Response): Promise<void> => {
    const data = await this.balanceService.getSettlePlan(requireGroup(req));
    ApiResponse.ok(req, res, MESSAGES.SETTLE_PLAN_FETCHED, data);
  };

  myBalances = async (req: Request, res: Response): Promise<void> => {
    const data = await this.balanceService.getMyBalances(requireUser(req).userId);
    ApiResponse.ok(req, res, MESSAGES.MY_BALANCES_FETCHED, data);
  };
}

export const balanceController = new BalanceController(balanceService);
