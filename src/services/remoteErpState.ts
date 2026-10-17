import type {
  Customer, Expense, InventoryMovement, Payable, Product, PurchaseRecord,
  Receivable, SaleRecord,
} from '../domain/types';
import { requireSupabase } from './supabaseClient';

export type ErpSnapshot = {
  customers: Customer[];
  products: Product[];
  sales: SaleRecord[];
  purchases: PurchaseRecord[];
  expenses: Expense[];
  receivables: Receivable[];
  payables: Payable[];
  inventoryMovements: InventoryMovement[];
  monthlyGoal: number;
  fixedExpenses: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeSnapshot(value: unknown): ErpSnapshot {
  if (!isRecord(value)) throw new Error('Los datos guardados en Supabase no tienen un formato válido.');
  const arrays = ['customers', 'products', 'sales', 'purchases', 'expenses', 'receivables', 'payables', 'inventoryMovements'] as const;
  for (const key of arrays) {
    if (value[key] !== undefined && !Array.isArray(value[key])) {
      throw new Error(`El campo ${key} de los datos guardados no es válido.`);
    }
  }
  const monthlyGoal = Number(value.monthlyGoal ?? 100000);
  const fixedExpenses = Number(value.fixedExpenses ?? 25000);
  if (!Number.isFinite(monthlyGoal) || !Number.isFinite(fixedExpenses)) {
    throw new Error('Las metas o los gastos fijos guardados no son válidos.');
  }
  return {
    customers: (value.customers ?? []) as Customer[],
    products: (value.products ?? []) as Product[],
    sales: (value.sales ?? []) as SaleRecord[],
    purchases: (value.purchases ?? []) as PurchaseRecord[],
    expenses: (value.expenses ?? []) as Expense[],
    receivables: (value.receivables ?? []) as Receivable[],
    payables: (value.payables ?? []) as Payable[],
    inventoryMovements: (value.inventoryMovements ?? []) as InventoryMovement[],
    monthlyGoal,
    fixedExpenses,
  };
}

export async function loadErpSnapshot(userId: string): Promise<ErpSnapshot | null> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('erp_state')
    .select('user_id,state')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  if (data.user_id !== userId) throw new Error('La cuenta no coincide con el propietario de los datos.');
  return normalizeSnapshot(data.state);
}

export async function saveErpSnapshot(userId: string, snapshot: ErpSnapshot): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from('erp_state')
    .upsert(
      { user_id: userId, state: snapshot, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  if (error) throw error;
}
