import { describe, expect, it } from 'vitest';
import { calculateExpectedCash, pendingReceivables } from './financeService';
import type { Receivable } from '../domain/types';

describe('financeService', () => {
  it('calculates expected cash', () => {
    expect(calculateExpectedCash(1000, 500, 200, 50, 100, 75, 25)).toBe(1550);
  });
  it('calculates pending receivables', () => {
    const rows: Receivable[] = [{ id: 1, saleId: 1, customer: 'Cliente', total: 1000, paid: 300, dueDate: '2026-10-20', date: '2026-10-01' }];
    expect(pendingReceivables(rows)).toBe(700);
  });
});
