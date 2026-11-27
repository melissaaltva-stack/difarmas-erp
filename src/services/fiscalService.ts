import type { FiscalBillingInfo } from '../domain/types';

/**
 * Validates the SAR authorization before a POS invoice is issued.
 * Returns an actionable error message, or null when the invoice may proceed.
 */
export function normalizeFiscalCode(value: string | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

export function validateFiscalAuthorization(
  fiscal: FiscalBillingInfo | undefined,
  invoiceSequence: number,
): string | null {
  if (!fiscal?.cai?.trim()) return null;

  const invoiceSeries = (fiscal.invoiceSeries ?? '').trim();
  const rangeStartDigits = normalizeFiscalCode(fiscal.authorizedRangeStart);
  const rangeEndDigits = normalizeFiscalCode(fiscal.authorizedRangeEnd);

  if (!invoiceSeries || !rangeStartDigits || !rangeEndDigits) {
    return 'Completa el CAI, la serie de facturación y los rangos desde/hasta antes de emitir una factura.';
  }

  if (!/^\d{3}-\d{3}-\d{2}$/.test(invoiceSeries)) {
    return 'La serie de facturación debe usar el formato 000-000-00, por ejemplo 001-001-01.';
  }

  if (!/^\d{8}$/.test(rangeStartDigits) || !/^\d{8}$/.test(rangeEndDigits)) {
    return 'Los rangos desde y hasta deben contener exactamente 8 dígitos.';
  }

  const rangeStart = Number(rangeStartDigits);
  const rangeEnd = Number(rangeEndDigits);
  if (!Number.isSafeInteger(rangeStart) || !Number.isSafeInteger(rangeEnd) || rangeStart > rangeEnd) {
    return 'Revisa el rango autorizado: el inicio no puede ser mayor que el final.';
  }

  if (!Number.isInteger(invoiceSequence) || invoiceSequence < rangeStart || invoiceSequence > rangeEnd) {
    return 'El próximo número está fuera del rango autorizado. Revisa el rango y la numeración de facturas.';
  }

  return null;
}
