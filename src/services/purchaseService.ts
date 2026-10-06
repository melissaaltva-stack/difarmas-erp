import type { Payable, PurchaseItem } from '../domain/types';
import { purchaseTotal } from './inventoryService';

export function createPayableFromPurchase(
  items: PurchaseItem[],
  supplier: string,
  dueDate: string,
  now = new Date(),
): Payable {
  return {
    id: Date.now(),
    supplier,
    total: purchaseTotal(items),
    paid: 0,
    dueDate,
    date: now.toISOString(),
  };
}
