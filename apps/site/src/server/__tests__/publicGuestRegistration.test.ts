/** @jest-environment node */

const prismaMock = {
  events: {
    findUnique: jest.fn(),
  },
};
const getPublicOrganizationBySlugMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/server/inviteUsers', () => ({
  ensureAuthUserAndUserDataByEmail: jest.fn(),
}));
jest.mock('@/server/publicOrganizationCatalog', () => ({
  getPublicOrganizationBySlug: (...args: unknown[]) => getPublicOrganizationBySlugMock(...args),
}));

import { ensureAuthUserAndUserDataByEmail } from '@/server/inviteUsers';
import {
  assertPublicWidgetEvent,
  ensureGuestChildUserData,
  ensureGuestParentIdentity,
} from '@/server/publicGuestRegistration';

describe('public guest registration helpers', () => {
  it('creates child UserData without creating email-backed sensitive data', async () => {
    const tx = {
      userData: {
        create: jest.fn().mockResolvedValue({}),
      },
      sensitiveUserData: {
        create: jest.fn(),
        upsert: jest.fn(),
      },
      authUser: {
        create: jest.fn(),
      },
    };

    const result = await ensureGuestChildUserData(tx as any, {
      firstName: 'Casey',
      lastName: 'Parent',
      dateOfBirth: new Date('2015-05-10T00:00:00.000Z'),
    }, new Date('2026-06-16T00:00:00.000Z'));

    expect(result.userId).toEqual(expect.any(String));
    expect(tx.userData.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        firstName: 'Casey',
        lastName: 'Parent',
        dateOfBirth: new Date('2015-05-10T00:00:00.000Z'),
        userName: expect.stringMatching(/^guest-child-/),
      }),
    });
    expect(tx.sensitiveUserData.create).not.toHaveBeenCalled();
    expect(tx.sensitiveUserData.upsert).not.toHaveBeenCalled();
    expect(tx.authUser.create).not.toHaveBeenCalled();
  });

  it('refuses to bind an unauthenticated guest registration to an existing email identity', async () => {
    const tx = {
      authUser: {
        findUnique: jest.fn().mockResolvedValue({ id: 'victim_1' }),
      },
      sensitiveUserData: {
        findFirst: jest.fn().mockResolvedValue({ userId: 'victim_1' }),
      },
    };

    await expect(ensureGuestParentIdentity(tx as any, {
      email: 'victim@example.com',
      firstName: 'Spoofed',
      lastName: 'Name',
    }, new Date())).rejects.toMatchObject({ status: 409 });
    expect(ensureAuthUserAndUserDataByEmail).not.toHaveBeenCalled();
  });

  it('rejects archived weekly parents while allowing active weekly parents', async () => {
    const organization = { id: 'org_1', slug: 'summit' };
    getPublicOrganizationBySlugMock.mockResolvedValue(organization);

    const archivedWeeklyParent = {
      id: 'weekly_archived',
      organizationId: 'org_1',
      state: 'PUBLISHED',
      eventType: 'WEEKLY_EVENT',
      parentEvent: null,
      archivedAt: new Date('2026-08-01T00:00:00.000Z'),
    };
    prismaMock.events.findUnique.mockResolvedValueOnce(archivedWeeklyParent);

    await expect(assertPublicWidgetEvent('summit', archivedWeeklyParent.id)).resolves.toBeNull();

    const activeWeeklyParent = {
      ...archivedWeeklyParent,
      id: 'weekly_active',
      archivedAt: null,
    };
    prismaMock.events.findUnique.mockResolvedValueOnce(activeWeeklyParent);

    await expect(assertPublicWidgetEvent('summit', activeWeeklyParent.id)).resolves.toEqual({
      organization,
      event: activeWeeklyParent,
    });
  });
});
