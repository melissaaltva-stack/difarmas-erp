import type { CartItem, Product, PurchaseItem } from '../domain/types';

export function applySaleToInventory(products: Product[], sold: CartItem[]): Product[] {
  if (!sold.length) throw new Error('La venta debe contener al menos un producto.');
  if (new Set(sold.map(item => item.id)).size !== sold.length) throw new Error('El carrito contiene productos duplicados.');
  if (sold.some(item => !products.some(product => product.id === item.id))) throw new Error('No se encontró un producto del carrito en el inventario.');
  const invalid = sold.find(item => !Number.isFinite(item.qty) || item.qty <= 0 || !Number.isFinite(item.price) || item.price < 0 || !Number.isFinite(item.cost) || item.cost < 0 || !Number.isFinite(item.price * item.qty) || !Number.isFinite(item.cost * item.qty));
  if (invalid) throw new Error('Cantidad, precio y costo de venta deben ser válidos.');

  if (products.some(product => !Number.isFinite(product.stock) || product.stock < 0 || !Number.isFinite(product.cost) || product.cost < 0)) throw new Error('El inventario contiene una existencia o costo inválido.');

  const insufficient = sold.find(item => {
    const product = products.find(p => p.id === item.id);
    return !product || item.qty > product.stock;
  });
  if (insufficient) throw new Error('Stock insuficiente para el producto seleccionado.');

  return products.map(product => {
    const item = sold.find(line => line.id === product.id);
    return item ? { ...product, stock: product.stock - item.qty } : product;
  });
}

export function applyPurchaseToInventory(products: Product[], items: PurchaseItem[], supplier: string): Product[] {
  if (!items.length) throw new Error('La compra debe contener al menos un producto.');
  if (new Set(items.map(item => item.id)).size !== items.length) throw new Error('La compra contiene productos duplicados.');
  if (items.some(item => !products.some(product => product.id === item.id))) throw new Error('No se encontró un producto de la compra en el inventario.');
  const invalid = items.find(item => !Number.isFinite(item.qty) || item.qty <= 0 || !Number.isFinite(item.unitCost) || item.unitCost < 0 || !Number.isFinite(item.qty * item.unitCost));
  if (invalid) throw new Error('Cantidad y costo de compra deben ser válidos.');
  if (products.some(product => !Number.isFinite(product.stock) || product.stock < 0 || !Number.isFinite(product.cost) || product.cost < 0)) throw new Error('El inventario contiene una existencia o costo inválido.');

  return products.map(product => {
    const item = items.find(line => line.id === product.id);
    if (!item) return product;
    const newStock = product.stock + item.qty;
    const previousInventoryValue = product.cost * product.stock;
    const purchaseValue = item.unitCost * item.qty;
    const averageCost = (previousInventoryValue + purchaseValue) / newStock;
    if (!Number.isFinite(newStock) || newStock <= 0 || !Number.isFinite(previousInventoryValue) || !Number.isFinite(purchaseValue) || !Number.isFinite(averageCost)) {
      throw new Error('La compra produciría una existencia o costo fuera de rango. Verifica los datos.');
    }
    const roundedCost = Number(averageCost.toFixed(2));
    if (!Number.isFinite(roundedCost)) throw new Error('El costo promedio calculado no es válido.');
    return { ...product, stock: newStock, cost: roundedCost, supplier: supplier.trim() || product.supplier };
  });
}

export function purchaseTotal(items: PurchaseItem[]): number {
  return items.reduce((sum, item) => sum + item.unitCost * item.qty, 0);
}
