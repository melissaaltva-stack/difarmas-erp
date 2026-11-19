import { supabase } from './supabaseClient';

type QzApi = {
  security: {
    setCertificatePromise: (callback: (resolve: (certificate: string) => void, reject: (reason: unknown) => void) => void) => void;
    setSignaturePromise: (callback: (toSign: string) => (resolve: (signature: string) => void, reject: (reason: unknown) => void) => void) => void;
  };
  websocket: {
    isActive: () => boolean;
    connect: (options?: { retries?: number; delay?: number }) => Promise<unknown>;
  };
  printers: {
    getDefault: () => Promise<string>;
    find: () => Promise<string[]>;
  };
  configs: {
    create: (printer: string, options: Record<string, unknown>) => unknown;
  };
  print: (config: unknown, data: unknown[]) => Promise<unknown>;
};

let qzPromise: Promise<QzApi> | null = null;

async function loadQz(): Promise<QzApi> {
  if (!qzPromise) {
    qzPromise = import('qz-tray').then(module => {
      const loaded = module as unknown as { default?: unknown };
      return (loaded.default ?? module) as QzApi;
    }).catch(error => {
      qzPromise = null;
      throw error;
    });
  }
  return qzPromise;
}

async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session?.access_token ?? null;
}

async function configureSigning(qz: QzApi, token: string | null): Promise<boolean> {
  if (!token) return false;

  const certificateResponse = await fetch('/api/qz-certificate', {
    method: 'GET',
    cache: 'no-store',
    headers: { Authorization: 'Bearer ' + token },
  });

  // When the signing key pair has not been configured yet, QZ Tray can still
  // connect in its normal permission-prompt mode. Silent printing is enabled
  // automatically once the certificate/private key are configured on Vercel.
  if (certificateResponse.status === 404 || certificateResponse.status === 503) return false;
  if (!certificateResponse.ok) {
    throw new Error('No se pudo validar el permiso de impresión. Inicia sesión de nuevo y vuelve a intentarlo.');
  }

  const payload = await certificateResponse.json() as { certificate?: string };
  if (!payload.certificate) throw new Error('El certificado de impresión directa no está configurado correctamente.');

  qz.security.setCertificatePromise((resolve, reject) => {
    if (payload.certificate) resolve(payload.certificate);
    else reject(new Error('No se recibió el certificado de QZ Tray.'));
  });

  qz.security.setSignaturePromise(toSign => (resolve, reject) => {
    fetch('/api/qz-sign', {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ request: toSign }),
    }).then(async response => {
      if (!response.ok) throw new Error('No se pudo firmar la solicitud de impresión.');
      const result = await response.json() as { signature?: string };
      if (!result.signature) throw new Error('El servidor no devolvió la firma de impresión.');
      resolve(result.signature);
    }).catch(reject);
  });

  return true;
}

function measureReceiptHeightMm(html: string): Promise<number> {
  return new Promise(resolve => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.title = 'Medición de ticket térmico';
    iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:80mm;height:300mm;border:0;visibility:hidden;pointer-events:none;';
    let finished = false;

    const finish = (height: number) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(fallbackTimer);
      iframe.remove();
      resolve(height);
    };

    const fallbackTimer = window.setTimeout(() => finish(140), 3000);
    iframe.onload = async () => {
      try {
        const doc = iframe.contentDocument;
        if (!doc) return finish(140);
        const override = doc.createElement('style');
        override.textContent = 'html,body{margin:0!important;padding:0!important;background:#fff!important}.receipt{width:72mm!important;max-width:72mm!important;min-height:0!important;padding:3mm 0 4mm!important;box-shadow:none!important}';
        doc.head.appendChild(override);

        await Promise.all(Array.from(doc.images).map(image => image.complete
          ? Promise.resolve()
          : new Promise<void>(done => {
              image.onload = () => done();
              image.onerror = () => done();
            })));

        const receipt = doc.querySelector<HTMLElement>('.receipt');
        if (!receipt) return finish(140);
        const heightMm = Math.ceil(receipt.getBoundingClientRect().height * 25.4 / 96 + 5);
        finish(Math.max(55, Math.min(1500, heightMm)));
      } catch {
        finish(140);
      }
    };

    document.body.appendChild(iframe);
    iframe.srcdoc = html;
  });
}

export async function printThermalReceipt(html: string, invoiceNumber: string): Promise<{ printer: string; signed: boolean }> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('La impresión directa solo está disponible desde el navegador de la computadora.');
  }

  const [qz, token] = await Promise.all([loadQz(), getAccessToken()]);
  const signed = await configureSigning(qz, token);

  if (!qz.websocket.isActive()) {
    await qz.websocket.connect({ retries: 5, delay: 1 });
  }

  let printer = '';
  try {
    printer = await qz.printers.getDefault();
  } catch {
    printer = '';
  }

  if (!printer) {
    const printers = await qz.printers.find();
    if (printers.length === 1) printer = printers[0];
    else throw new Error(printers.length
      ? 'Windows no tiene una impresora predeterminada. Selecciona tu impresora térmica como predeterminada una sola vez.'
      : 'QZ Tray está abierto, pero no detecta impresoras instaladas en Windows.');
  }

  if (/microsoft print to pdf|onenote|fax/i.test(printer)) {
    const printers = await qz.printers.find();
    const thermal = printers.find(name => /thermal|receipt|ticket|pos|xprinter|epson|star|citizen|zjiang|zjiang|zj-/i.test(name));
    if (thermal) printer = thermal;
  }

  const pageHeightMm = await measureReceiptHeightMm(html);
  const pageHtml = html.replace(
    /@page\{size:80mm\s+200mm;margin:0\}/,
    '@page{size:80mm ' + pageHeightMm + 'mm;margin:0}',
  );
  const config = qz.configs.create(printer, {
    units: 'mm',
    size: { width: 80, height: pageHeightMm },
    margins: 0,
    orientation: 'portrait',
    scaleContent: false,
    colorType: 'grayscale',
    jobName: 'Factura ' + (invoiceNumber || ''),
  });

  await qz.print(config, [{
    type: 'pixel',
    format: 'html',
    flavor: 'plain',
    data: pageHtml,
    options: {
      pageWidth: 80 / 25.4,
      pageHeight: pageHeightMm / 25.4,
    },
  }]);

  return { printer, signed };
}
