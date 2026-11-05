import { type Request, type Response } from 'express';
import { MESSAGES } from '../../../common/messages';
import { ApiResponse } from '../../../common/responses';
import { requireCtx, requireGroup, requireUser } from '../../../common/utils';
import { validated } from '../../../middlewares/validate.middleware';
import {
  createExpenseSchema,
  expenseParamsSchema,
  listExpensesQuerySchema,
  updateExpenseSchema,
} from './dto/expense.dto';
import { type ExpenseService, expenseService } from './expense.service';

export class ExpenseController {
  constructor(private readonly expenseService: ExpenseService) {}

  create = async (req: Request, res: Response): Promise<void> => {
    const expense = await this.expenseService.create(
      requireGroup(req),
      requireUser(req).userId,
      requireCtx(req),
      validated(req, createExpenseSchema),
    );
    ApiResponse.created(req, res, MESSAGES.EXPENSE_ADDED, { expense });
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const query = validated(req, listExpensesQuerySchema, 'query');
    const data = await this.expenseService.list(requireGroup(req), requireCtx(req), query);
    ApiResponse.ok(req, res, MESSAGES.EXPENSES_FETCHED, data);
  };

  getOne = async (req: Request, res: Response): Promise<void> => {
    const { expenseId } = validated(req, expenseParamsSchema, 'params');
    const expense = await this.expenseService.getOne(requireGroup(req), expenseId);
    ApiResponse.ok(req, res, MESSAGES.EXPENSE_FETCHED, { expense });
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const { expenseId } = validated(req, expenseParamsSchema, 'params');
    const expense = await this.expenseService.update(
      requireGroup(req),
      requireUser(req).userId,
      requireCtx(req),
      expenseId,
      validated(req, updateExpenseSchema),
    );
    ApiResponse.ok(req, res, MESSAGES.EXPENSE_UPDATED, { expense });
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    const { expenseId } = validated(req, expenseParamsSchema, 'params');
    const data = await this.expenseService.remove(requireGroup(req), requireUser(req).userId, expenseId);
    ApiResponse.ok(req, res, MESSAGES.EXPENSE_DELETED, data);
  };
}

export const expenseController = new ExpenseController(expenseService);
