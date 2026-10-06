import type { CartItem, Product, PurchaseItem } from '../domain/types';

export function applySaleToInventory(products: Product[], sold: CartItem[]): Product[] {
  const invalid = sold.find(item => item.qty <= 0 || !Number.isFinite(item.qty));
  if (invalid) throw new Error('La cantidad de venta debe ser mayor que cero.');

  const insufficient = sold.find(item => {
    const product = products.find(p => p.id === item.id);
    return product && item.qty > product.stock;
  });
  if (insufficient) throw new Error('Stock insuficiente para el producto seleccionado.');

  return products.map(product => {
    const item = sold.find(line => line.id === product.id);
    return item ? { ...product, stock: product.stock - item.qty } : product;
  });
}

export function applyPurchaseToInventory(products: Product[], items: PurchaseItem[], supplier: string): Product[] {
  const invalid = items.find(item => item.qty <= 0 || !Number.isFinite(item.qty) || item.unitCost < 0 || !Number.isFinite(item.unitCost));
  if (invalid) throw new Error('Cantidad y costo de compra deben ser válidos.');

  return products.map(product => {
    const item = items.find(line => line.id === product.id);
    if (!item) return product;
    const newStock = product.stock + item.qty;
    const averageCost = ((product.cost * product.stock) + (item.unitCost * item.qty)) / newStock;
    return { ...product, stock: newStock, cost: Number(averageCost.toFixed(2)), supplier: supplier || product.supplier };
  });
}

export function purchaseTotal(items: PurchaseItem[]): number {
  return items.reduce((sum, item) => sum + item.unitCost * item.qty, 0);
}
