import type {
  CashClosure, CashMovement, Customer, Supplier, ErpSettings, Expense, InventoryMovement, Payable, PaymentTransaction, Product, PurchaseCostHistoryEntry, PurchaseRecord,
  Receivable, SaleRecord, MissingProductRequest, SupplierReturnRecord, SupplierCredit, SaleAdjustmentRecord, QuoteRecord,
} from '../domain/types';
import { requireSupabase } from './supabaseClient';

export type ErpSnapshot = {
  customers: Customer[];
  quotes?: QuoteRecord[];
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
  supplierReturns?: SupplierReturnRecord[];
  supplierCredits?: SupplierCredit[];
  saleAdjustments?: SaleAdjustmentRecord[];
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
  for (const key of ['cashClosures', 'cashMovements', 'paymentTransactions', 'missingProductRequests', 'supplierReturns', 'supplierCredits', 'saleAdjustments', 'quotes'] as const) {
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
    quotes: (value.quotes ?? []) as QuoteRecord[],
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
    supplierReturns: value.supplierReturns as SupplierReturnRecord[] | undefined,
    supplierCredits: value.supplierCredits as SupplierCredit[] | undefined,
    saleAdjustments: value.saleAdjustments as SaleAdjustmentRecord[] | undefined,
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
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  const session = sessionData.session;
  if (sessionError || !session || session.user.id !== userId) {
    throw new Error('La sesión no corresponde a la cuenta que intenta guardar los datos.');
  }

  const response = await fetch('/api/erp-state', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      action: 'snapshot',
      expectedUpdatedAt: lastSeenRevision.get(userId) ?? null,
      snapshot,
    }),
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok || !isRecord(result) || typeof result.updatedAt !== 'string') {
    const message = isRecord(result) && typeof result.error === 'string'
      ? result.error
      : 'No se pudo confirmar el guardado seguro en el servidor.';
    throw new Error(message);
  }
  lastSeenRevision.set(userId, result.updatedAt);
}

async function saveQuotesForUserNow(userId: string, quotes: QuoteRecord[], fallbackSnapshot: ErpSnapshot): Promise<void> {
  // The server merges quotes into the latest snapshot and checks the
  // cotizaciones permission. The fallback is retained for API compatibility;
  // it is never trusted as the base for a cloud write.
  void fallbackSnapshot;
  const client = requireSupabase();
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  const session = sessionData.session;
  if (sessionError || !session || session.user.id !== userId) {
    throw new Error('La sesión no corresponde a la cuenta que intenta guardar cotizaciones.');
  }

  const response = await fetch('/api/erp-state', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action: 'quotes', quotes }),
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok || !isRecord(result) || typeof result.updatedAt !== 'string') {
    const message = isRecord(result) && typeof result.error === 'string'
      ? result.error
      : 'No se pudo confirmar el guardado de cotizaciones.';
    throw new Error(message);
  }
  lastSeenRevision.set(userId, result.updatedAt);
}

export function saveQuotesForUser(userId: string, quotes: QuoteRecord[], fallbackSnapshot: ErpSnapshot): Promise<void> {
  const previous = saveQueues.get(userId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(() => saveQuotesForUserNow(userId, quotes, fallbackSnapshot));
  saveQueues.set(userId, next);
  void next.finally(() => {
    if (saveQueues.get(userId) === next) saveQueues.delete(userId);
  }).catch(() => undefined);
  return next;
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


export type SupplierCreditNoteResolution = {
  supplierReturns: SupplierReturnRecord[];
  payables: Payable[];
  supplierCredits: SupplierCredit[];
  updatedAt: string;
};

/**
 * Resolve a supplier credit note through a row-locked PostgreSQL function.
 * The same per-account queue used by snapshot saves prevents a stale local
 * autosave from racing this authoritative server-side transaction.
 */
export async function resolveSupplierCreditNoteAtomically(userId: string, returnId: number): Promise<SupplierCreditNoteResolution> {
  if (!Number.isInteger(returnId) || returnId <= 0) throw new Error('La devolución indicada no es válida.');
  const previous = saveQueues.get(userId) ?? Promise.resolve();
  let result: SupplierCreditNoteResolution | null = null;
  const next = previous.catch(() => undefined).then(async () => {
    const client = requireSupabase();
    const { data, error } = await client.rpc('resolve_supplier_credit_note', { p_return_id: returnId });
    if (error) throw error;
    if (!isRecord(data)
      || !Array.isArray(data.supplierReturns)
      || !Array.isArray(data.payables)
      || !Array.isArray(data.supplierCredits)
      || typeof data.updatedAt !== 'string') {
      throw new Error('Supabase no devolvió la confirmación íntegra de la nota de crédito.');
    }
    result = {
      supplierReturns: data.supplierReturns as SupplierReturnRecord[],
      payables: data.payables as Payable[],
      supplierCredits: data.supplierCredits as SupplierCredit[],
      updatedAt: data.updatedAt,
    };
    lastSeenRevision.set(userId, data.updatedAt);
  });
  saveQueues.set(userId, next);
  void next.finally(() => {
    if (saveQueues.get(userId) === next) saveQueues.delete(userId);
  }).catch(() => undefined);
  await next;
  if (!result) throw new Error('No se pudo confirmar el registro de la nota de crédito.');
  return result;
}
