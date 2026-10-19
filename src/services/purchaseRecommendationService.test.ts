import { describe, expect, it } from 'vitest';
import type { Product, SaleRecord } from '../domain/types';
import { buildPurchaseRecommendations } from './purchaseRecommendationService';

const product = (overrides: Partial<Product> = {}): Product => ({
  id: 1, code: 'A1', name: 'Producto A', category: 'Medicamentos', laboratory: 'Lab',
  presentation: 'Caja', cost: 10, retail: 20, wholesale: 18, stock: 2, minStock: 5,
  lot: '', expiry: '2027-12-31', supplier: 'Proveedor', ...overrides,
});

const sale = (date: string, productId: number, qty: number): SaleRecord => ({
  id: Date.parse(date), total: qty * 20, cost: qty * 10, profit: qty * 10,
  payment: 'Efectivo', type: 'minorista', date,
  items: [{ productId, productName: 'Producto A', category: 'Medicamentos', laboratory: 'Lab', qty, unitCost: 10, unitPrice: 20, revenue: qty * 20, cost: qty * 10, profit: qty * 10 }],
});

describe('buildPurchaseRecommendations', () => {
  const asOf = new Date('2026-10-19T12:00:00');

  it('suggests replenishment from configured minimum when there is no sales history', () => {
    const result = buildPurchaseRecommendations([product()], [], { asOf });
    expect(result).toHaveLength(1);
    expect(result[0].suggestedQuantity).toBeGreaterThan(0);
    expect(result[0].limitedData).toBe(true);
    expect(result[0].estimatedCost).toBe(result[0].suggestedQuantity * 10);
  });

  it('uses recent product-level sales and marks urgent low coverage', () => {
    const result = buildPurchaseRecommendations(
      [product({ stock: 3, minStock: 2 })],
      [sale('2026-10-01T12:00:00.000Z', 1, 30)],
      { asOf, historyDays: 60, leadTimeDays: 14 },
    );
    expect(result).toHaveLength(1);
    expect(result[0].limitedData).toBe(false);
    expect(result[0].soldUnits).toBe(30);
    expect(result[0].priority).toBe('Alta');
    expect(result[0].suggestedQuantity).toBeGreaterThan(0);
  });

  it('does not suggest products with healthy stock and no recent sales', () => {
    const result = buildPurchaseRecommendations([product({ stock: 30, minStock: 5 })], [], { asOf });
    expect(result).toHaveLength(0);
  });

  it('ignores sales outside the selected history window', () => {
    const result = buildPurchaseRecommendations(
      [product({ stock: 30, minStock: 5 })],
      [sale('2026-01-01T12:00:00.000Z', 1, 100)],
      { asOf, historyDays: 60 },
    );
    expect(result).toHaveLength(0);
  });
});
