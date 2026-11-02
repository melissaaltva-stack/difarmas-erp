import { describe, expect, it } from 'vitest';
import { aggregateSaleLinesByProduct, applySaleAdjustmentsToSales } from './saleAdjustmentService';
import type { SaleAdjustmentRecord, SaleRecord } from '../domain/types';

describe('applySaleAdjustmentsToSales', () => {
  const sale: SaleRecord = {
    id: 1, total: 300, cost: 180, profit: 120, payment: 'Efectivo',
    type: 'minorista', date: '2026-10-12T10:00:00.000Z',
    items: [
      { productId: 10, productName: 'Producto A', category: 'General', laboratory: 'Lab', qty: 2, unitCost: 60, unitPrice: 100, revenue: 200, cost: 120, profit: 80 },
      { productId: 11, productName: 'Producto B', category: 'General', laboratory: 'Lab', qty: 1, unitCost: 60, unitPrice: 100, revenue: 100, cost: 60, profit: 40 },
    ],
  };
  const adjustment: SaleAdjustmentRecord = {
    id: 90, saleId: 1, invoiceNumber: 'FAC-1', type: 'Devolución parcial',
    date: '2026-10-13T10:00:00.000Z', reason: 'Devolución',
    items: [{ productId: 10, productName: 'Producto A', quantity: 1, unitPrice: 100, unitCost: 60, returnToStock: true }],
    amount: 100, paymentMethod: 'Efectivo', refundPaymentMethod: 'Transferencia bancaria',
    refundStatus: 'Pagado', notes: '',
  };

  it('reduces net revenue, cost, profit and returned units without mutating original sales', () => {
    const result = applySaleAdjustmentsToSales([sale], [adjustment]);
    expect(result[0].total).toBe(200);
    expect(result[0].cost).toBe(120);
    expect(result[0].profit).toBe(80);
    expect(result[0].items?.map(item => [item.productId, item.qty])).toEqual([[10, 1], [11, 1]]);
    expect(sale.total).toBe(300);
    expect(sale.items?.[0].qty).toBe(2);
  });

  it('aggregates duplicate product rows before applying a return', () => {
    const duplicateSale: SaleRecord = {
      ...sale,
      total: 300,
      cost: 120,
      profit: 180,
      items: [
        { productId: 10, productName: 'Producto A', category: 'General', laboratory: 'Lab', qty: 1, unitCost: 60, unitPrice: 100, revenue: 100, cost: 60, profit: 40 },
        { productId: 10, productName: 'Producto A', category: 'General', laboratory: 'Lab', qty: 1, unitCost: 60, unitPrice: 200, revenue: 200, cost: 60, profit: 140 },
      ],
    };
    const grouped = aggregateSaleLinesByProduct(duplicateSale.items ?? []);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].qty).toBe(2);
    expect(grouped[0].unitPrice).toBe(150);
    const returnRecord = { ...adjustment, amount: 150, items: [{ ...adjustment.items[0], quantity: 1, unitPrice: 150 }] };
    const result = applySaleAdjustmentsToSales([duplicateSale], [returnRecord])[0];
    expect(result.total).toBe(150);
    expect(result.items).toHaveLength(1);
    expect(result.items?.[0].qty).toBe(1);
    expect(result.items?.[0].revenue).toBe(150);
  });

  it('keeps sales without adjustments unchanged', () => {
    expect(applySaleAdjustmentsToSales([sale], [])[0]).toBe(sale);
  });

  it('handles legacy sales without item detail proportionally', () => {
    const legacy = { ...sale, items: undefined };
    const result = applySaleAdjustmentsToSales([legacy], [adjustment])[0];
    expect(result.total).toBe(200);
    expect(result.cost).toBe(120);
    expect(result.profit).toBe(80);
  });

  it('caps adjustments at the original sale total', () => {
    const oversized = { ...adjustment, amount: 999 };
    expect(applySaleAdjustmentsToSales([sale], [oversized])[0].total).toBe(0);
  });
});
