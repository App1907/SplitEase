import { exposeWorker } from './worker.runtime';
import {
  type NetBalance,
  type Payment,
  type SimplifyDebtsInput,
  type SimplifyDebtsOutput,
} from './worker.types';

interface Party {
  userId: string;
  amount: number;
}

function takeLargest(parties: Party[]): Party | undefined {
  let best: Party | undefined;
  for (const party of parties) {
    if (!best || party.amount > best.amount || (party.amount === best.amount && party.userId < best.userId)) {
      best = party;
    }
  }
  return best;
}

function remove(parties: Party[], target: Party): void {
  const index = parties.indexOf(target);
  if (index >= 0) parties.splice(index, 1);
}

/**
 * Settle-up plan with at most n - 1 payments: greedy largest creditor <-> largest debtor,
 * after first settling exact matches (one payment clears both), which plain greedy misses.
 * Deterministic. The true minimum is NP-hard, so this is the practical approximation.
 */
export function simplifyDebts(balances: readonly NetBalance[]): Payment[] {
  const total = balances.reduce((sum, balance) => sum + balance.net, 0);
  if (total !== 0) throw new Error(`Balances must sum to 0, got ${total}`);

  const creditors: Party[] = [];
  const debtors: Party[] = [];
  for (const { userId, net } of balances) {
    if (!Number.isSafeInteger(net)) throw new Error(`Balance of ${userId} is not an integer`);
    if (net > 0) creditors.push({ userId, amount: net });
    else if (net < 0) debtors.push({ userId, amount: -net });
  }

  const payments: Payment[] = [];
  const pay = (debtor: Party, creditor: Party, amount: number): void => {
    payments.push({ from: debtor.userId, to: creditor.userId, amount });
    debtor.amount -= amount;
    creditor.amount -= amount;
    if (debtor.amount === 0) remove(debtors, debtor);
    if (creditor.amount === 0) remove(creditors, creditor);
  };

  while (creditors.length > 0 && debtors.length > 0) {
    const creditor = takeLargest(creditors);
    const debtor = takeLargest(debtors);
    if (!creditor || !debtor) break;

    const exactDebtor = debtors.find((party) => party.amount === creditor.amount);
    if (exactDebtor) {
      pay(exactDebtor, creditor, creditor.amount);
      continue;
    }
    const exactCreditor = creditors.find((party) => party.amount === debtor.amount);
    if (exactCreditor) {
      pay(debtor, exactCreditor, debtor.amount);
      continue;
    }
    pay(debtor, creditor, Math.min(debtor.amount, creditor.amount));
  }

  return payments;
}

exposeWorker<SimplifyDebtsInput, SimplifyDebtsOutput>((input) => ({
  payments: simplifyDebts(input.balances),
}));
