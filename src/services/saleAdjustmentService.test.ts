import { describe, expect, it } from 'vitest';
import { aggregateSaleLinesByProduct, applySaleAdjustmentsToSales, canApplySaleAdjustmentItems, getSaleLineBalances } from './saleAdjustmentService';
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

  it('returns only the selected duplicate-product sale line at its original price', () => {
    const duplicate: SaleRecord = { ...sale, total: 300, cost: 120, profit: 180, items: [
      { saleLineId: 'line-low', productId: 10, productName: 'Producto A', category: 'General', laboratory: 'Lab', qty: 1, unitCost: 60, unitPrice: 100, revenue: 100, cost: 60, profit: 40 },
      { saleLineId: 'line-high', productId: 10, productName: 'Producto A', category: 'General', laboratory: 'Lab', qty: 1, unitCost: 60, unitPrice: 200, revenue: 200, cost: 60, profit: 140 },
    ]};
    const lineReturn: SaleAdjustmentRecord = { ...adjustment, amount: 200, items: [
      { saleLineId: 'line-high', productId: 10, productName: 'Producto A', quantity: 1, unitPrice: 200, unitCost: 60, returnToStock: true },
    ]};
    expect(getSaleLineBalances(duplicate.items ?? [], [lineReturn]).map(row => [row.line.saleLineId, row.remainingQuantity])).toEqual([['line-low', 1], ['line-high', 0]]);
    expect(canApplySaleAdjustmentItems(duplicate.items ?? [], [], lineReturn.items)).toBe(true);
    expect(canApplySaleAdjustmentItems(duplicate.items ?? [], [lineReturn], lineReturn.items)).toBe(false);
    const result = applySaleAdjustmentsToSales([duplicate], [lineReturn])[0];
    expect(result.total).toBe(100);
    expect(result.items?.map(line => [line.saleLineId, line.qty, line.revenue])).toEqual([['line-low', 1, 100]]);
  });

  it('allocates historical adjustments without line IDs by product in original sale order', () => {
    const duplicateLines: SaleRecord['items'] = [
      { saleLineId: 'first', productId: 10, productName: 'Producto A', category: 'General', laboratory: 'Lab', qty: 1, unitCost: 60, unitPrice: 100, revenue: 100, cost: 60, profit: 40 },
      { saleLineId: 'second', productId: 10, productName: 'Producto A', category: 'General', laboratory: 'Lab', qty: 1, unitCost: 60, unitPrice: 200, revenue: 200, cost: 60, profit: 140 },
    ];
    const legacyReturn = { ...adjustment, items: [{ ...adjustment.items[0], quantity: 1 }] };
    expect(getSaleLineBalances(duplicateLines ?? [], [legacyReturn]).map(row => row.remainingQuantity)).toEqual([0, 1]);
  });

  it('includes invoice tax in the refund while reducing net revenue and tax separately', () => {
    const taxedSale: SaleRecord = {
      ...sale, total: 115, taxTotal: 15, cost: 60, profit: 40,
      items: [{ productId: 10, productName: 'Producto A', category: 'General', laboratory: 'Lab', qty: 1, unitCost: 60, unitPrice: 100, revenue: 100, cost: 60, profit: 40, taxAmount: 15, lineTotal: 115 }],
    };
    const taxedReturn: SaleAdjustmentRecord = {
      ...adjustment, amount: 115,
      items: [{ ...adjustment.items[0], quantity: 1, unitTaxAmount: 15 }],
    };
    const result = applySaleAdjustmentsToSales([taxedSale], [taxedReturn])[0];
    expect(result.total).toBe(0);
    expect(result.taxTotal).toBe(0);
    expect(result.cost).toBe(0);
    expect(result.profit).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  it('keeps the cost of returned items that are not re-entered into inventory', () => {
    const notRestocked: SaleAdjustmentRecord = {
      ...adjustment,
      items: [{ ...adjustment.items[0], quantity: 1, returnToStock: false }],
    };
    const result = applySaleAdjustmentsToSales([sale], [notRestocked])[0];
    expect(result.total).toBe(200);
    expect(result.cost).toBe(180);
    expect(result.profit).toBe(20);
    expect(result.items?.find(item => item.productId === 10)?.cost).toBe(120);
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

  it('reduces legacy invoice tax proportionally when line tax detail is unavailable', () => {
    const legacyInvoice = { ...sale, total: 230, taxTotal: 30, items: undefined };
    const legacyReturn = { ...adjustment, amount: 115 };
    const result = applySaleAdjustmentsToSales([legacyInvoice], [legacyReturn])[0];
    expect(result.total).toBe(115);
    expect(result.taxTotal).toBe(15);
  });

  it('caps adjustments at the original sale total', () => {
    const oversized = { ...adjustment, amount: 999 };
    expect(applySaleAdjustmentsToSales([sale], [oversized])[0].total).toBe(0);
  });
});
