import type { CartItem, SaleLine, SaleRecord } from '../domain/types';

export function buildSaleRecord(
  sold: CartItem[],
  payment: string,
  saleType: string,
  customer = '',
  dueDate = '',
  now = new Date(),
): SaleRecord {
  const id = Date.now();
  const total = sold.reduce((sum, item) => sum + item.price * item.qty, 0);
  const cost = sold.reduce((sum, item) => sum + item.cost * item.qty, 0);
  const items: SaleLine[] = sold.map(item => ({
    productId: item.id,
    productName: item.name,
    category: item.category,
    laboratory: item.laboratory,
    qty: item.qty,
    unitCost: item.cost,
    unitPrice: item.price,
    revenue: item.price * item.qty,
    cost: item.cost * item.qty,
    profit: (item.price - item.cost) * item.qty,
  }));

  return {
    id,
    total,
    cost,
    profit: total - cost,
    payment,
    type: saleType,
    date: now.toISOString(),
    customer: payment === 'Crédito' ? customer : undefined,
    dueDate: payment === 'Crédito' ? dueDate : undefined,
    items,
  };
}

export function createReceivableFromSale(
  sale: SaleRecord,
  customer: string,
  dueDate: string,
): { id:number; saleId:number; customer:string; total:number; paid:number; dueDate:string; date:string; lastPaymentDate?:string } {
  return {
    id: sale.id,
    saleId: sale.id,
    customer,
    total: sale.total,
    paid: 0,
    dueDate,
    date: sale.date,
    lastPaymentDate: undefined,
  };
}
