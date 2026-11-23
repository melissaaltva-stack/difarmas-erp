import { describe, expect, it } from 'vitest';
import type { FiscalBillingInfo } from '../domain/types';
import { normalizeFiscalCode, validateFiscalAuthorization } from './fiscalService';

const validFiscal: FiscalBillingInfo = {
  cai: 'TEST-CAI',
  invoiceSeries: '001-001-01',
  authorizedRangeStart: '00002156',
  authorizedRangeEnd: '00003000',
};

describe('validateFiscalAuthorization', () => {
  it('accepts a valid correlativo at the start of the authorized range', () => {
    expect(validateFiscalAuthorization(validFiscal, 2156)).toBeNull();
  });

  it('accepts a valid correlativo at the end of the authorized range', () => {
    expect(validateFiscalAuthorization(validFiscal, 3000)).toBeNull();
  });

  it('does not require fiscal settings when no CAI is configured', () => {
    expect(validateFiscalAuthorization({ ...validFiscal, cai: '' }, 1)).toBeNull();
  });

  it('requires only the CAI, invoice series and authorized range', () => {
    expect(validateFiscalAuthorization({ ...validFiscal, invoiceSeries: '' }, 2156)).toMatch(/serie de facturación/);
    expect(validateFiscalAuthorization({ ...validFiscal, authorizedRangeStart: '' }, 2156)).toMatch(/rangos desde\/hasta/);
    expect(validateFiscalAuthorization({ ...validFiscal, authorizedRangeEnd: '' }, 2156)).toMatch(/rangos desde\/hasta/);
  });

  it('rejects a malformed invoice series', () => {
    expect(validateFiscalAuthorization({ ...validFiscal, invoiceSeries: '001-01-01' }, 2156)).toMatch(/formato 000-000-00/);
  });

  it('normalizes separators and spaces in range values', () => {
    const formatted = { ...validFiscal, authorizedRangeStart: '00 00-2156', authorizedRangeEnd: '0000-3000' };
    expect(normalizeFiscalCode(formatted.authorizedRangeStart)).toBe('00002156');
    expect(validateFiscalAuthorization(formatted, 2156)).toBeNull();
  });

  it('rejects malformed ranges and out-of-range correlativos', () => {
    expect(validateFiscalAuthorization({ ...validFiscal, authorizedRangeStart: 'bad' }, 2156)).toMatch(/exactamente 8 dígitos/);
    expect(validateFiscalAuthorization(validFiscal, 3001)).toMatch(/fuera del rango/);
    expect(validateFiscalAuthorization({ ...validFiscal, authorizedRangeStart: '00003001' }, 3001)).toMatch(/inicio no puede ser mayor/);
  });
});
