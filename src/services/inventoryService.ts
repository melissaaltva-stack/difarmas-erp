import type { CartItem, Product, PurchaseItem } from '../domain/types';
import { isExpiryAtLeastSixMonths } from './expiryService';

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
  if (items.some(item => !products.some(product => product.id === item.id))) throw new Error('No se encontró un producto de la compra en el inventario.');
  const invalid = items.find(item => !Number.isFinite(item.qty) || item.qty <= 0 || !Number.isFinite(item.unitCost) || item.unitCost < 0 || !Number.isFinite(item.qty * item.unitCost));
  if (invalid) throw new Error('Cantidad y costo de compra deben ser válidos.');
  const invalidExpiry = items.find(item => !isExpiryAtLeastSixMonths(item.expiry));
  if (invalidExpiry) throw new Error(`No se puede recibir “${invalidExpiry.name}”: el vencimiento debe ser de al menos seis meses desde hoy.`);
  purchaseTotal(items);
  if (products.some(product => !Number.isFinite(product.stock) || product.stock < 0 || !Number.isFinite(product.cost) || product.cost < 0)) throw new Error('El inventario contiene una existencia o costo inválido.');
  const receivedByProduct = new Map<number,{quantity:number;value:number;expiries:string[]}>();
  items.forEach(item => {
    const current=receivedByProduct.get(item.id)??{quantity:0,value:0,expiries:[]};
    current.quantity+=item.qty;
    current.value+=item.unitCost*item.qty;
    if(item.expiry)current.expiries.push(item.expiry);
    receivedByProduct.set(item.id,current);
  });
  return products.map(product => {
    const received=receivedByProduct.get(product.id);
    if (!received) return product;
    const newStock = product.stock + received.quantity;
    const previousInventoryValue = product.cost * product.stock;
    const purchaseValue = received.value;
    const averageCost = (previousInventoryValue + purchaseValue) / newStock;
    if (!Number.isFinite(newStock) || newStock <= 0 || !Number.isFinite(previousInventoryValue) || !Number.isFinite(purchaseValue) || !Number.isFinite(averageCost)) throw new Error('La compra produciría una existencia o costo fuera de rango. Verifica los datos.');
    const roundedCost = Number(averageCost.toFixed(2));
    if (!Number.isFinite(roundedCost)) throw new Error('El costo promedio calculado no es válido.');
    const earliestReceivedExpiry=received.expiries.sort()[0];
    const expiry=product.expiry&&product.stock>0&&earliestReceivedExpiry
      ? (product.expiry<earliestReceivedExpiry?product.expiry:earliestReceivedExpiry)
      : earliestReceivedExpiry||product.expiry;
    if(product.unitInventoryEnabled){
      const marginFor=(price:number,previousCost:number,fallback:number)=>price>previousCost&&price>0?Math.min(0.999,Math.max(0,(price-previousCost)/price)):fallback;
      const retailMargin=marginFor(product.retail,product.cost,0.4);
      const wholesaleMargin=marginFor(product.wholesale,product.cost,0.2);
      const retail=Number((roundedCost/(1-retailMargin)).toFixed(2));
      const wholesale=Number((roundedCost/(1-wholesaleMargin)).toFixed(2));
      const unitPresentations=(product.unitPresentations??[]).map(option=>({...option,retailPrice:Number((retail*option.unitsPerPresentation).toFixed(2)),wholesalePrice:Number((wholesale*option.unitsPerPresentation).toFixed(2))}));
      return { ...product, stock: newStock, cost: roundedCost, retail, wholesale, unitPresentations, expiry, supplier: supplier.trim() || product.supplier };
    }
    return { ...product, stock: newStock, cost: roundedCost, expiry, supplier: supplier.trim() || product.supplier };
  });
}

export function purchaseTotal(items: PurchaseItem[]): number {
  const total = items.reduce((sum, item) => sum + item.unitCost * item.qty, 0);
  if (!Number.isFinite(total)) throw new Error('El total de la compra está fuera de rango. Verifica cantidades y costos.');
  return total;
}
