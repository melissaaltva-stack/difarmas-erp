import { authorizeQzRequest, type QzRequest, type QzResponse } from './qz-auth';

export default async function handler(req: QzRequest, res: QzResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Authorization');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Usa GET para consultar el certificado.' });

  const certificate = process.env.QZ_CERTIFICATE?.replace(/\\n/g, '\n').trim();
  if (!certificate) return res.status(404).json({ configured: false });

  const auth = await authorizeQzRequest(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  if (!certificate.includes('BEGIN CERTIFICATE')) {
    return res.status(500).json({ error: 'El certificado de impresión no tiene un formato válido.' });
  }
  return res.status(200).json({ certificate });
}
