import { createClient, type User } from '@supabase/supabase-js';

type Req = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};
type Res = {
  status(code: number): Res;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
};

type Role = 'Administrador' | 'Supervisor' | 'Ventas' | 'Compras' | 'Finanzas' | 'Solo lectura';
type State = Record<string, unknown>;

const ROLE_MODULES: Record<Role, string[]> = {
  Administrador: ['dashboard','facturacion_estandar','ventas','redes_sociales','inventario','clientes','cotizaciones','compras','finanzas','cuentas_cobrar','cuentas_pagar','reportes','asistente_ia','proveedores','configuracion'],
  Supervisor: ['dashboard','facturacion_estandar','ventas','redes_sociales','clientes','cotizaciones','inventario','compras','finanzas','cuentas_cobrar','cuentas_pagar','reportes','asistente_ia','proveedores'],
  Ventas: ['dashboard','facturacion_estandar','ventas','redes_sociales','clientes','cotizaciones'],
  Compras: ['dashboard','inventario','compras','proveedores'],
  Finanzas: ['dashboard','facturacion_estandar','finanzas','cuentas_cobrar','cuentas_pagar','reportes','asistente_ia'],
  'Solo lectura': ['dashboard','ventas','redes_sociales','clientes','cotizaciones','inventario','compras','finanzas','cuentas_cobrar','cuentas_pagar','reportes','asistente_ia','proveedores'],
};

const KEY_MODULES: Record<string, string[]> = {
  customers: ['clientes'],
  quotes: ['cotizaciones'],
  suppliers: ['proveedores'],
  products: ['inventario'],
  sales: ['ventas'],
  purchases: ['compras'],
  purchaseCostHistory: ['compras'],
  settings: ['configuracion'],
  expenses: ['finanzas'],
  receivables: ['cuentas_cobrar'],
  payables: ['cuentas_pagar'],
  inventoryMovements: ['inventario','ventas','compras'],
  monthlyGoal: ['finanzas'],
  fixedExpenses: ['finanzas'],
  cashClosures: ['finanzas'],
  cashMovements: ['finanzas'],
  paymentTransactions: ['finanzas','cuentas_cobrar','cuentas_pagar'],
  missingProductRequests: ['compras'],
  supplierReturns: ['compras'],
  supplierCredits: ['compras'],
  saleAdjustments: ['ventas'],
};

const EMPTY_STATE: State = {
  customers: [], quotes: [], suppliers: [], products: [], sales: [], purchases: [],
  purchaseCostHistory: [], expenses: [], receivables: [], payables: [],
  inventoryMovements: [], monthlyGoal: 100000, fixedExpenses: 25000,
  cashClosures: [], cashMovements: [], paymentTransactions: [],
  missingProductRequests: [], supplierReturns: [], supplierCredits: [], saleAdjustments: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function getBody(req: Req): Record<string, unknown> {
  if (isRecord(req.body)) return req.body;
  if (typeof req.body === 'string') {
    try { const parsed: unknown = JSON.parse(req.body); return isRecord(parsed) ? parsed : {}; }
    catch { return {}; }
  }
  return {};
}
function reply(res: Res, status: number, value: unknown) {
  return res.status(status).json(value);
}
function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
function roleOf(user: User): Role | null {
  const role = user.app_metadata?.farmi_role;
  return typeof role === 'string' && role in ROLE_MODULES ? role as Role : null;
}
function permissionsOf(user: User): Set<string> {
  const role = roleOf(user);
  if (!role || user.app_metadata?.farmi_active !== true || role === 'Solo lectura') return new Set();
  if (role === 'Administrador' || user.app_metadata?.farmi_admin === true) return new Set(ROLE_MODULES.Administrador);
  const raw = user.app_metadata?.farmi_permissions;
  if (!Array.isArray(raw)) return new Set();
  const allowed = new Set(ROLE_MODULES[role]);
  return new Set(raw.filter((item): item is string => typeof item === 'string' && allowed.has(item)));
}
function changedKeys(previous: State, next: State): string[] {
  return [...new Set([...Object.keys(previous), ...Object.keys(next)])]
    .filter(key => !jsonEqual(previous[key], next[key]));
}
function canWriteKey(key: string, permissions: Set<string>): boolean {
  const required = KEY_MODULES[key];
  if (!required) return false;
  return required.some(permission => permissions.has(permission));
}
function validSnapshot(value: unknown): value is State {
  if (!isRecord(value)) return false;
  return Object.keys(value).every(key => Object.prototype.hasOwnProperty.call(KEY_MODULES, key));
}

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Authorization');
  if (req.method !== 'POST') return reply(res, 405, { error: 'Usa POST para guardar los datos.' });

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return reply(res, 503, { error: 'El guardado seguro del ERP no está configurado en el servidor.' });

  const rawAuthorization = req.headers.authorization;
  const authorization = Array.isArray(rawAuthorization) ? rawAuthorization[0] : rawAuthorization;
  const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!accessToken) return reply(res, 401, { error: 'Inicia sesión para guardar los cambios.' });

  const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data: authData, error: authError } = await admin.auth.getUser(accessToken);
  const user = authData.user;
  if (authError || !user) return reply(res, 401, { error: 'La sesión no es válida o ha caducado.' });
  const permissions = permissionsOf(user);
  if (!permissions.size || user.app_metadata?.farmi_active !== true) {
    return reply(res, 403, { error: 'La cuenta no tiene permisos activos para guardar cambios.' });
  }

  const body = getBody(req);
  const action = body.action;
  if (action !== 'snapshot' && action !== 'quotes') return reply(res, 400, { error: 'Operación de guardado desconocida.' });

  let current: { state: State; updated_at: string } | null = null;
  const { data: existing, error: readError } = await admin.from('erp_state')
    .select('state,updated_at').eq('user_id', user.id).maybeSingle();
  if (readError) {
    console.error('[erp-state] Read failed', readError);
    return reply(res, 500, { error: 'No se pudo leer la versión actual de los datos.' });
  }
  if (existing) {
    if (!isRecord(existing.state) || typeof existing.updated_at !== 'string') {
      return reply(res, 500, { error: 'El registro ERP no tiene una versión válida.' });
    }
    current = { state: existing.state, updated_at: existing.updated_at };
  }

  if (action === 'quotes') {
    if (!permissions.has('cotizaciones')) return reply(res, 403, { error: 'No tienes permiso para modificar cotizaciones.' });
    if (!Array.isArray(body.quotes)) return reply(res, 400, { error: 'La lista de cotizaciones no es válida.' });
    const nextState = { ...(current?.state ?? EMPTY_STATE), quotes: body.quotes };
    const nextRevision = new Date(Math.max(Date.now(), current ? Date.parse(current.updated_at) + 1 : 0)).toISOString();
    if (!current) {
      const { error } = await admin.from('erp_state').insert({ user_id: user.id, state: nextState, updated_at: nextRevision });
      if (error) return reply(res, error.code === '23505' ? 409 : 500, { error: 'No se pudo crear el registro de cotizaciones. Recarga y vuelve a intentar.' });
    } else {
      const { data, error } = await admin.from('erp_state').update({ state: nextState, updated_at: nextRevision })
        .eq('user_id', user.id).eq('updated_at', current.updated_at).select('updated_at').maybeSingle();
      if (error || !data) return reply(res, error ? 500 : 409, { error: 'Los datos cambiaron desde otra sesión. Recarga antes de guardar.' });
    }
    return reply(res, 200, { updatedAt: nextRevision });
  }

  if (!validSnapshot(body.snapshot)) return reply(res, 400, { error: 'Los datos enviados no tienen un formato válido.' });
  const nextState = body.snapshot;
  if (!current) {
    // A new account receives an empty server-owned baseline. Business records
    // must be added in a later, permission-checked save, never imported blindly.
    const nonEmpty = Object.keys(nextState).filter(key => {
      const value = nextState[key];
      if (Array.isArray(value)) return value.length > 0;
      if (key === 'monthlyGoal') return value !== 100000;
      if (key === 'fixedExpenses') return value !== 25000;
      return value !== undefined && value !== null;
    });
    if (nonEmpty.some(key => !canWriteKey(key, permissions))) {
      return reply(res, 403, { error: 'No puedes inicializar datos de módulos que no tienes autorizados.' });
    }
    const seeded = { ...EMPTY_STATE, ...nextState };
    const nextRevision = new Date().toISOString();
    const { error } = await admin.from('erp_state').insert({ user_id: user.id, state: seeded, updated_at: nextRevision });
    if (error) return reply(res, error.code === '23505' ? 409 : 500, { error: 'No se pudo inicializar el registro. Recarga antes de guardar.' });
    return reply(res, 200, { updatedAt: nextRevision });
  }

  const expectedRevision = typeof body.expectedUpdatedAt === 'string' ? body.expectedUpdatedAt : '';
  if (!expectedRevision || expectedRevision !== current.updated_at) {
    return reply(res, 409, { error: 'Los datos cambiaron desde otra sesión. Recarga el ERP antes de guardar.' });
  }
  const changed = changedKeys(current.state, nextState);
  const unauthorized = changed.filter(key => !canWriteKey(key, permissions));
  if (unauthorized.length) {
    return reply(res, 403, { error: 'Tu cuenta no tiene permisos para modificar uno o más módulos incluidos en este guardado.' });
  }

  const nextRevision = new Date(Math.max(Date.now(), Date.parse(current.updated_at) + 1)).toISOString();
  const { data, error } = await admin.from('erp_state').update({ state: nextState, updated_at: nextRevision })
    .eq('user_id', user.id).eq('updated_at', current.updated_at).select('updated_at').maybeSingle();
  if (error) {
    console.error('[erp-state] Update failed', error);
    return reply(res, 500, { error: 'No se pudo confirmar el guardado en el servidor.' });
  }
  if (!data) return reply(res, 409, { error: 'Otra sesión guardó cambios primero. No se sobrescribieron sus datos; recarga el ERP.' });
  return reply(res, 200, { updatedAt: data.updated_at });
}
