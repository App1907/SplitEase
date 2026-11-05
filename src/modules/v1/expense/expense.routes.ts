import { Router } from 'express';
import { accessTokenMiddleware } from '../../../middlewares/accessToken.middleware';
import { groupMemberMiddleware } from '../../../middlewares/groupMember.middleware';
import { validate } from '../../../middlewares/validate.middleware';
import {
  createExpenseSchema,
  expenseParamsSchema,
  listExpensesQuerySchema,
  updateExpenseSchema,
} from './dto/expense.dto';
import { type ExpenseController, expenseController } from './expense.controller';

export class ExpenseRoutes {
  readonly router = Router();

  constructor(controller: ExpenseController) {
    const member = [accessTokenMiddleware, groupMemberMiddleware];
    const byId = validate(expenseParamsSchema, 'params');

    this.router.post(
      '/groups/:groupId/expenses',
      ...member,
      validate(createExpenseSchema),
      controller.create,
    );
    this.router.get(
      '/groups/:groupId/expenses',
      ...member,
      validate(listExpensesQuerySchema, 'query'),
      controller.list,
    );
    this.router.get('/groups/:groupId/expenses/:expenseId', ...member, byId, controller.getOne);
    this.router.patch(
      '/groups/:groupId/expenses/:expenseId',
      ...member,
      byId,
      validate(updateExpenseSchema),
      controller.update,
    );
    this.router.delete('/groups/:groupId/expenses/:expenseId', ...member, byId, controller.remove);
  }
}

export const expenseRoutes = new ExpenseRoutes(expenseController);
