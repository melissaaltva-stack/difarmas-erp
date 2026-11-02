import { describe, expect, it } from 'vitest';
import { scopeAssistantData } from './AiAssistant';
import type { Module } from '../domain/types';

const data = {
  products: [{ id: 1 }] as never[],
  sales: [{ id: 2 }] as never[],
  purchases: [{ id: 3 }] as never[],
  expenses: [{ id: 4 }] as never[],
  receivables: [{ id: 5 }] as never[],
  payables: [{ id: 6 }] as never[],
  movements: [{ id: 7 }] as never[],
};

describe('AI assistant permission scope', () => {
  it('does not expose financial or inventory data to an assistant-only user', () => {
    const scoped = scopeAssistantData(data, ['asistente_ia'] as Module[]);
    expect(scoped).toEqual({
      products: [], sales: [], purchases: [], expenses: [],
      receivables: [], payables: [], movements: [],
    });
  });

  it('exposes only the domains granted to a sales user', () => {
    const scoped = scopeAssistantData(data, ['asistente_ia', 'ventas'] as Module[]);
    expect(scoped.sales).toEqual(data.sales);
    expect(scoped.products).toEqual([]);
    expect(scoped.purchases).toEqual([]);
    expect(scoped.expenses).toEqual([]);
    expect(scoped.receivables).toEqual([]);
    expect(scoped.payables).toEqual([]);
    expect(scoped.movements).toEqual([]);
  });

  it('keeps inventory and purchasing access separate', () => {
    const scoped = scopeAssistantData(data, ['asistente_ia', 'inventario', 'compras'] as Module[]);
    expect(scoped.products).toEqual(data.products);
    expect(scoped.movements).toEqual(data.movements);
    expect(scoped.purchases).toEqual(data.purchases);
    expect(scoped.sales).toEqual([]);
    expect(scoped.expenses).toEqual([]);
    expect(scoped.receivables).toEqual([]);
    expect(scoped.payables).toEqual([]);
  });

  it('allows finance access to financial summaries but not inventory movements', () => {
    const scoped = scopeAssistantData(data, ['asistente_ia', 'finanzas'] as Module[]);
    expect(scoped.sales).toEqual(data.sales);
    expect(scoped.expenses).toEqual(data.expenses);
    expect(scoped.receivables).toEqual(data.receivables);
    expect(scoped.payables).toEqual(data.payables);
    expect(scoped.purchases).toEqual([]);
    expect(scoped.products).toEqual([]);
    expect(scoped.movements).toEqual([]);
  });

  it('allows receivables and payables independently', () => {
    const scoped = scopeAssistantData(data, ['asistente_ia', 'cuentas_cobrar'] as Module[]);
    expect(scoped.receivables).toEqual(data.receivables);
    expect(scoped.payables).toEqual([]);
    expect(scoped.expenses).toEqual([]);
  });
});
