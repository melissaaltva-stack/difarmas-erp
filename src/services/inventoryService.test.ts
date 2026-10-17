import { describe, expect, it } from 'vitest';
import type { CartItem, Product, PurchaseItem } from '../domain/types';
import { applyPurchaseToInventory, applySaleToInventory } from './inventoryService';

const product: Product = {
  id: 1, code: 'P-1', name: 'Producto prueba', category: 'Medicamentos',
  laboratory: 'Genérico', presentation: 'Caja', cost: 10, retail: 15,
  wholesale: 13, stock: 5, minStock: 1, lot: 'L1', expiry: '2027-12-31',
  supplier: 'Proveedor A',
};
const cartItem = (qty: number): CartItem => ({ ...product, qty, price: 15 });
const purchaseItem = (qty: number, unitCost: number): PurchaseItem => ({ ...product, qty, unitCost });

describe('inventoryService', () => {
  it('reduces stock for a valid sale', () => {
    expect(applySaleToInventory([product], [cartItem(2)])[0].stock).toBe(3);
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

  it('rejects a purchase that would overflow the resulting stock', () => {
    const highStock = { ...product, stock: Number.MAX_VALUE, cost: 0 };
    expect(() => applyPurchaseToInventory([highStock], [purchaseItem(Number.MAX_VALUE, 0)], 'Proveedor')).toThrow(/fuera de rango/);
  });

  it('rejects a purchase whose inventory valuation overflows', () => {
    const highStock = { ...product, stock: Number.MAX_VALUE, cost: 10 };
    expect(() => applyPurchaseToInventory([highStock], [purchaseItem(1, 10)], 'Proveedor')).toThrow(/fuera de rango/);
  });
});
