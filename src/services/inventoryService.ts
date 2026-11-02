import type { CartItem, Product, PurchaseItem } from '../domain/types';
import { isExpiryAtLeastSixMonths } from './expiryService';

export function calculateWeightedAverageCost(existingStock:number, existingUnitCost:number, incomingQuantity:number, incomingUnitCost:number):number {
  if (![existingStock, existingUnitCost, incomingQuantity, incomingUnitCost].every(Number.isFinite)
    || existingStock < 0 || existingUnitCost < 0 || incomingQuantity <= 0 || incomingUnitCost < 0) {
    throw new Error('Existencias, cantidades y costos deben ser valores válidos.');
  }
  const newStock = existingStock + incomingQuantity;
  const previousValue = existingStock * existingUnitCost;
  const incomingValue = incomingQuantity * incomingUnitCost;
  const average = (previousValue + incomingValue) / newStock;
  if (!Number.isFinite(newStock) || newStock <= 0 || !Number.isFinite(previousValue)
    || !Number.isFinite(incomingValue) || !Number.isFinite(average)) {
    throw new Error('El costo promedio calculado está fuera de rango.');
  }
  const rounded = Number(average.toFixed(2));
  if (!Number.isFinite(rounded)) throw new Error('El costo promedio calculado no es válido.');
  return rounded;
}

export function applySaleToInventory(products: Product[], sold: CartItem[]): Product[] {
  if (!sold.length) throw new Error('La venta debe contener al menos un producto.');
  if (new Set(sold.map(item => item.id)).size !== sold.length) throw new Error('La venta contiene productos duplicados.');
  if (sold.some(item => !products.some(product => product.id === item.id))) throw new Error('No se encontró un producto del carrito en el inventario.');
  const invalid = sold.find(item => !Number.isFinite(item.qty) || item.qty <= 0 || !Number.isFinite(item.price) || item.price < 0 || !Number.isFinite(item.cost) || item.cost < 0 || !Number.isFinite(item.price * item.qty) || !Number.isFinite(item.cost * item.qty));
  if (invalid) throw new Error('Cantidad, precio y costo de venta deben ser válidos.');
  const saleTotal = sold.reduce((sum, item) => sum + item.price * item.qty, 0);
  const saleCost = sold.reduce((sum, item) => sum + item.cost * item.qty, 0);
  if (!Number.isFinite(saleTotal) || !Number.isFinite(saleCost) || !Number.isFinite(saleTotal - saleCost)) throw new Error('El total o costo de la venta está fuera de rango. Verifica los importes.');
  if (products.some(product => !Number.isFinite(product.stock) || product.stock < 0 || !Number.isFinite(product.cost) || product.cost < 0)) throw new Error('El inventario contiene una existencia o costo inválido.');
  const requestedByProduct = new Map<number,number>();
  sold.forEach(item => requestedByProduct.set(item.id,(requestedByProduct.get(item.id)??0)+item.qty));
  for (const [productId,quantity] of requestedByProduct) {
    const product=products.find(p=>p.id===productId);
    if(!product) throw new Error('No se encontró un producto del carrito en el inventario.');
    if(quantity>product.stock) throw new Error('Stock insuficiente para el producto seleccionado.');
  }
  return products.map(product => { const quantity=requestedByProduct.get(product.id)??0; return quantity>0 ? { ...product, stock: product.stock - quantity } : product; });
}

export function applyPurchaseToInventory(products: Product[], items: PurchaseItem[], supplier: string): Product[] {
  if (!items.length) throw new Error('La compra debe contener al menos un producto.');
  if (new Set(items.map(item => item.id)).size !== items.length) throw new Error('La compra contiene productos duplicados.');
  if (items.some(item => !products.some(product => product.id === item.id))) throw new Error('No se encontró un producto de la compra en el inventario.');
  const invalid = items.find(item => !Number.isFinite(item.qty) || item.qty <= 0 || !Number.isFinite(item.unitCost) || item.unitCost < 0 || !Number.isFinite(item.qty * item.unitCost));
  if (invalid) throw new Error('Cantidad y costo de compra deben ser válidos.');
  const invalidExpiry = items.find(item => !isExpiryAtLeastSixMonths(item.expiry));
  if (invalidExpiry) throw new Error(`No se puede recibir “${invalidExpiry.name}”: el vencimiento debe ser de al menos seis meses desde hoy.`);
  purchaseTotal(items);
  if (products.some(product => !Number.isFinite(product.stock) || product.stock < 0 || !Number.isFinite(product.cost) || product.cost < 0)) throw new Error('El inventario contiene una existencia o costo inválido.');
  return products.map(product => {
    const item = items.find(line => line.id === product.id);
    if (!item) return product;
    const newStock = product.stock + item.qty;
    let averageCost:number;
    try { averageCost = calculateWeightedAverageCost(product.stock, product.cost, item.qty, item.unitCost); }
    catch { throw new Error('La compra produciría una existencia o costo fuera de rango. Verifica los datos.'); }
    const expiry = product.expiry && product.stock > 0 ? (product.expiry < item.expiry ? product.expiry : item.expiry) : item.expiry;
    return { ...product, stock: newStock, cost: averageCost, expiry, supplier: supplier.trim() || product.supplier };
  });
}

export function purchaseTotal(items: PurchaseItem[]): number {
  const total = items.reduce((sum, item) => sum + item.unitCost * item.qty, 0);
  if (!Number.isFinite(total)) throw new Error('El total de la compra está fuera de rango. Verifica cantidades y costos.');
  return total;
}
