import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  listUsers: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}));

import handler from './admin-users';

function response() {
  const value: { statusCode?: number; body?: unknown; headers: Record<string, string> } = { headers: {} };
  const res = {
    setHeader: (name: string, header: string) => { value.headers[name] = header; },
    status: (code: number) => { value.statusCode = code; return res; },
    json: (body: unknown) => { value.body = body; },
  };
  return { value, res };
}

describe('admin-users status authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
    process.env.FARMI_ADMIN_BOOTSTRAP_TOKEN = 'bootstrap-test-token';
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-123',
          email: 'operator@example.com',
          app_metadata: {
            farmi_active: true,
            farmi_role: 'Ventas',
            farmi_permissions: ['dashboard', 'ventas'],
          },
          user_metadata: {},
        },
      },
      error: null,
    });
    mocks.listUsers.mockResolvedValue({ data: { users: [] }, error: null });
    mocks.createClient.mockReturnValue({
      auth: {
        getUser: mocks.getUser,
        admin: { listUsers: mocks.listUsers },
      },
    });
  });

  it('returns only the authenticated caller status without enumerating Auth users', async () => {
    const { value, res } = response();
    await handler(
      { method: 'POST', headers: { authorization: 'Bearer valid-access-token' }, body: { action: 'status' } } as never,
      res as never,
    );

    expect(value.statusCode).toBe(200);
    expect(value.body).toEqual({
      isAdmin: false,
      canBootstrap: true,
      email: 'operator@example.com',
    });
    expect(mocks.getUser).toHaveBeenCalledWith('valid-access-token');
    expect(mocks.listUsers).not.toHaveBeenCalled();
    expect(value.headers['Cache-Control']).toBe('no-store');
    expect(value.headers.Vary).toBe('Authorization');
  });

  it('rejects a missing bearer token before querying Auth', async () => {
    const { value, res } = response();
    await handler(
      { method: 'POST', headers: {}, body: { action: 'status' } } as never,
      res as never,
    );

    expect(value.statusCode).toBe(401);
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.listUsers).not.toHaveBeenCalled();
  });

  it('rejects an invalid session without exposing account information', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('invalid token') });
    const { value, res } = response();
    await handler(
      { method: 'POST', headers: { authorization: 'Bearer invalid-token' }, body: { action: 'status' } } as never,
      res as never,
    );

    expect(value.statusCode).toBe(401);
    expect(value.body).toEqual({ error: 'La sesión no es válida o ha caducado. Inicia sesión de nuevo.' });
    expect(mocks.listUsers).not.toHaveBeenCalled();
  });
});
