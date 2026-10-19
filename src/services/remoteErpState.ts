import type {
  CashClosure, CashMovement, Customer, Supplier, ErpSettings, Expense, InventoryMovement, Payable, PaymentTransaction, Product, PurchaseCostHistoryEntry, PurchaseRecord,
  Receivable, SaleRecord, MissingProductRequest,
} from '../domain/types';
import { requireSupabase } from './supabaseClient';

export type ErpSnapshot = {
  customers: Customer[];
  suppliers?: Supplier[];
  products: Product[];
  sales: SaleRecord[];
  purchases: PurchaseRecord[];
  purchaseCostHistory?: PurchaseCostHistoryEntry[];
  settings?: ErpSettings;
  expenses: Expense[];
  receivables: Receivable[];
  payables: Payable[];
  inventoryMovements: InventoryMovement[];
  monthlyGoal: number;
  fixedExpenses: number;
  cashClosures?: CashClosure[];
  cashMovements?: CashMovement[];
  paymentTransactions?: PaymentTransaction[];
  missingProductRequests?: MissingProductRequest[];
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
  for (const key of ['cashClosures', 'cashMovements', 'paymentTransactions', 'missingProductRequests'] as const) {
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
    suppliers: (value.suppliers ?? []) as Supplier[],
    products: (value.products ?? []) as Product[],
    sales: (value.sales ?? []) as SaleRecord[],
    purchases: (value.purchases ?? []) as PurchaseRecord[],
    purchaseCostHistory: (value.purchaseCostHistory ?? []) as PurchaseCostHistoryEntry[],
    settings: value.settings as ErpSettings | undefined,
    expenses: (value.expenses ?? []) as Expense[],
    receivables: (value.receivables ?? []) as Receivable[],
    payables: (value.payables ?? []) as Payable[],
    inventoryMovements: (value.inventoryMovements ?? []) as InventoryMovement[],
    monthlyGoal,
    fixedExpenses,
    cashClosures: value.cashClosures as CashClosure[] | undefined,
    cashMovements: value.cashMovements as CashMovement[] | undefined,
    paymentTransactions: value.paymentTransactions as PaymentTransaction[] | undefined,
    missingProductRequests: value.missingProductRequests as MissingProductRequest[] | undefined,
  };
}

// Keep the last server revision observed by this browser session. Conditional
// updates prevent an older tab/device from silently replacing a newer snapshot.
const lastSeenRevision = new Map<string, string>();

export async function loadErpSnapshot(userId: string): Promise<ErpSnapshot | null> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('erp_state')
    .select('user_id,state,updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    lastSeenRevision.delete(userId);
    return null;
  }
  if (data.user_id !== userId) throw new Error('La cuenta no coincide con el propietario de los datos.');
  if (typeof data.updated_at !== 'string') throw new Error('No se pudo verificar la versión de los datos en Supabase.');
  lastSeenRevision.set(userId, data.updated_at);
  return normalizeSnapshot(data.state);
}

const saveQueues = new Map<string, Promise<void>>();

async function saveErpSnapshotNow(userId: string, snapshot: ErpSnapshot): Promise<void> {
  const client = requireSupabase();
  const expectedRevision = lastSeenRevision.get(userId);

  // Ensure each successful write changes the revision, even when two saves
  // happen within the same millisecond.
  const nextRevision = new Date(Math.max(Date.now(), expectedRevision ? Date.parse(expectedRevision) + 1 : 0)).toISOString();
  const payload = { user_id: userId, state: snapshot, updated_at: nextRevision };

  if (!expectedRevision) {
    // First save must be insert-only. An upsert here could overwrite a record
    // created by another device after this browser's initial read.
    const { data, error } = await client
      .from('erp_state')
      .insert(payload)
      .select('updated_at')
      .single();
    if (error) {
      if (error.code === '23505') {
        throw new Error('Los datos fueron creados desde otra sesión. Recarga el ERP para sincronizar antes de guardar.');
      }
      throw error;
    }
    if (typeof data?.updated_at !== 'string') throw new Error('Supabase no devolvió la versión guardada.');
    lastSeenRevision.set(userId, data.updated_at);
    return;
  }

  const { data, error } = await client
    .from('erp_state')
    .update({ state: snapshot, updated_at: nextRevision })
    .eq('user_id', userId)
    .eq('updated_at', expectedRevision)
    .select('updated_at')
    .maybeSingle();

  if (error) throw error;
  if (!data || typeof data.updated_at !== 'string') {
    throw new Error('Se detectaron cambios más recientes desde otra sesión. No se sobrescribieron; recarga el ERP antes de continuar.');
  }
  lastSeenRevision.set(userId, data.updated_at);
}


// Serialize saves from this browser session. The revision check still protects
// against other tabs/devices, while this queue prevents this tab's own autosaves
// from racing each other.
export function saveErpSnapshot(userId: string, snapshot: ErpSnapshot): Promise<void> {
  const previous = saveQueues.get(userId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(() => saveErpSnapshotNow(userId, snapshot));
  saveQueues.set(userId, next);
  void next.finally(() => {
    if (saveQueues.get(userId) === next) saveQueues.delete(userId);
  }).catch(() => undefined);
  return next;
}
