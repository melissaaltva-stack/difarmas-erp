import type { FiscalBillingInfo } from '../domain/types';
import { isValidDateOnly } from '../utils/dates';

/**
 * Validates the configured fiscal authorization before a POS invoice is issued.
 * Returns an actionable error message, or null when the invoice may proceed.
 */
export function validateFiscalAuthorization(
  fiscal: FiscalBillingInfo | undefined,
  invoiceSequence: number,
  now: Date = new Date(),
): string | null {
  if (!fiscal?.cai) return null;

  const complete = Boolean(
    fiscal.establishmentCode &&
    fiscal.emissionPoint &&
    fiscal.documentTypeCode &&
    fiscal.authorizedRangeStart &&
    fiscal.authorizedRangeEnd &&
    fiscal.authorizationExpiry,
  );
  if (!complete) {
    return 'Completa el CAI, establecimiento, punto de emisión, rango autorizado y fecha límite antes de emitir una factura fiscal.';
  }

  const configuredPoint = fiscal.establishmentCode + fiscal.emissionPoint;
  if (!/^\d{4}$/.test(configuredPoint) || !/^\d{2}$/.test(fiscal.documentTypeCode)) {
    return 'El código de establecimiento + punto de emisión debe sumar 4 dígitos y el código de documento debe tener 2 dígitos.';
  }

  const startMatch = fiscal.authorizedRangeStart.match(/(\d{8})$/);
  const endMatch = fiscal.authorizedRangeEnd.match(/(\d{8})$/);
  const rangeStart = startMatch ? Number(startMatch[1]) : NaN;
  const rangeEnd = endMatch ? Number(endMatch[1]) : NaN;
  if (!Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd) || rangeStart > rangeEnd) {
    return 'Revisa el rango autorizado: debe terminar en la numeración correlativa de 8 dígitos.';
  }

  const expiry = isValidDateOnly(fiscal.authorizationExpiry)
    ? Date.parse(fiscal.authorizationExpiry + 'T23:59:59')
    : NaN;
  if (!Number.isFinite(expiry) || expiry < now.getTime()) {
    return 'La autorización fiscal está vencida o la fecha límite no es válida. Actualiza los datos del SAR antes de emitir.';
  }

  if (!Number.isInteger(invoiceSequence) || invoiceSequence < rangeStart || invoiceSequence > rangeEnd) {
    return 'El próximo número está fuera del rango autorizado. Revisa la numeración en Configuración → Sistema.';
  }

  return null;
}
