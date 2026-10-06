import type { CashClosure, CashMovement, Expense, Payable, Receivable, SaleRecord } from '../domain/types';

export function sumSales(sales: SaleRecord[]): number {
  return sales.reduce((sum, sale) => sum + sale.total, 0);
}

export function sumProfit(sales: SaleRecord[]): number {
  return sales.reduce((sum, sale) => sum + sale.profit, 0);
}

export function sumExpenses(expenses: Expense[]): number {
  return expenses.reduce((sum, expense) => sum + expense.amount, 0);
}

export function pendingReceivables(receivables: Receivable[]): number {
  return receivables.reduce((sum, item) => sum + Math.max(0, item.total - item.paid), 0);
}

export function pendingPayables(payables: Payable[]): number {
  return payables.reduce((sum, item) => sum + Math.max(0, item.total - item.paid), 0);
}

export function cashSales(sales: SaleRecord[]): number {
  return sales.filter(sale => sale.payment !== 'Crédito').reduce((sum, sale) => sum + sale.total, 0);
}

export function collectedReceivables(receivables: Receivable[]): number {
  return receivables.reduce((sum, item) => sum + item.paid, 0);
}

export function supplierPayments(payables: Payable[]): number {
  return payables.reduce((sum, item) => sum + item.paid, 0);
}

export function calculateCashFlow(
  sales: SaleRecord[],
  receivables: Receivable[],
  expenses: Expense[],
  payables: Payable[],
): number {
  return cashSales(sales) + collectedReceivables(receivables) - sumExpenses(expenses) - supplierPayments(payables);
}

export function calculateExpectedCash(
  opening: number,
  sales: number,
  collections: number,
  movementIn: number,
  expenses: number,
  supplierPaymentsValue: number,
  movementOut: number,
): number {
  return opening + sales + collections + movementIn - expenses - supplierPaymentsValue - movementOut;
}

export function createCashClosure(
  opening: number,
  cashSalesValue: number,
  collections: number,
  expenses: number,
  supplierPaymentsValue: number,
  expected: number,
  counted: number,
  note: string,
  now = new Date(),
): CashClosure {
  return {
    id: Date.now(),
    date: now.toISOString(),
    opening,
    cashSales: cashSalesValue,
    collections,
    expenses,
    supplierPayments: supplierPaymentsValue,
    expected,
    counted,
    difference: counted - expected,
    note,
  };
}

export function addCashMovement(
  type: CashMovement['type'],
  description: string,
  amount: number,
  category: string,
  now = new Date(),
): CashMovement {
  return { id: Date.now(), type, description, amount, category, date: now.toISOString() };
}
