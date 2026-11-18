import type { InventoryMovement, Product } from '../domain/types';

export function createInventoryMovementsForSale(products: Product[], productIds: { id:number; qty:number }[], referenceId:number, nextId:()=>number = () => Date.now(), now = new Date()): InventoryMovement[] {
  const quantityByProduct = new Map<number,number>();
  productIds.forEach(({id,qty}) => quantityByProduct.set(id,(quantityByProduct.get(id)??0)+qty));
  return [...quantityByProduct.entries()].flatMap(([id,qty]) => {
    const product = products.find(p => p.id === id);
    if (!product || qty <= 0) return [];
    return [{ id: nextId(), productId:id, productName:product.name, type:'Venta', quantity:qty, stockBefore:product.stock, stockAfter:product.stock - qty, unitCost:product.cost, referenceId, date:now.toISOString() }];
  });
}

export function createInventoryMovementsForPurchase(products: Product[], items: { id:number; qty:number; unitCost:number }[], referenceId:number, nextId:()=>number = () => Date.now(), now = new Date()): InventoryMovement[] {
  const receivedByProduct=new Map<number,{quantity:number;value:number}>();
  items.forEach(({id,qty,unitCost})=>{
    const current=receivedByProduct.get(id)??{quantity:0,value:0};
    current.quantity+=qty;
    current.value+=qty*unitCost;
    receivedByProduct.set(id,current);
  });
  return [...receivedByProduct.entries()].flatMap(([id,received])=>{
    const product=products.find(p=>p.id===id);
    if(!product||received.quantity<=0)return [];
    return [{id:nextId(),productId:id,productName:product.name,type:'Compra',quantity:received.quantity,stockBefore:product.stock,stockAfter:product.stock+received.quantity,unitCost:received.value/received.quantity,referenceId,date:now.toISOString()}];
  });
}
