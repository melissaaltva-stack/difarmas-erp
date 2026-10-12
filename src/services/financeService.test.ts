import { describe, expect, it } from 'vitest';
import { calculateExpectedCash, cashExpenses, cashMovementTotals, cashSales, pendingReceivables } from './financeService';
import type { SaleRecord } from '../domain/types';
import type { Expense, Receivable } from '../domain/types';

describe('financeService', () => {
  it('calculates expected cash', () => {
    expect(calculateExpectedCash(1000, 500, 200, 50, 100, 75, 25)).toBe(1550);
  });
  it('counts only cash sales as physical cash, excluding transfers and credit', () => {
    const sales: SaleRecord[] = [
      { id: 1, total: 100, cost: 60, profit: 40, payment: 'Efectivo', type: 'minorista', date: '2026-10-12T10:00:00.000Z' },
      { id: 2, total: 250, cost: 150, profit: 100, payment: 'Transferencia', type: 'minorista', date: '2026-10-12T10:01:00.000Z' },
      { id: 3, total: 300, cost: 180, profit: 120, payment: 'Crédito', type: 'minorista', date: '2026-10-12T10:02:00.000Z' },
    ];
    expect(cashSales(sales)).toBe(100);
  });
  it('counts cash expenses but excludes bank transfers from physical cash', () => {
    const expenses: Expense[] = [
      { id: 1, description: 'Alquiler', amount: 1000, category: 'Alquiler', date: '2026-10-12', paymentMethod: 'Efectivo' },
      { id: 2, description: 'Internet', amount: 500, category: 'Servicios', date: '2026-10-12', paymentMethod: 'Transferencia' },
      { id: 3, description: 'Gasto histórico', amount: 200, category: 'Otros', date: '2026-10-12' },
    ];
    expect(cashExpenses(expenses)).toBe(1200);
  });
  it('excludes bank movements from physical cash totals', () => {
    const movements = [
      { id: 1, type: 'Entrada', description: 'Aporte efectivo', amount: 100, category: 'Aporte', date: '2026-10-12' },
      { id: 2, type: 'Salida', description: 'Retiro efectivo', amount: 25, category: 'Retiro', date: '2026-10-12' },
      { id: 3, type: 'Entrada', description: 'Depósito bancario', amount: 500, category: 'Banco', date: '2026-10-12' },
    ] as const;
    expect(cashMovementTotals([...movements])).toEqual({ incoming: 100, outgoing: 25 });
  });

  it('calculates pending receivables', () => {
    const rows: Receivable[] = [{ id: 1, saleId: 1, customer: 'Cliente', total: 1000, paid: 300, dueDate: '2026-10-20', date: '2026-10-01' }];
    expect(pendingReceivables(rows)).toBe(700);
  });
});
