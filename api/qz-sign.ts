import { createSign } from 'node:crypto';
import { authorizeQzRequest, type QzRequest, type QzResponse } from './qz-auth';

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
