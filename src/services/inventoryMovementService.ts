import type { InventoryMovement, Product } from '../domain/types';

export function createInventoryMovementsForSale(products: Product[], productIds: { id:number; qty:number }[], referenceId:number, now = new Date()): InventoryMovement[] {
  return productIds.flatMap(({id,qty}) => {
    const product = products.find(p => p.id === id);
    if (!product || qty <= 0) return [];
    return [{ id: Date.now() + id, productId:id, productName:product.name, type:'Venta', quantity:qty, stockBefore:product.stock, stockAfter:product.stock - qty, unitCost:product.cost, referenceId, date:now.toISOString() }];
  });
}

export function createInventoryMovementsForPurchase(products: Product[], items: { id:number; qty:number; unitCost:number }[], referenceId:number, now = new Date()): InventoryMovement[] {
  return items.flatMap(({id,qty,unitCost}) => {
    const product = products.find(p => p.id === id);
    if (!product || qty <= 0) return [];
    return [{ id: Date.now() + id, productId:id, productName:product.name, type:'Compra', quantity:qty, stockBefore:product.stock, stockAfter:product.stock + qty, unitCost, referenceId, date:now.toISOString() }];
  });
}
