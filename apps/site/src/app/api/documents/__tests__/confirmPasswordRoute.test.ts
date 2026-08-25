/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  authUser: {
    findUnique: jest.fn(),
  },
};
const requireSessionMock = jest.fn();
const signRecentAuthTokenMock = jest.fn();
const verifyPasswordMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/lib/authServer', () => ({
  signRecentAuthToken: (...args: unknown[]) => signRecentAuthTokenMock(...args),
  verifyPassword: (...args: unknown[]) => verifyPasswordMock(...args),
}));

import { POST } from '@/app/api/documents/confirm-password/route';

describe('POST /api/documents/confirm-password', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'admin_1', isAdmin: true });
    prismaMock.authUser.findUnique.mockResolvedValue({
      id: 'admin_1',
      email: 'admin@example.com',
      passwordHash: 'admin-hash',
    });
    verifyPasswordMock.mockResolvedValue(true);
    signRecentAuthTokenMock.mockReturnValue('recent-auth-token');
  });

  it('does not verify another account password for the session user', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/documents/confirm-password', {
        method: 'POST',
        body: JSON.stringify({
          email: 'other@example.com',
          password: 'other-password',
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
    expect(prismaMock.authUser.findUnique).toHaveBeenCalledWith({
      where: { id: 'admin_1' },
    });
    expect(verifyPasswordMock).not.toHaveBeenCalled();
    expect(signRecentAuthTokenMock).not.toHaveBeenCalled();
  });

  it('issues a token for the session account after verifying its password', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/documents/confirm-password', {
        method: 'POST',
        body: JSON.stringify({ password: 'admin-password' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      recentAuthToken: 'recent-auth-token',
    });
    expect(verifyPasswordMock).toHaveBeenCalledWith('admin-password', 'admin-hash');
    expect(signRecentAuthTokenMock).toHaveBeenCalledWith({
      userId: 'admin_1',
      purpose: 'sensitive_action',
    });
  });
  it('issues a token for a recently authenticated provider account without a password', async () => {
    requireSessionMock.mockResolvedValue({
      userId: 'admin_1',
      isAdmin: true,
      issuedAtSeconds: Math.floor(Date.now() / 1000),
    });
    prismaMock.authUser.findUnique.mockResolvedValue({
      id: 'admin_1',
      email: 'admin@example.com',
      passwordHash: 'random-provider-password-hash',
      googleSubject: 'google-subject',
    });

    const response = await POST(
      new NextRequest('http://localhost/api/documents/confirm-password', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      recentAuthToken: 'recent-auth-token',
    });
    expect(verifyPasswordMock).not.toHaveBeenCalled();
  });

  it('rejects provider identity proof outside the ten-minute window', async () => {
    requireSessionMock.mockResolvedValue({
      userId: 'admin_1',
      isAdmin: true,
      issuedAtSeconds: Math.floor(Date.now() / 1000) - 601,
    });
    prismaMock.authUser.findUnique.mockResolvedValue({
      id: 'admin_1',
      email: 'admin@example.com',
      passwordHash: 'random-provider-password-hash',
      googleSubject: 'google-subject',
    });

    const response = await POST(
      new NextRequest('http://localhost/api/documents/confirm-password', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'RECENT_AUTH_REQUIRED' });
    expect(signRecentAuthTokenMock).not.toHaveBeenCalled();
  });
});
