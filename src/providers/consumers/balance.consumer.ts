import { RABBITMQ } from '../../common/constant';
import { type ExpenseEvent, type SettlementEvent } from '../../interfaces/events.interface';
import { logger } from '../../logger/logger';
import { type BalanceService, balanceService } from '../../modules/v1/balance/balance.service';
import { BaseConsumer } from './base.consumer';

export class BalanceConsumer extends BaseConsumer<ExpenseEvent | SettlementEvent> {
  protected readonly queue = RABBITMQ.QUEUES.BALANCE;

  constructor(private readonly balances: BalanceService) {
    super();
  }

  protected async handle(event: ExpenseEvent | SettlementEvent): Promise<void> {
    const recomputed = await this.balances.refreshIfStale(event.groupId);
    logger.info(recomputed ? 'Balances recalculated' : 'Balances already fresh', {
      groupId: event.groupId,
      trigger: event.type,
    });
  }
}

export const balanceConsumer = new BalanceConsumer(balanceService);
