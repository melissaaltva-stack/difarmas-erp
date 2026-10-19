import type { Product, SaleRecord } from '../domain/types';

export type PurchaseRecommendation = {
  product: Product;
  soldUnits: number;
  averageDailyDemand: number;
  daysOfStock: number | null;
  suggestedQuantity: number;
  estimatedCost: number;
  priority: 'Alta' | 'Media' | 'Baja';
  reason: string;
  limitedData: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function dateValue(value: string): number | null {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Explainable, local purchase-planning rules. It never places orders or changes inventory.
 * Recent sales estimate demand; low-stock thresholds remain the fallback when history is absent.
 */
export function buildPurchaseRecommendations(
  products: Product[],
  sales: SaleRecord[],
  options: { asOf?: Date; historyDays?: number; leadTimeDays?: number; targetCoverageDays?: number; safetyDays?: number } = {},
): PurchaseRecommendation[] {
  const asOf = options.asOf ?? new Date();
  const historyDays = Math.max(1, options.historyDays ?? 60);
  const leadTimeDays = Math.max(0, options.leadTimeDays ?? 14);
  const targetCoverageDays = Math.max(1, options.targetCoverageDays ?? 30);
  const safetyDays = Math.max(0, options.safetyDays ?? 7);
  const cutoff = asOf.getTime() - historyDays * DAY_MS;
  const soldByProduct = new Map<number, number>();
  const firstSaleByProduct = new Map<number, number>();

  for (const sale of sales) {
    const timestamp = dateValue(sale.date);
    if (timestamp === null || timestamp > asOf.getTime() || timestamp < cutoff) continue;
    for (const line of sale.items ?? []) {
      if (!Number.isFinite(line.productId) || !Number.isFinite(line.qty) || line.qty <= 0) continue;
      soldByProduct.set(line.productId, (soldByProduct.get(line.productId) ?? 0) + line.qty);
      firstSaleByProduct.set(line.productId, Math.min(firstSaleByProduct.get(line.productId) ?? timestamp, timestamp));
    }
  }

  const recommendations: PurchaseRecommendation[] = [];
  for (const product of products) {
    const soldUnits = soldByProduct.get(product.id) ?? 0;
    const firstSale = firstSaleByProduct.get(product.id);
    const observedDays = firstSale === undefined ? 0 : Math.max(1, Math.ceil((asOf.getTime() - firstSale) / DAY_MS));
    const averageDailyDemand = soldUnits / Math.max(1, Math.min(historyDays, observedDays || historyDays));
    const limitedData = soldUnits === 0;
    const daysOfStock = averageDailyDemand > 0 ? product.stock / averageDailyDemand : null;
    const stockLow = product.stock <= product.minStock;
    const expiryDate = product.expiry ? dateValue(product.expiry + 'T12:00:00') : null;
    const daysUntilExpiry = expiryDate === null ? Infinity : Math.ceil((expiryDate - new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate()).getTime()) / DAY_MS);
    const expiryRisk = daysUntilExpiry >= 0 && daysUntilExpiry <= 120;
    const reorderPoint = averageDailyDemand > 0 ? averageDailyDemand * (leadTimeDays + safetyDays) : product.minStock;
    const needsReorder = stockLow || (averageDailyDemand > 0 && product.stock <= reorderPoint);
    if (!needsReorder) continue;
    if (expiryRisk && !stockLow) continue;

    const targetStock = averageDailyDemand > 0
      ? Math.max(product.minStock * 2, Math.ceil(averageDailyDemand * (leadTimeDays + targetCoverageDays + safetyDays)))
      : Math.max(product.minStock * 2, product.minStock + 1);
    const suggestedQuantity = Math.max(0, Math.ceil(targetStock - product.stock));
    if (suggestedQuantity <= 0) continue;
    const projectedDays = daysOfStock === null ? null : Math.floor(daysOfStock);
    const priority: PurchaseRecommendation['priority'] =
      stockLow || (projectedDays !== null && projectedDays <= leadTimeDays) ? 'Alta' :
      (projectedDays !== null && projectedDays <= leadTimeDays + safetyDays + 7) ? 'Media' : 'Baja';
    const reason = limitedData
      ? `Existencia ${product.stock}, mínimo ${product.minStock}. No hay ventas recientes registradas; cantidad sugerida basada solo en el mínimo configurado.`
      : `Vendidas ${soldUnits} unidades en los últimos ${historyDays} días; promedio ${averageDailyDemand.toFixed(2)} al día y cobertura aproximada de ${projectedDays ?? 0} días.${expiryRisk ? ' Revisar vencimiento próximo antes de comprar.' : ''}`;
    recommendations.push({
      product, soldUnits, averageDailyDemand, daysOfStock, suggestedQuantity,
      estimatedCost: Number((suggestedQuantity * Math.max(0, product.cost)).toFixed(2)),
      priority, reason, limitedData,
    });
  }

  const priorityOrder = { Alta: 0, Media: 1, Baja: 2 };
  return recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority] || (a.daysOfStock ?? Infinity) - (b.daysOfStock ?? Infinity));
}
