import { describe, expect, it } from 'vitest';
import type { CartItem, Product, PurchaseItem } from '../domain/types';
import { applyPurchaseToInventory, applySaleToInventory, calculateWeightedAverageCost } from './inventoryService';

const product: Product = {
  id: 1, code: 'P-1', name: 'Producto prueba', category: 'Medicamentos',
  laboratory: 'Genérico', presentation: 'Caja', cost: 10, retail: 15,
  wholesale: 13, stock: 5, minStock: 1, lot: 'L1', expiry: '2027-12-31',
  supplier: 'Proveedor A',
};
const cartItem = (qty: number): CartItem => ({ ...product, qty, price: 15 });
const purchaseItem = (qty: number, unitCost: number): PurchaseItem => ({ ...product, qty, unitCost });

describe('inventoryService', () => {
  it('uses the same rounded weighted-average cost for purchase and returned stock', () => {
    expect(calculateWeightedAverageCost(5, 10, 1, 20)).toBe(11.67);
    expect(calculateWeightedAverageCost(0, 10, 2, 12.345)).toBe(12.35);
  });

  it('rejects invalid weighted-average cost inputs and overflow', () => {
    expect(() => calculateWeightedAverageCost(-1, 10, 1, 12)).toThrow(/valores válidos/);
    expect(() => calculateWeightedAverageCost(Number.MAX_VALUE, 10, 1, 12)).toThrow(/fuera de rango/);
  });
  it('reduces stock for a valid sale', () => {
    expect(applySaleToInventory([product], [cartItem(2)])[0].stock).toBe(3);
  });

  it('rejects a sale when individual lines are finite but the aggregate total overflows', () => {
    const first = { ...cartItem(1), price: Number.MAX_VALUE * 0.75 };
    const second = { ...cartItem(1), id: 2, price: Number.MAX_VALUE * 0.75 };
    expect(() => applySaleToInventory([product, { ...product, id: 2 }], [first, second])).toThrow(/total o costo de la venta está fuera de rango/);
  });

  it('allows service sales without stock and leaves inventory unchanged', () => {
    const service: Product = { ...product, id: 2, itemType: 'Servicio', code: '', stock: 0, minStock: 0, expiry: '', lot: '', supplier: '' };
    const result = applySaleToInventory([product, service], [{ ...cartItem(2), id: 2, itemType: 'Servicio', stock: 0 }]);
    expect(result.find(item => item.id === 2)?.stock).toBe(0);
    expect(result.find(item => item.id === 1)?.stock).toBe(5);
  });

  it('rejects receiving a service as a purchase item', () => {
    const service: Product = { ...product, id: 2, itemType: 'Servicio', code: '', stock: 0, minStock: 0, expiry: '', lot: '', supplier: '' };
    expect(() => applyPurchaseToInventory([service], [{ ...purchaseItem(1, 10), id: 2, itemType: 'Servicio', stock: 0 }], 'Proveedor')).toThrow(/Los servicios no se pueden recibir/);
  });

  it('rejects sales that exceed stock', () => {
    expect(() => applySaleToInventory([product], [cartItem(6)])).toThrow(/Stock insuficiente/);
  });

  it('rejects a sale item that is not in inventory', () => {
    expect(() => applySaleToInventory([product], [{ ...cartItem(1), id: 99 }])).toThrow(/No se encontró/);
  });

  it('rejects duplicate product lines in a sale', () => {
    expect(() => applySaleToInventory([product], [cartItem(2), cartItem(2)])).toThrow(/duplicados/);
  });

  it('rejects invalid sale prices and costs', () => {
    expect(() => applySaleToInventory([product], [{ ...cartItem(1), price: Number.NaN }])).toThrow(/precio y costo/);
    expect(() => applySaleToInventory([{ ...product, cost: -1 }], [cartItem(1)])).toThrow(/costo inválido/);
  });

  it('updates stock and weighted-average cost after a purchase', () => {
    const result = applyPurchaseToInventory([product], [purchaseItem(5, 20)], 'Proveedor B')[0];
    expect(result.stock).toBe(10);
    expect(result.cost).toBe(15);
    expect(result.supplier).toBe('Proveedor B');
  });

  it('rejects purchase items that are not in inventory', () => {
    expect(() => applyPurchaseToInventory([product], [{ ...purchaseItem(1, 10), id: 99 }], 'Proveedor')).toThrow(/No se encontró/);
  });

  it('rejects purchases when existing inventory cost is invalid', () => {
    expect(() => applyPurchaseToInventory([{ ...product, cost: Number.NaN }], [purchaseItem(1, 10)], 'Proveedor')).toThrow(/costo inválido/);
  });

  it('rejects purchase totals that overflow to infinity', () => {
    expect(() => applyPurchaseToInventory([product], [purchaseItem(Number.MAX_VALUE, Number.MAX_VALUE)], 'Proveedor')).toThrow(/Cantidad y costo/);
  });

  it('rejects an aggregate purchase total overflow across different products', () => {
    const first = purchaseItem(1, Number.MAX_VALUE * 0.75);
    const second = { ...purchaseItem(1, Number.MAX_VALUE * 0.75), id: 2 };
    expect(() => applyPurchaseToInventory([product, { ...product, id: 2 }], [first, second], 'Proveedor')).toThrow(/total de la compra está fuera de rango/);
  });

  it('rejects a purchase that would overflow the resulting stock', () => {
    const highStock = { ...product, stock: Number.MAX_VALUE, cost: 0 };
    expect(() => applyPurchaseToInventory([highStock], [purchaseItem(Number.MAX_VALUE, 0)], 'Proveedor')).toThrow(/fuera de rango/);
  });

  it('rejects a purchase whose inventory valuation overflows', () => {
    const highStock = { ...product, stock: Number.MAX_VALUE, cost: 10 };
    expect(() => applyPurchaseToInventory([highStock], [purchaseItem(1, 10)], 'Proveedor')).toThrow(/fuera de rango/);
  });
});
