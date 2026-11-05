import { describe, expect, it } from 'vitest';
import { safePermissions, safeRole } from './admin-users';

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
  it('accepts absent content length and small valid requests', async () => {
    const { isAdminBodySizeAllowed } = await import('./admin-users');
    expect(isAdminBodySizeAllowed(undefined)).toBe(true);
    expect(isAdminBodySizeAllowed('1024')).toBe(true);
    expect(isAdminBodySizeAllowed(0)).toBe(true);
  });

  it('rejects oversized, negative, malformed, and unsafe lengths', async () => {
    const { isAdminBodySizeAllowed, MAX_ADMIN_BODY_BYTES } = await import('./admin-users');
    expect(isAdminBodySizeAllowed(String(MAX_ADMIN_BODY_BYTES + 1))).toBe(false);
    expect(isAdminBodySizeAllowed('-1')).toBe(false);
    expect(isAdminBodySizeAllowed('not-a-number')).toBe(false);
    expect(isAdminBodySizeAllowed('9007199254740992')).toBe(false);
  });
});
