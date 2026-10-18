import type { Product } from '../domain/types';
import { localDateKey } from '../utils/dates';

export function sixMonthExpiryThreshold(now = new Date()): string {
  const threshold = new Date(now.getFullYear(), now.getMonth() + 6, 1);
  const lastDay = new Date(threshold.getFullYear(), threshold.getMonth() + 1, 0).getDate();
  threshold.setDate(Math.min(now.getDate(), lastDay));
  return localDateKey(threshold);
}

export function isExpiryAtLeastSixMonths(expiry: string, now = new Date()): boolean {
  return Boolean(expiry) && /^\d{4}-\d{2}-\d{2}$/.test(expiry) && expiry >= sixMonthExpiryThreshold(now);
}

const normalizeIngredient = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');

export function earlierExpiryAlternatives(product: Product, products: Product[]): Product[] {
  if (!product.expiry || !product.activeIngredients?.length) return [];
  const ingredients = new Set(product.activeIngredients.map(normalizeIngredient).filter(Boolean));
  if (!ingredients.size) return [];
  return products.filter(candidate =>
    candidate.id !== product.id &&
    candidate.stock > 0 &&
    Boolean(candidate.expiry) &&
    candidate.expiry < product.expiry &&
    (candidate.activeIngredients ?? []).some(ingredient => ingredients.has(normalizeIngredient(ingredient))),
  ).sort((a, b) => a.expiry.localeCompare(b.expiry));
}
