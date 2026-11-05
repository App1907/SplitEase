import { type Request, type Response } from 'express';
import { MESSAGES } from '../../../common/messages';
import { ApiResponse } from '../../../common/responses';
import { requireGroup, requireUser } from '../../../common/utils';
import { validated } from '../../../middlewares/validate.middleware';
import { createSettlementSchema, listSettlementsQuerySchema } from './dto/settlement.dto';
import { type SettlementService, settlementService } from './settlement.service';

export class SettlementController {
  constructor(private readonly settlementService: SettlementService) {}

  create = async (req: Request, res: Response): Promise<void> => {
    const settlement = await this.settlementService.create(
      requireGroup(req),
      requireUser(req).userId,
      validated(req, createSettlementSchema),
    );
    ApiResponse.created(req, res, MESSAGES.SETTLEMENT_RECORDED, { settlement });
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const query = validated(req, listSettlementsQuerySchema, 'query');
    const data = await this.settlementService.list(requireGroup(req), query);
    ApiResponse.ok(req, res, MESSAGES.SETTLEMENTS_FETCHED, data);
  };
}

export const settlementController = new SettlementController(settlementService);
