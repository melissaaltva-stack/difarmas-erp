import type { SaleAdjustmentRecord, SaleLine, SaleRecord } from '../domain/types';

/**
 * Combines duplicate product rows into one reporting/return line using weighted
 * average unit prices and costs. This prevents the POS return form from applying
 * one quantity input independently to duplicate rows of the same product.
 */
export function aggregateSaleLinesByProduct(items: SaleLine[]): SaleLine[] {
  const grouped = new Map<number, SaleLine>();
  for (const line of items) {
    const current = grouped.get(line.productId);
    if (!current) {
      grouped.set(line.productId, { ...line });
      continue;
    }
    const qty = current.qty + line.qty;
    const revenue = current.revenue + line.revenue;
    const cost = current.cost + line.cost;
    grouped.set(line.productId, {
      ...current,
      qty,
      revenue,
      cost,
      profit: revenue - cost,
      unitPrice: qty > 0 ? revenue / qty : current.unitPrice,
      unitCost: qty > 0 ? cost / qty : current.unitCost,
      taxAmount: (current.taxAmount ?? 0) + (line.taxAmount ?? 0),
      lineTotal: (current.lineTotal ?? current.revenue) + (line.lineTotal ?? line.revenue),
    });
  }
  return [...grouped.values()].map(line => ({
    ...line,
    unitPrice: line.qty > 0 ? line.revenue / line.qty : line.unitPrice,
    unitCost: line.qty > 0 ? line.cost / line.qty : line.unitCost,
    taxAmount: line.taxAmount ?? 0,
    lineTotal: line.lineTotal ?? line.revenue,
    profit: line.revenue - line.cost,
  }));
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
    const lineReductions = new Map<number, number>();
    let costReductionFromLines = 0;
    let taxReductionFromLines = 0;
    for (const adjustment of saleAdjustments) {
      for (const item of adjustment.items ?? []) {
        const qty = Math.max(0, Number(item.quantity) || 0);
        lineReductions.set(item.productId, (lineReductions.get(item.productId) ?? 0) + qty);
        costReductionFromLines += qty * Math.max(0, Number(item.unitCost) || 0);
        taxReductionFromLines += qty * Math.max(0, Number(item.unitTaxAmount) || 0);
      }
    }

    if (!sale.items?.length) {
      const ratio = sale.total > 0 ? amountReduction / sale.total : 0;
      const costReduction = Math.min(Math.max(0, sale.cost), Math.max(0, sale.cost * ratio));
      const total = Math.max(0, sale.total - amountReduction);
      const cost = Math.max(0, sale.cost - costReduction);
      const taxTotal = Math.max(0, (sale.taxTotal ?? 0) * (1 - ratio));
      return { ...sale, total, cost, profit: total - cost, taxTotal };
    }

    const remaining = new Map(lineReductions);
    const items = aggregateSaleLinesByProduct(sale.items).map(line => {
      const requested = remaining.get(line.productId) ?? 0;
      const removedQty = Math.min(Math.max(0, line.qty), requested);
      remaining.set(line.productId, Math.max(0, requested - removedQty));
      const qty = Math.max(0, line.qty - removedQty);
      const unitPrice = line.qty > 0 ? line.revenue / line.qty : line.unitPrice;
      const unitCost = line.qty > 0 ? line.cost / line.qty : line.unitCost;
      const revenue = Math.max(0, line.revenue - unitPrice * removedQty);
      const cost = Math.max(0, line.cost - unitCost * removedQty);
      const taxAmount = Math.max(0, (line.taxAmount ?? 0) - ((line.taxAmount ?? 0) / Math.max(1, line.qty)) * removedQty);
      const lineTotal = revenue + taxAmount;
      return { ...line, qty, revenue, cost, taxAmount, lineTotal, profit: revenue - cost };
    }).filter(line => line.qty > 0);
    const total = Math.max(0, sale.total - amountReduction);
    const costReduction = Math.min(Math.max(0, sale.cost), costReductionFromLines);
    const cost = Math.max(0, sale.cost - costReduction);
    const taxTotal = Math.max(0, (sale.taxTotal ?? 0) - taxReductionFromLines);
    return { ...sale, total, cost, profit: (items ?? []).reduce((sum, line) => sum + line.profit, 0), taxTotal, items };
  });
}
