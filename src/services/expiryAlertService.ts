import type { Product } from '../domain/types';
import { localDateKey } from '../utils/dates';

export type ExpiryAlert = { level: 'urgent' | 'warning'; daysRemaining: number; message: string };

export function getExpiryAlert(expiry: string, now = new Date()): ExpiryAlert | null {
  if (!expiry || !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return null;
  const today = new Date(localDateKey(now) + 'T00:00:00');
  const expiration = new Date(expiry + 'T00:00:00');
  if (!Number.isFinite(expiration.getTime())) return null;
  const daysRemaining = Math.ceil((expiration.getTime() - today.getTime()) / 86400000);
  if (daysRemaining < 0) return { level: 'urgent', daysRemaining, message: 'PRODUCTO VENCIDO: no vender; revisar y retirar según el procedimiento de la farmacia.' };
  if (daysRemaining <= 30) return { level: 'urgent', daysRemaining, message: '¡VENTA URGENTE! Vence en 30 días o menos. Verifica el lote y prioriza su rotación si es apto para la venta.' };
  if (daysRemaining <= 90) return { level: 'warning', daysRemaining, message: 'ALERTA DE VENCIMIENTO: quedan 31–90 días. Revisa el lote y prioriza su rotación.' };
  return null;
}

export function productsWithExpiryAlerts(products: Product[], now = new Date()): Array<{ product: Product; alert: ExpiryAlert }> {
  return products.flatMap(product => {
    const alert = getExpiryAlert(product.expiry, now);
    return alert ? [{ product, alert }] : [];
  }).sort((a, b) => a.alert.daysRemaining - b.alert.daysRemaining);
}
