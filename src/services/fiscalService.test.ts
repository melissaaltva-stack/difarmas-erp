import { describe, expect, it } from 'vitest';
import type { FiscalBillingInfo } from '../domain/types';
import { validateFiscalAuthorization } from './fiscalService';

const validFiscal: FiscalBillingInfo = {
  cai: 'TEST-CAI',
  authorizedRangeStart: '0001-01-00000001',
  authorizedRangeEnd: '0001-01-00001000',
  authorizationExpiry: '2099-12-31',
  establishmentCode: '0001',
  emissionPoint: '01',
  documentTypeCode: '01',
  isvRate: 15,
  fiscalLegend: '',
};

describe('validateFiscalAuthorization', () => {
  it('accepts a valid correlativo within the authorized range', () => {
    expect(validateFiscalAuthorization(validFiscal, 12, new Date('2026-10-18T12:00:00'))).toBeNull();
  });

  it('does not require fiscal settings when no CAI is configured', () => {
    expect(validateFiscalAuthorization({ ...validFiscal, cai: '' }, 1)).toBeNull();
  });

  it('rejects missing fiscal authorization fields', () => {
    expect(validateFiscalAuthorization({ ...validFiscal, emissionPoint: '' }, 1)).toMatch(/Completa el CAI/);
  });

  it('rejects malformed establishment/document codes', () => {
    expect(validateFiscalAuthorization({ ...validFiscal, establishmentCode: 'A001' }, 1)).toMatch(/4 dígitos/);
  });

  it('rejects malformed ranges and out-of-range correlativos', () => {
    expect(validateFiscalAuthorization({ ...validFiscal, authorizedRangeStart: 'bad' }, 1)).toMatch(/rango autorizado/);
    expect(validateFiscalAuthorization(validFiscal, 1001)).toMatch(/fuera del rango/);
  });

  it('rejects expired authorizations', () => {
    expect(validateFiscalAuthorization({ ...validFiscal, authorizationExpiry: '2020-01-01' }, 1, new Date('2026-10-18T12:00:00'))).toMatch(/vencida/);
  });
});
