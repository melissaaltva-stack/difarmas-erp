import type { SaleAdjustmentRecord, SaleLine, SaleRecord } from '../domain/types';

export type SaleLineBalance = { line: SaleLine; remainingQuantity: number; adjustedQuantity: number };

/** Tracks returns against the exact original sale line; legacy rows fall back to product order. */
export function getSaleLineBalances(items: SaleLine[], adjustments: SaleAdjustmentRecord[]): SaleLineBalance[] {
  const sourceItems = items.length > 0 && items.every(line => !line.saleLineId) ? aggregateSaleLinesByProduct(items) : items;
  const remaining = sourceItems.map(line => Math.max(0, Number(line.qty) || 0));
  const indexById = new Map<string, number>();
  sourceItems.forEach((line, index) => { if (line.saleLineId) indexById.set(line.saleLineId, index); });
  for (const adjustment of adjustments) for (const item of adjustment.items ?? []) {
    let toAllocate = Math.max(0, Number(item.quantity) || 0);
    if (!toAllocate) continue;
    if (item.saleLineId) {
      const index = indexById.get(item.saleLineId);
      if (index !== undefined && sourceItems[index].productId === item.productId) remaining[index] = Math.max(0, remaining[index] - toAllocate);
      continue;
    }
    for (let index = 0; index < items.length && toAllocate > 0; index++) {
      if (sourceItems[index].productId !== item.productId) continue;
      const applied = Math.min(remaining[index], toAllocate);
      remaining[index] -= applied; toAllocate -= applied;
    }
  }
  return sourceItems.map((line, index) => ({ line, remainingQuantity: remaining[index], adjustedQuantity: Math.max(0, (Number(line.qty) || 0) - remaining[index]) }));
}

export function canApplySaleAdjustmentItems(saleItems: SaleLine[], existing: SaleAdjustmentRecord[], requested: SaleAdjustmentRecord['items']): boolean {
  const sourceItems = saleItems.length > 0 && saleItems.every(line => !line.saleLineId) ? aggregateSaleLinesByProduct(saleItems) : saleItems;
  const remaining = getSaleLineBalances(sourceItems, existing).map(row => row.remainingQuantity);
  const indexById = new Map<string, number>();
  sourceItems.forEach((line, index) => { if (line.saleLineId) indexById.set(line.saleLineId, index); });
  for (const item of requested) {
    let toAllocate = item.quantity;
    if (item.saleLineId) {
      const index = indexById.get(item.saleLineId);
      if (index === undefined || sourceItems[index].productId !== item.productId || remaining[index] < toAllocate) return false;
      remaining[index] -= toAllocate; continue;
    }
    for (let index = 0; index < sourceItems.length && toAllocate > 0; index++) {
      if (sourceItems[index].productId !== item.productId) continue;
      const applied = Math.min(remaining[index], toAllocate);
      remaining[index] -= applied; toAllocate -= applied;
    }
    if (toAllocate > 0) return false;
  }
  return true;
}

/** Legacy helper for reports that intentionally need product-level aggregation. */
export function aggregateSaleLinesByProduct(items: SaleLine[]): SaleLine[] {
  const grouped = new Map<number, SaleLine>();
  for (const line of items) {
    const current = grouped.get(line.productId);
    if (!current) { grouped.set(line.productId, { ...line }); continue; }
    const qty = current.qty + line.qty, revenue = current.revenue + line.revenue, cost = current.cost + line.cost;
    grouped.set(line.productId, { ...current, saleLineId: undefined, qty, revenue, cost, profit: revenue - cost,
      unitPrice: qty ? revenue / qty : current.unitPrice, unitCost: qty ? cost / qty : current.unitCost,
      taxAmount: (current.taxAmount ?? 0) + (line.taxAmount ?? 0), lineTotal: (current.lineTotal ?? current.revenue) + (line.lineTotal ?? line.revenue) });
  }
  return [...grouped.values()].map(line => ({ ...line, unitPrice: line.qty ? line.revenue / line.qty : line.unitPrice,
    unitCost: line.qty ? line.cost / line.qty : line.unitCost, taxAmount: line.taxAmount ?? 0,
    lineTotal: line.lineTotal ?? line.revenue, profit: line.revenue - line.cost }));
}

/**
 * Returns a reporting-only projection of sales after registered returns/voids.
 * Original sale records are never mutated. The original records remain the source
 * of truth for POS, invoices, and audit history.
 */
export function applySaleAdjustmentsToSales(sales: SaleRecord[], adjustments: SaleAdjustmentRecord[]): SaleRecord[] {
  const bySale = new Map<number, SaleAdjustmentRecord[]>();
  for (const adjustment of adjustments) {
    const rows = bySale.get(adjustment.saleId) ?? [];
    rows.push(adjustment);
    bySale.set(adjustment.saleId, rows);
  }

  return sales.map(sale => {
    const saleAdjustments = bySale.get(sale.id) ?? [];
    if (!saleAdjustments.length) return sale;
    const amountReduction = Math.min(Math.max(0, sale.total), saleAdjustments.reduce((sum, row) => sum + Math.max(0, row.amount || 0), 0));
    let costReductionFromLines = 0;
    let taxReductionFromLines = 0;
    for (const adjustment of saleAdjustments) for (const item of adjustment.items ?? []) {
      const qty = Math.max(0, Number(item.quantity) || 0);
      costReductionFromLines += qty * Math.max(0, Number(item.unitCost) || 0);
      taxReductionFromLines += qty * Math.max(0, Number(item.unitTaxAmount) || 0);
    }

    if (!sale.items?.length) {
      const ratio = sale.total > 0 ? amountReduction / sale.total : 0;
      const costReduction = Math.min(Math.max(0, sale.cost), Math.max(0, sale.cost * ratio));
      const total = Math.max(0, sale.total - amountReduction);
      const cost = Math.max(0, sale.cost - costReduction);
      const taxTotal = Math.max(0, (sale.taxTotal ?? 0) * (1 - ratio));
      return { ...sale, total, cost, profit: total - cost, taxTotal };
    }

    const items = getSaleLineBalances(sale.items, saleAdjustments).map(({line, remainingQuantity}) => {
      const removedQty = Math.max(0, line.qty - remainingQuantity);
      const unitPrice = line.qty > 0 ? line.revenue / line.qty : line.unitPrice;
      const unitCost = line.qty > 0 ? line.cost / line.qty : line.unitCost;
      const revenue = Math.max(0, line.revenue - unitPrice * removedQty);
      const cost = Math.max(0, line.cost - unitCost * removedQty);
      const taxAmount = Math.max(0, (line.taxAmount ?? 0) - ((line.taxAmount ?? 0) / Math.max(1, line.qty)) * removedQty);
      const lineTotal = revenue + taxAmount;
      return { ...line, qty: remainingQuantity, revenue, cost, taxAmount, lineTotal, profit: revenue - cost };
    }).filter(line => line.qty > 0);
    const total = Math.max(0, sale.total - amountReduction);
    const costReduction = Math.min(Math.max(0, sale.cost), costReductionFromLines);
    const cost = Math.max(0, sale.cost - costReduction);
    const taxTotal = Math.max(0, (sale.taxTotal ?? 0) - taxReductionFromLines);
    return { ...sale, total, cost, profit: (items ?? []).reduce((sum, line) => sum + line.profit, 0), taxTotal, items };
  });
}
