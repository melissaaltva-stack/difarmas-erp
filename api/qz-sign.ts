import { createSign } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

type QzRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};
type QzResponse = {
  status(code: number): QzResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
};

async function authorizeQzRequest(req: QzRequest): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { ok: false, status: 503, error: 'No está configurada la autenticación segura de FARMI en el servidor.' };
  const authorization = req.headers.authorization;
  const headerValue = Array.isArray(authorization) ? authorization[0] : authorization;
  const token = headerValue?.startsWith('Bearer ') ? headerValue.slice(7).trim() : '';
  if (!token) return { ok: false, status: 401, error: 'Inicia sesión para utilizar la impresión directa.' };
  try {
    const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return { ok: false, status: 401, error: 'La sesión no es válida o ha caducado. Inicia sesión de nuevo.' };
    if (data.user.app_metadata?.farmi_active === false) return { ok: false, status: 403, error: 'Esta cuenta está desactivada y no puede imprimir.' };
    return { ok: true };
  } catch {
    return { ok: false, status: 503, error: 'No se pudo validar la sesión para imprimir.' };
  }
}

const MAX_QZ_SIGN_BYTES = 64 * 1024;

function getRequestBody(body: unknown): Record<string, unknown> {
  if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>;
  if (typeof body === 'string') {
    try {
      const parsed: unknown = JSON.parse(body);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return {};
}

export default async function handler(req: QzRequest, res: QzResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Authorization');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST para firmar la solicitud.' });

  const body = getRequestBody(req.body);
  const request = typeof body.request === 'string' ? body.request : '';
  if (!request || Buffer.byteLength(request, 'utf8') > MAX_QZ_SIGN_BYTES) {
    return res.status(413).json({ error: 'La solicitud de impresión está vacía o supera el tamaño permitido.' });
  }

  const certificate = process.env.QZ_CERTIFICATE?.replace(/\\n/g, '\n').trim();
  const privateKey = process.env.QZ_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
  if (!certificate || !privateKey) {
    return res.status(503).json({ error: 'Falta configurar las claves seguras de QZ Tray en el servidor.' });
  }

  const auth = await authorizeQzRequest(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  try {
    const signer = createSign('RSA-SHA512');
    signer.update(request, 'utf8');
    signer.end();
    const signature = signer.sign(privateKey, 'base64');
    return res.status(200).json({ signature });
  } catch (error) {
    console.error('[qz-sign] No se pudo generar la firma.', error instanceof Error ? error.message : 'unknown');
    return res.status(500).json({ error: 'No se pudo firmar la solicitud de impresión.' });
  }
}
