import type { Product, PurchaseItem } from '../domain/types';

export function applySaleToInventory(products: Product[], sold: PurchaseItem[]): Product[] {
  return products.map(product => {
    const item = sold.find(line => line.id === product.id);
    return item ? { ...product, stock: product.stock - item.qty } : product;
  });
}

export function applyPurchaseToInventory(
  products: Product[],
  items: PurchaseItem[],
  supplier: string,
): Product[] {
  return products.map(product => {
    const item = items.find(line => line.id === product.id);
    return item
      ? {
          ...product,
          stock: product.stock + item.qty,
          cost: item.unitCost,
          supplier: supplier || product.supplier,
        }
      : product;
  });
}

export function purchaseTotal(items: PurchaseItem[]): number {
  return items.reduce((sum, item) => sum + item.unitCost * item.qty, 0);
}
