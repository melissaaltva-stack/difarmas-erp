import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['select', 'eq', 'insert', 'update', 'maybeSingle', 'single']) query[method] = vi.fn();
  return { query, client: { from: vi.fn(() => query) } };
});

vi.mock('./supabaseClient', () => ({ requireSupabase: () => mocks.client }));

const emptySnapshot = {
  customers: [], products: [], sales: [], purchases: [], expenses: [],
  receivables: [], payables: [], inventoryMovements: [],
  monthlyGoal: 100000, fixedExpenses: 25000,
};

function chainQuery() {
  for (const method of ['select', 'eq', 'insert', 'update']) mocks.query[method].mockReturnValue(mocks.query);
}

describe('remoteErpState', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    chainQuery();
  });

  it('returns null when the account has no cloud snapshot', async () => {
    mocks.query.maybeSingle.mockResolvedValue({ data: null, error: null });
    const { loadErpSnapshot } = await import('./remoteErpState');
    await expect(loadErpSnapshot('user-1')).resolves.toBeNull();
    expect(mocks.client.from).toHaveBeenCalledWith('erp_state');
    expect(mocks.query.eq).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('loads and normalizes a valid cloud snapshot', async () => {
    mocks.query.maybeSingle.mockResolvedValue({
      data: { user_id: 'user-1', updated_at: '2026-10-17T12:00:00.000Z', state: { products: [{ id: 1 }], monthlyGoal: 50000 } },
      error: null,
    });
    const { loadErpSnapshot } = await import('./remoteErpState');
    const result = await loadErpSnapshot('user-1');
    expect(result).toMatchObject({ ...emptySnapshot, products: [{ id: 1 }], monthlyGoal: 50000 });
  });

  it('rejects a snapshot that belongs to a different account', async () => {
    mocks.query.maybeSingle.mockResolvedValue({
      data: { user_id: 'other-user', updated_at: '2026-10-17T12:00:00.000Z', state: emptySnapshot },
      error: null,
    });
    const { loadErpSnapshot } = await import('./remoteErpState');
    await expect(loadErpSnapshot('user-1')).rejects.toThrow(/propietario/);
  });

  it('does not overwrite a cloud record created after the initial read', async () => {
    mocks.query.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    mocks.query.single.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key' } });
    const { loadErpSnapshot, saveErpSnapshot } = await import('./remoteErpState');
    await loadErpSnapshot('user-1');
    await expect(saveErpSnapshot('user-1', emptySnapshot)).rejects.toThrow(/otra sesión/);
    expect(mocks.query.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'user-1' }));
  });

  it('reports a revision conflict rather than silently overwriting newer data', async () => {
    mocks.query.maybeSingle
      .mockResolvedValueOnce({ data: { user_id: 'user-1', updated_at: '2026-10-17T12:00:00.000Z', state: emptySnapshot }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    const { loadErpSnapshot, saveErpSnapshot } = await import('./remoteErpState');
    await loadErpSnapshot('user-1');
    await expect(saveErpSnapshot('user-1', emptySnapshot)).rejects.toThrow(/cambios más recientes/);
    expect(mocks.query.update).toHaveBeenCalledWith(expect.objectContaining({ state: emptySnapshot }));
  });
});
