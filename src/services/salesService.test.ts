import { describe, expect, it } from 'vitest';
import type { CartItem } from '../domain/types';
import { buildSaleRecord, createReceivableFromSale } from './salesService';

const item = (overrides: Partial<CartItem> = {}): CartItem => ({
  id: 1,
  code: 'P-1',
  name: 'Producto de prueba',
  category: 'Medicamentos',
  laboratory: 'Genérico',
  presentation: 'Caja',
  cost: 10,
  retail: 15,
  wholesale: 13,
  stock: 8,
  minStock: 1,
  lot: 'L1',
  expiry: '2027-12-31',
  supplier: 'Proveedor A',
  qty: 2,
  price: 15,
  ...overrides,
});

describe('salesService', () => {
  it('builds a sale with totals, line details, and gross profit', () => {
    const sale = buildSaleRecord(
      [item(), item({ id: 2, name: 'Otro producto', qty: 1, cost: 20, price: 25 })],
      'Efectivo',
      'minorista',
      '',
      '',
      new Date('2026-10-16T12:00:00.000Z'),
    );
    expect(sale.date).toBe('2026-10-16T12:00:00.000Z');
    expect(sale.total).toBe(55);
    expect(sale.cost).toBe(40);
    expect(sale.profit).toBe(15);
    expect(sale.items).toHaveLength(2);
    expect(sale.items?.[0]).toMatchObject({ productId: 1, qty: 2, revenue: 30, cost: 20, profit: 10 });
    expect(sale.customer).toBeUndefined();
    expect(sale.dueDate).toBeUndefined();
  });

  it('stores customer and due date for credit sales only', () => {
    const credit = buildSaleRecord([item()], 'Crédito', 'mayorista', 'Cliente A', '2026-11-15', new Date('2026-10-16T12:00:00.000Z'));
    const cash = buildSaleRecord([item()], 'Efectivo', 'minorista', 'Cliente ignorado', '2026-11-15', new Date('2026-10-16T12:00:00.000Z'));
    expect(credit).toMatchObject({ payment: 'Crédito', type: 'mayorista', customer: 'Cliente A', dueDate: '2026-11-15' });
    expect(cash.customer).toBeUndefined();
    expect(cash.dueDate).toBeUndefined();
  });

  it('creates a receivable that matches the credit sale and starts unpaid', () => {
    const sale = buildSaleRecord([item()], 'Crédito', 'minorista', 'Cliente A', '2026-11-15', new Date('2026-10-16T12:00:00.000Z'));
    const receivable = createReceivableFromSale(sale, 'Cliente A', '2026-11-15');
    expect(receivable).toMatchObject({
      id: sale.id,
      saleId: sale.id,
      customer: 'Cliente A',
      total: sale.total,
      paid: 0,
      dueDate: '2026-11-15',
      date: sale.date,
    });
  });

  it('supports a sale with zero unit price without changing arithmetic', () => {
    const sale = buildSaleRecord([item({ price: 0 })], 'Efectivo', 'minorista', '', '', new Date('2026-10-16T12:00:00.000Z'));
    expect(sale.total).toBe(0);
    expect(sale.cost).toBe(20);
    expect(sale.profit).toBe(-20);
  });
});
