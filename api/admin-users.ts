import { timingSafeEqual } from 'node:crypto';
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

const MODULES = [
  'dashboard', 'facturacion_estandar', 'ventas', 'redes_sociales', 'inventario',
  'clientes', 'cotizaciones', 'compras', 'finanzas', 'cuentas_cobrar',
  'cuentas_pagar', 'reportes', 'asistente_ia', 'proveedores', 'configuracion',
] as const;
const ROLE_PERMISSIONS: Record<Role, string[]> = {
  Administrador: [...MODULES],
  Supervisor: ['dashboard','facturacion_estandar','ventas','redes_sociales','clientes','cotizaciones','inventario','compras','finanzas','cuentas_cobrar','cuentas_pagar','reportes','asistente_ia','proveedores'],
  Ventas: ['dashboard','facturacion_estandar','ventas','redes_sociales','clientes','cotizaciones'],
  Compras: ['dashboard','inventario','compras','proveedores'],
  Finanzas: ['dashboard','facturacion_estandar','finanzas','cuentas_cobrar','cuentas_pagar','reportes','asistente_ia','compras'],
  'Solo lectura': ['dashboard','ventas','redes_sociales','clientes','cotizaciones','inventario','compras','finanzas','cuentas_cobrar','cuentas_pagar','reportes','asistente_ia','proveedores'],
};
const ROLES: Role[] = ['Administrador','Supervisor','Ventas','Compras','Finanzas','Solo lectura'];
const isRole = (value: unknown): value is Role => typeof value === 'string' && ROLES.includes(value as Role);
const isAdmin = (user: User) => user.app_metadata?.farmi_admin === true || user.app_metadata?.farmi_role === 'Administrador';

function safePermissions(role: Role, value: unknown): string[] {
  if (role === 'Administrador' && !Array.isArray(value)) return [...MODULES];
  if (!Array.isArray(value)) return [...ROLE_PERMISSIONS[role]];
  const allowed = new Set<string>(MODULES);
  const permissions = [...new Set(value.filter((item): item is string => typeof item === 'string' && allowed.has(item)))];
  return role === 'Administrador' ? [...MODULES] : permissions;
}
function constantTimeMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}
function getBody(req: Req): Record<string, unknown> {
  if (req.body && typeof req.body === 'object') return req.body as Record<string, unknown>;
  if (typeof req.body === 'string') {
    try { const value: unknown = JSON.parse(req.body); return value && typeof value === 'object' ? value as Record<string, unknown> : {}; }
    catch { return {}; }
  }
  return {};
}
function safeUser(user: User) {
  const metadata = user.app_metadata ?? {};
  return {
    id: user.id,
    email: user.email ?? '',
    name: String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email?.split('@')[0] ?? 'Usuario'),
    createdAt: user.created_at,
    lastSignInAt: user.last_sign_in_at ?? null,
    emailConfirmed: Boolean(user.email_confirmed_at),
    role: isRole(metadata.farmi_role) ? metadata.farmi_role : 'Ventas',
    permissions: safePermissions(isRole(metadata.farmi_role) ? metadata.farmi_role : 'Ventas', metadata.farmi_permissions),
    active: metadata.farmi_active !== false && !user.banned_until,
    isAdmin: isAdmin(user),
  };
}
function reply(res: Res, status: number, value: unknown) { return res.status(status).json(value); }

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Authorization');
  if (req.method === 'OPTIONS') return reply(res, 204, {});
  if (req.method !== 'POST') return reply(res, 405, { error: 'Usa POST para esta operación.' });

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return reply(res, 503, { error: 'Falta configurar el acceso administrativo seguro de Supabase en el servidor.' });

  const authorization = req.headers.authorization;
  const headerValue = Array.isArray(authorization) ? authorization[0] : authorization;
  const accessToken = headerValue?.startsWith('Bearer ') ? headerValue.slice(7).trim() : '';
  if (!accessToken) return reply(res, 401, { error: 'Inicia sesión para continuar.' });

  const adminClient = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data: currentData, error: authError } = await adminClient.auth.getUser(accessToken);
  if (authError || !currentData.user) return reply(res, 401, { error: 'La sesión no es válida o ha caducado. Inicia sesión de nuevo.' });
  if (currentData.user.app_metadata?.farmi_active === false) return reply(res, 403, { error: 'Esta cuenta está desactivada. Pide al administrador que reactive el acceso.' });
  const currentUser = currentData.user;
  const body = getBody(req);
  const action = typeof body.action === 'string' ? body.action : '';

  const listAllUsers = async (): Promise<User[]> => {
    const all: User[] = [];
    for (let page = 1; page <= 100; page += 1) {
      const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 100 });
      if (error) throw error;
      all.push(...data.users);
      if (data.users.length < 100) break;
    }
    return all;
  };
  const claimForRole = (role: Role, permissions: string[], active = true) => ({
    farmi_admin: role === 'Administrador',
    farmi_role: role,
    farmi_permissions: role === 'Administrador' ? [...MODULES] : permissions,
    farmi_active: active,
  });

  try {
    if (action === 'status') {
      const admins = (await listAllUsers()).filter(isAdmin);
      return reply(res, 200, { isAdmin: isAdmin(currentUser), canBootstrap: admins.length === 0 && Boolean(process.env.FARMI_ADMIN_BOOTSTRAP_TOKEN), email: currentUser.email ?? '' });
    }

    if (action === 'bootstrap') {
      if (isAdmin(currentUser)) return reply(res, 200, { isAdmin: true, message: 'Esta cuenta ya es administradora.' });
      const configured = process.env.FARMI_ADMIN_BOOTSTRAP_TOKEN ?? '';
      const supplied = typeof body.bootstrapToken === 'string' ? body.bootstrapToken : '';
      if (!configured || !constantTimeMatch(configured, supplied)) return reply(res, 403, { error: 'El código de activación no es válido.' });
      const users = await listAllUsers();
      if (users.some(isAdmin)) return reply(res, 409, { error: 'Ya existe una cuenta administradora. Inicia sesión con esa cuenta para gestionar usuarios.' });
      const { data, error } = await adminClient.auth.admin.updateUserById(currentUser.id, {
        app_metadata: { ...(currentUser.app_metadata ?? {}), ...claimForRole('Administrador', [...MODULES], true) },
      });
      if (error || !data.user) return reply(res, 400, { error: error?.message ?? 'No se pudo activar la administración.' });
      return reply(res, 200, { isAdmin: true, user: safeUser(data.user), message: 'Administración activada correctamente.' });
    }

    if (!isAdmin(currentUser)) return reply(res, 403, { error: 'Solo un administrador autorizado puede gestionar cuentas.' });

    if (action === 'list') {
      const users = await listAllUsers();
      return reply(res, 200, { users: users.map(safeUser).sort((a, b) => a.name.localeCompare(b.name, 'es')) });
    }

    if (action === 'create' || action === 'invite') {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const name = typeof body.name === 'string' ? body.name.trim().slice(0, 160) : '';
      const role = isRole(body.role) ? body.role : 'Ventas';
      const permissions = safePermissions(role, body.permissions);
      const password = typeof body.password === 'string' ? body.password : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply(res, 400, { error: 'Escribe un correo electrónico válido.' });
      if (!name) return reply(res, 400, { error: 'Escribe el nombre del colaborador.' });
      if (action === 'create' && password.length < 12) return reply(res, 400, { error: 'La contraseña temporal debe tener al menos 12 caracteres.' });

      const metadata = claimForRole(role, permissions, true);
      let newUser: User | null = null;
      if (action === 'create') {
        const { data, error } = await adminClient.auth.admin.createUser({
          email, password, email_confirm: true,
          user_metadata: { full_name: name },
          app_metadata: metadata,
        });
        if (error || !data.user) return reply(res, 400, { error: error?.message ?? 'No se pudo crear la cuenta.' });
        newUser = data.user;
      } else {
        const headerOrigin = req.headers.origin;
        const origin = (Array.isArray(headerOrigin) ? headerOrigin[0] : headerOrigin) || 'https://difarmas-erp.vercel.app';
        const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
          data: { full_name: name },
          redirectTo: origin,
        });
        if (error || !data.user) return reply(res, 400, { error: error?.message ?? 'No se pudo enviar la invitación. Comprueba la configuración de correo de Supabase.' });
        const { data: updated, error: updateError } = await adminClient.auth.admin.updateUserById(data.user.id, { app_metadata: metadata });
        if (updateError || !updated.user) return reply(res, 500, { error: 'Se creó la invitación, pero no se pudieron guardar los permisos. Revisa este usuario antes de que inicie sesión.' });
        newUser = updated.user;
      }
      return reply(res, 201, { user: safeUser(newUser), mode: action });
    }

    if (action === 'update') {
      const targetId = typeof body.userId === 'string' ? body.userId : '';
      if (!targetId) return reply(res, 400, { error: 'Falta el usuario que deseas actualizar.' });
      const { data: targetData, error: targetError } = await adminClient.auth.admin.getUserById(targetId);
      if (targetError || !targetData.user) return reply(res, 404, { error: 'No se encontró ese usuario.' });
      const target = targetData.user;
      const oldRole = isRole(target.app_metadata?.farmi_role) ? target.app_metadata.farmi_role : 'Ventas';
      const role = isRole(body.role) ? body.role : oldRole;
      const active = typeof body.active === 'boolean' ? body.active : (target.app_metadata?.farmi_active !== false && !target.banned_until);
      const permissions = safePermissions(role, body.permissions ?? target.app_metadata?.farmi_permissions);

      const allUsers = await listAllUsers();
      const adminCount = allUsers.filter(isAdmin).length;
      const demotesAdmin = isAdmin(target) && role !== 'Administrador';
      if ((demotesAdmin || !active) && (target.id === currentUser.id || (isAdmin(target) && adminCount <= 1))) {
        return reply(res, 409, { error: 'No puedes desactivar o quitar permisos de administrador a la última cuenta administradora.' });
      }
      const { data, error } = await adminClient.auth.admin.updateUserById(targetId, {
        app_metadata: { ...(target.app_metadata ?? {}), ...claimForRole(role, permissions, active) },
        ban_duration: active ? 'none' : '876000h',
      });
      if (error || !data.user) return reply(res, 400, { error: error?.message ?? 'No se pudieron guardar los cambios de usuario.' });
      return reply(res, 200, { user: safeUser(data.user) });
    }

    return reply(res, 400, { error: 'Operación de usuarios desconocida.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno al administrar usuarios.';
    return reply(res, 500, { error: message });
  }
}
