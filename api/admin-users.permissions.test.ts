import { describe, expect, it } from 'vitest';
import { isAdminBodySizeAllowed, MAX_ADMIN_BODY_BYTES, safeAuthUserId, safePermissions, safeRole } from './admin-users';

describe('safePermissions', () => {
  it('never lets Ventas gain inventory, finance, or configuration access', () => {
    expect(safePermissions('Ventas', ['ventas', 'inventario', 'finanzas', 'configuracion']))
      .toEqual(['ventas']);
  });

  it('allows a role to have a narrower custom permission list', () => {
    expect(safePermissions('Compras', ['compras']))
      .toEqual(['compras']);
  });

  it('uses the role baseline when custom permissions are missing or malformed', () => {
    expect(safePermissions('Finanzas', null)).toContain('cuentas_pagar');
    expect(safePermissions('Finanzas', 'finanzas')).toContain('reportes');
  });

  it('does not allow Solo lectura to gain configuration access', () => {
    expect(safePermissions('Solo lectura', ['dashboard', 'configuracion']))
      .toEqual(['dashboard']);
  });

  it('grants the complete module list only to Administrador', () => {
    expect(safePermissions('Administrador', ['ventas'])).toContain('configuracion');
  });

  it('removes duplicates and non-string or unknown modules', () => {
    expect(safePermissions('Ventas', ['ventas', 'ventas', 'unknown', 42]))
      .toEqual(['ventas']);
  });
});

describe('safeRole', () => {
  it('defaults missing or unknown roles to least privilege', () => {
    expect(safeRole(undefined)).toBe('Solo lectura');
    expect(safeRole('Owner')).toBe('Solo lectura');
    expect(safeRole(null)).toBe('Solo lectura');
  });

  it('preserves explicitly recognized roles', () => {
    expect(safeRole('Ventas')).toBe('Ventas');
    expect(safeRole('Administrador')).toBe('Administrador');
  });
});


describe('admin request size limit', () => {
  it('accepts absent content length and small valid requests', () => {
    expect(isAdminBodySizeAllowed(undefined)).toBe(true);
    expect(isAdminBodySizeAllowed('1024')).toBe(true);
    expect(isAdminBodySizeAllowed(0)).toBe(true);
  });

  it('rejects oversized, negative, malformed, and unsafe lengths', () => {
    expect(isAdminBodySizeAllowed(String(MAX_ADMIN_BODY_BYTES + 1))).toBe(false);
    expect(isAdminBodySizeAllowed('-1')).toBe(false);
    expect(isAdminBodySizeAllowed('not-a-number')).toBe(false);
    expect(isAdminBodySizeAllowed('9007199254740992')).toBe(false);
  });

  it('enforces the actual body size even when Content-Length is absent', () => {
    expect(isAdminBodySizeAllowed(undefined, { note: 'ok' })).toBe(true);
    expect(isAdminBodySizeAllowed(undefined, 'x'.repeat(MAX_ADMIN_BODY_BYTES))).toBe(true);
    expect(isAdminBodySizeAllowed(undefined, 'x'.repeat(MAX_ADMIN_BODY_BYTES + 1))).toBe(false);
  });

  it('rejects a body that exceeds the limit even when the declared length is small', () => {
    expect(isAdminBodySizeAllowed('1', { payload: 'x'.repeat(MAX_ADMIN_BODY_BYTES) })).toBe(false);
  });
});


describe('safeAuthUserId', () => {
  it('accepts canonical Supabase Auth UUID identifiers', () => {
    expect(safeAuthUserId('550e8400-e29b-41d4-a716-446655440000'))
      .toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(safeAuthUserId('  550e8400-e29b-41d4-a716-446655440000  '))
      .toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('rejects malformed, oversized, and non-string identifiers', () => {
    expect(safeAuthUserId('admin')).toBe('');
    expect(safeAuthUserId('550e8400-e29b-41d4-a716-44665544000')).toBe('');
    expect(safeAuthUserId('x'.repeat(10000))).toBe('');
    expect(safeAuthUserId(null)).toBe('');
    expect(safeAuthUserId(42)).toBe('');
  });
});
