import { createClient } from '@supabase/supabase-js';

type Req = { method?: string };
type Res = {
  status(code: number): Res;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
};
type ProductRecord = Record<string, unknown>;

function reply(res: Res, status: number, body: unknown) {
  return res.status(status).json(body);
}
function asRecord(value: unknown): ProductRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as ProductRecord
    : null;
}
function safeText(value: unknown, max = 180): string {
  return String(value ?? '').trim().slice(0, max);
}
function safeImage(value: unknown): string {
  const candidate = safeText(value, 2000);
  return /^https:\/\//i.test(candidate) ? candidate : '';
}
function publicCategory(value: unknown): string {
  const category = safeText(value, 80).toLocaleLowerCase('es-HN');
  if (category.includes('higiene')) return 'Higiene';
  if (category.includes('personal') || category.includes('bebe') || category.includes('bebé')) return 'Cuidado personal';
  if (category.includes('vitamina') || category.includes('suplement')) return 'Vitaminas';
  if (category.includes('medic') || category.includes('farmac')) return 'Medicamentos';
  return 'Bienestar';
}
function publicProduct(value: unknown) {
  const product = asRecord(value);
  if (!product || product.active === false) return null;
  const name = safeText(product.name, 180);
  const id = safeText(product.id, 80) || safeText(product.code, 80);
  const rawPrice = product.retail;
  const price = rawPrice === null || rawPrice === undefined || rawPrice === ''
    ? Number.NaN
    : Number(rawPrice);
  if (!id || !name || !Number.isFinite(price) || price < 0) return null;

  return {
    id,
    code: safeText(product.code, 80),
    name,
    category: publicCategory(product.category),
    description: [safeText(product.presentation, 120), safeText(product.laboratory, 100)].filter(Boolean).join(' · ')
      || 'Consulta disponibilidad en DIFARMÁS.',
    price,
    currency: 'HNL',
    imageUrl: safeImage(product.imageUrl),
    tag: 'DIFARMÁS',
    mark: 'D',
  };
}

/**
 * Public read-only catalog for the DIFARMÁS online storefront.
 * Only customer-facing fields are returned; inventory cost, stock, lot,
 * expiry, supplier, and the full ERP snapshot are never exposed.
 */
export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Accept');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return reply(res, 405, { error: 'Método no permitido.' });
  }

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const userId = process.env.FARMI_STORE_CATALOG_USER_ID;

  if (!url || !serviceKey || !userId) {
    return reply(res, 503, { configured: false, products: [] });
  }

  try {
      const serverKeys = [...new Set([
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      process.env.SUPABASE_SECRET_KEY,
    ].filter((key): key is string => Boolean(key?.trim())))];
    if (!serverKeys.length) {
      return reply(res, 503, { configured: false, products: [] });
    }

    let row: { state: unknown; updated_at: string | null } | null = null;
    let querySucceeded = false;
    let lastFailure: { status?: number; code?: string } | null = null;

    for (const key of serverKeys) {
      const supabase = createClient(url.replace(/\\/+$/, ''), key, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      });
      const result = await supabase
        .from('erp_state')
        .select('state,updated_at')
        .eq('user_id', userId)
        .maybeSingle();
      if (!result.error) {
        row = result.data;
        querySucceeded = true;
        break;
      }
      lastFailure = {
        status: typeof result.error.status === 'number' ? result.error.status : undefined,
        code: typeof result.error.code === 'string' ? result.error.code : undefined,
      };
    }

    if (!querySucceeded) {
      console.error('[store-catalog] Supabase read failed', lastFailure);
      return reply(res, 502, {
        error: 'No se pudo consultar el catálogo del ERP.',
        ...(lastFailure?.status ? { upstreamStatus: lastFailure.status } : {}),
        ...(lastFailure?.code ? { upstreamCode: lastFailure.code } : {}),
      });
    }

    const state = asRecord(row?.state);
    const rawProducts = state?.products;
    const products = Array.isArray(rawProducts)
      ? rawProducts.map(publicProduct).filter((product): product is NonNullable<ReturnType<typeof publicProduct>> => product !== null)
      : [];

    return reply(res, 200, {
      configured: true,
      updatedAt: typeof row?.updated_at === 'string' ? row.updated_at : null,
      products,
    });
  } catch {
    return reply(res, 502, { error: 'No se pudo conectar con el catálogo del ERP.' });
  }
}
