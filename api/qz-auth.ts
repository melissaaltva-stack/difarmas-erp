import { createClient, type User } from '@supabase/supabase-js';

export type QzRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};
export type QzResponse = {
  status(code: number): QzResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
};

export type QzAuthResult =
  | { ok: true; user: User }
  | { ok: false; status: number; error: string };

export async function authorizeQzRequest(req: QzRequest): Promise<QzAuthResult> {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { ok: false, status: 503, error: 'No está configurada la autenticación segura de FARMI en el servidor.' };

  const authorization = req.headers.authorization;
  const headerValue = Array.isArray(authorization) ? authorization[0] : authorization;
  const token = headerValue?.startsWith('Bearer ') ? headerValue.slice(7).trim() : '';
  if (!token) return { ok: false, status: 401, error: 'Inicia sesión para utilizar la impresión directa.' };

  try {
    const client = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return { ok: false, status: 401, error: 'La sesión no es válida o ha caducado. Inicia sesión de nuevo.' };
    if (data.user.app_metadata?.farmi_active === false) {
      return { ok: false, status: 403, error: 'Esta cuenta está desactivada y no puede imprimir.' };
    }
    return { ok: true, user: data.user };
  } catch {
    return { ok: false, status: 503, error: 'No se pudo validar la sesión para imprimir.' };
  }
}
