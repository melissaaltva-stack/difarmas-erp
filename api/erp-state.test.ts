import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  createClient: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
import handler from './erp-state';

function response() {
  const value: { statusCode?: number; body?: unknown; headers: Record<string, string> } = { headers: {} };
  const res = {
    setHeader: (name: string, header: string) => { value.headers[name] = header; },
    status: (code: number) => { value.statusCode = code; return res; },
    json: (body: unknown) => { value.body = body; },
  };
  return { value, res };
}
function setupUser(role: string, permissions: string[]) {
  mocks.getUser.mockResolvedValue({
    data: { user: { id: 'user-1', app_metadata: { farmi_active: true, farmi_role: role, farmi_permissions: permissions } } },
    error: null,
  });
}
function setupDatabase(state: Record<string, unknown>, updatedAt = '2026-11-04T10:00:00.000Z') {
  mocks.maybeSingle.mockResolvedValue({ data: { state, updated_at: updatedAt }, error: null });
  mocks.update.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ eq: mocks.eq, select: mocks.select });
  mocks.select.mockReturnValue({ maybeSingle: mocks.maybeSingle });
}

describe('ERP server-side write authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
    mocks.createClient.mockReturnValue({
      auth: { getUser: mocks.getUser },
      from: mocks.from,
    });
    mocks.from.mockReturnValue({
      select: mocks.select,
      eq: mocks.eq,
      insert: mocks.insert,
      update: mocks.update,
    });
    mocks.select.mockReturnValue({ eq: mocks.eq, maybeSingle: mocks.maybeSingle });
    mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle, eq: mocks.eq, select: mocks.select });
  });

  it('rejects read-only accounts even when they can view the module', async () => {
    setupUser('Solo lectura', ['dashboard', 'inventario', 'ventas', 'finanzas']);
    const { value, res } = response();
    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: { action: 'snapshot', expectedUpdatedAt: '2026-11-04T10:00:00.000Z', snapshot: { products: [{ id: 1 }] } },
    } as never, res as never);

    expect(value.statusCode).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('allows a sales operator to change sales but rejects an inventory change in the same snapshot', async () => {
    setupUser('Ventas', ['dashboard', 'ventas', 'clientes']);
    setupDatabase({ sales: [], products: [] });
    const { value, res } = response();
    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: {
        action: 'snapshot',
        expectedUpdatedAt: '2026-11-04T10:00:00.000Z',
        snapshot: { sales: [{ id: 1 }], products: [{ id: 1 }] },
      },
    } as never, res as never);

    expect(value.statusCode).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects stale snapshot revisions before writing', async () => {
    setupUser('Ventas', ['ventas']);
    setupDatabase({ sales: [] }, '2026-11-04T10:00:00.000Z');
    const { value, res } = response();
    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: {
        action: 'snapshot',
        expectedUpdatedAt: '2026-11-04T09:00:00.000Z',
        snapshot: { sales: [{ id: 1 }] },
      },
    } as never, res as never);

    expect(value.statusCode).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects requests without a valid bearer token', async () => {
    const { value, res } = response();
    await handler({ method: 'POST', headers: {}, body: { action: 'snapshot' } } as never, res as never);
    expect(value.statusCode).toBe(401);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
});
