import { describe, expect, it } from 'vitest';
import { safePermissions } from './admin-users';

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
