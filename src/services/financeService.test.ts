import { describe, expect, it } from 'vitest';
import {
  addCashMovement, calculateExpectedCash, cashExpenses, cashMovementTotals, cashSales,
  collectedReceivables, createCashClosure, pendingPayables, pendingReceivables,
  sumExpenses, sumProfit, sumSales, supplierPayments,
} from './financeService';
import type { Expense, Payable, Receivable, SaleRecord } from '../domain/types';

describe('financeService', () => {
  it('calculates expected cash', () => {
    expect(calculateExpectedCash(1000, 500, 200, 50, 100, 75, 25)).toBe(1550);
  });

  it('sums sales, gross profit, and expenses independently', () => {
    const sales: SaleRecord[] = [
      { id: 1, total: 100, cost: 60, profit: 40, payment: 'Efectivo', type: 'minorista', date: '2026-10-12T10:00:00.000Z' },
      { id: 2, total: 250, cost: 150, profit: 100, payment: 'Transferencia', type: 'minorista', date: '2026-10-12T10:01:00.000Z' },
    ];
    const expenses: Expense[] = [
      { id: 1, description: 'Alquiler', amount: 1000, category: 'Alquiler', date: '2026-10-12' },
      { id: 2, description: 'Internet', amount: 200, category: 'Servicios', date: '2026-10-12' },
    ];
    expect(sumSales(sales)).toBe(350);
    expect(sumProfit(sales)).toBe(140);
    expect(sumExpenses(expenses)).toBe(1200);
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

  it('calculates pending receivables without negative balances', () => {
    const rows: Receivable[] = [
      { id: 1, saleId: 1, customer: 'Cliente', total: 1000, paid: 300, dueDate: '2026-10-20', date: '2026-10-01' },
      { id: 2, saleId: 2, customer: 'Otro', total: 100, paid: 150, dueDate: '2026-10-20', date: '2026-10-01' },
    ];
    expect(pendingReceivables(rows)).toBe(700);
    expect(collectedReceivables(rows)).toBe(450);
  });

  it('calculates supplier balances and payments separately', () => {
    const rows: Payable[] = [
      { id: 1, supplier: 'Proveedor A', total: 2000, paid: 500, dueDate: '2026-10-20', date: '2026-10-01' },
      { id: 2, supplier: 'Proveedor B', total: 300, paid: 400, dueDate: '2026-10-20', date: '2026-10-01' },
    ];
    expect(pendingPayables(rows)).toBe(1500);
    expect(supplierPayments(rows)).toBe(900);
  });

  it('creates cash closures with the counted-minus-expected difference', () => {
    const closure = createCashClosure(100, 200, 50, 30, 20, 300, 290, 'Cierre de prueba', new Date('2026-10-16T12:00:00.000Z'), 15);
    expect(closure.date).toBe('2026-10-16T12:00:00.000Z');
    expect(closure.expected).toBe(300);
    expect(closure.counted).toBe(290);
    expect(closure.difference).toBe(-10);
    expect(closure.purchasesCash).toBe(15);
  });

  it('records cash movement metadata', () => {
    const movement = addCashMovement('Entrada', 'Aporte inicial', 250, 'Aporte', new Date('2026-10-16T12:00:00.000Z'));
    expect(movement).toEqual({
      id: expect.any(Number), type: 'Entrada', description: 'Aporte inicial', amount: 250,
      category: 'Aporte', date: '2026-10-16T12:00:00.000Z',
    });
  });
});
