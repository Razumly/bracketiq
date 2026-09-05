/** @jest-environment node */

import { NextRequest } from 'next/server';

const sendEmailMock = jest.fn();
const authUserMock = { findUnique: jest.fn(), update: jest.fn() };
jest.mock('@/server/email', () => ({ isEmailEnabled: () => true, sendEmail: (...args: unknown[]) => sendEmailMock(...args) }));
jest.mock('@/lib/prisma', () => ({ prisma: { authUser: authUserMock } }));
jest.mock('@/lib/requestOrigin', () => ({ getRequestOrigin: () => 'https://bracket-iq.com' }));

import { sendInitialEmailVerification } from '@/server/authEmailVerification';
import { GET } from '../verify/confirm/route';

describe('Guardian invitation email verification continuation', () => {
  const originalSecret = process.env.AUTH_SECRET;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AUTH_SECRET = 'guardian-continuation-test-secret';
    authUserMock.findUnique.mockResolvedValue({ id: 'guardian', email: 'guardian@example.com', emailVerifiedAt: null });
    authUserMock.update.mockResolvedValue({ id: 'guardian' });
  });
  afterAll(() => {
    if (originalSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = originalSecret;
  });

  it.each([
    ['/claim/player/child?v=1&e=123&s=signed-proof', '/claim/player/child?v=1&e=123&s=signed-proof'],
    ['https://example.com/claim/player/child', null],
    ['/claim/player/../../admin', null],
  ])('preserves only a local claim destination: %s', async (returnTo, expected) => {
    await sendInitialEmailVerification({
      userId: 'guardian', email: 'guardian@example.com', origin: 'https://bracket-iq.com', returnTo,
    });
    const message = sendEmailMock.mock.calls[0][0];
    const verificationUrl = message.text.match(/https:\/\/[^\s]+/)[0];
    const response = await GET(new NextRequest(verificationUrl));
    expect(response.status).toBe(302);
    const destination = new URL(response.headers.get('location')!);
    expect(destination.pathname).toBe('/login');
    expect(destination.searchParams.get('next')).toBe(expected);
    expect(authUserMock.update).toHaveBeenCalledTimes(1);
  });
});
