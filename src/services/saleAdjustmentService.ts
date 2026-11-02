import type { SaleAdjustmentRecord, SaleRecord } from '../domain/types';

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
    const lineReductions = new Map<number, number>();
    let costReductionFromLines = 0;
    for (const adjustment of saleAdjustments) {
      for (const item of adjustment.items ?? []) {
        const qty = Math.max(0, Number(item.quantity) || 0);
        lineReductions.set(item.productId, (lineReductions.get(item.productId) ?? 0) + qty);
        costReductionFromLines += qty * Math.max(0, Number(item.unitCost) || 0);
      }
    }

    if (!sale.items?.length) {
      const ratio = sale.total > 0 ? amountReduction / sale.total : 0;
      const costReduction = Math.min(Math.max(0, sale.cost), Math.max(0, sale.cost * ratio));
      const total = Math.max(0, sale.total - amountReduction);
      const cost = Math.max(0, sale.cost - costReduction);
      return { ...sale, total, cost, profit: total - cost };
    }

    const remaining = new Map(lineReductions);
    const items = sale.items.map(line => {
      const requested = remaining.get(line.productId) ?? 0;
      const removedQty = Math.min(Math.max(0, line.qty), requested);
      remaining.set(line.productId, Math.max(0, requested - removedQty));
      const ratio = line.qty > 0 ? (line.qty - removedQty) / line.qty : 0;
      const qty = Math.max(0, line.qty - removedQty);
      const revenue = Math.max(0, line.revenue * ratio);
      const cost = Math.max(0, line.cost * ratio);
      return { ...line, qty, revenue, cost, profit: revenue - cost };
    }).filter(line => line.qty > 0);
    const total = Math.max(0, sale.total - amountReduction);
    const costReduction = Math.min(Math.max(0, sale.cost), costReductionFromLines);
    const cost = Math.max(0, sale.cost - costReduction);
    return { ...sale, total, cost, profit: total - cost, items };
  });
}
