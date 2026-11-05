import { Router } from 'express';
import { activityRoutes } from './modules/v1/activity/activity.routes';
import { authRoutes } from './modules/v1/auth/auth.routes';
import { balanceRoutes } from './modules/v1/balance/balance.routes';
import { expenseRoutes } from './modules/v1/expense/expense.routes';
import { exportRoutes } from './modules/v1/export/export.routes';
import { groupRoutes } from './modules/v1/group/group.routes';
import { settlementRoutes } from './modules/v1/settlement/settlement.routes';
import { userRoutes } from './modules/v1/user/user.routes';

export class AppRoutes {
  readonly router = Router();

  constructor() {
    for (const feature of [
      authRoutes,
      userRoutes,
      groupRoutes,
      expenseRoutes,
      balanceRoutes,
      settlementRoutes,
      activityRoutes,
      exportRoutes,
    ]) {
      this.router.use(feature.router);
    }
  }
}
