import {
  claimManagedPlayerProfile,
  createManagedPlayerProfile,
  correctManagedPlayerContact,
  UNKNOWN_MANAGED_PLAYER_DATE_OF_BIRTH,
} from '@/server/managedPlayers';

const NOW = new Date('2030-01-01T12:00:00.000Z');

describe('managed player profiles', () => {
  it('creates a durable profile without creating an Auth account', async () => {
    const userData = {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: 'profile_1',
        firstName: 'Jordan',
        lastName: 'Guest',
        userName: 'jordan.guest0001',
        dateOfBirth: UNKNOWN_MANAGED_PLAYER_DATE_OF_BIRTH,
        isManagedPlayer: true,
      }),
    };

    const profile = await createManagedPlayerProfile({ userData }, {
      firstName: 'jordan',
      lastName: 'guest',
    }, NOW);

    expect(userData.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        firstName: 'Jordan',
        lastName: 'Guest',
        dateOfBirth: UNKNOWN_MANAGED_PLAYER_DATE_OF_BIRTH,
        isManagedPlayer: true,
      }),
    });
    expect(profile.isManagedPlayer).toBe(true);
  });

  it('requires explicit confirmation and matching verified email before a claim', async () => {
    const transaction = jest.fn(async (callback: (tx: any) => Promise<unknown>) => callback(tx));
    const tx = {
      invites: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'invite_1', type: 'TEAM', role: 'player', userId: 'profile_1', status: 'PENDING',
          email: 'jordan@example.com', linkVersion: 1, linkExpiresAt: new Date('2030-01-03T00:00:00.000Z'),
        }),
        update: jest.fn(),
      },
      userData: {
        findUnique: jest.fn()
          .mockResolvedValueOnce({ id: 'profile_1', dateOfBirth: new Date('1990-01-01T00:00:00.000Z') })
          .mockResolvedValueOnce({ id: 'account_1', blockedUserIds: [] }),
      },
      authUser: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'account_1', email: 'other@example.com', emailVerifiedAt: NOW,
        }),
      },
    };
    const client = { $transaction: transaction };

    await expect(claimManagedPlayerProfile(client, {
      profileId: 'profile_1',
      inviteId: 'invite_1',
      claimantUserId: 'account_1',
      confirmation: false,
      link: { version: '1', expiresAt: String(new Date('2030-01-03T00:00:00.000Z').getTime()), signature: 'sig' },
      verifyLink: () => true,
      now: NOW,
    })).rejects.toThrow('confirmation');

    await expect(claimManagedPlayerProfile(client, {
      profileId: 'profile_1',
      inviteId: 'invite_1',
      claimantUserId: 'account_1',
      confirmation: true,
      link: { version: '1', expiresAt: String(new Date('2030-01-03T00:00:00.000Z').getTime()), signature: 'sig' },
      verifyLink: () => true,
      now: NOW,
    })).rejects.toThrow('does not match');
  });

  it('merges roster and invitation associations while preserving the primary profile fields and blocks', async () => {
    const source = {
      id: 'profile_1',
      firstName: 'Manager entered',
      lastName: 'Name',
      dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
      blockedUserIds: ['blocked_source'],
      isManagedPlayer: true,
    };
    const claimant = {
      id: 'account_1',
      firstName: 'Alex',
      lastName: 'Claimed',
      dateOfBirth: new Date('1988-01-01T00:00:00.000Z'),
      blockedUserIds: ['blocked_primary'],
      isManagedPlayer: false,
    };
    const tx: any = {
      invites: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'invite_1', type: 'TEAM', role: 'player', userId: 'profile_1', status: 'PENDING',
          email: null, linkVersion: 1, linkExpiresAt: new Date('2030-01-03T00:00:00.000Z'),
        }),
        findMany: jest.fn().mockResolvedValue([{ id: 'invite_1' }, { id: 'invite_old' }]),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      userData: {
        findUnique: jest.fn().mockResolvedValueOnce(source).mockResolvedValueOnce(claimant),
        update: jest.fn(),
      },
      authUser: {
        findUnique: jest.fn()
          .mockResolvedValueOnce({ id: 'account_1', email: 'alex@example.com', emailVerifiedAt: NOW })
          .mockResolvedValueOnce(null),
      },
      userProfileClaims: { create: jest.fn().mockResolvedValue({ id: 'claim_1' }) },
      userProfileMerges: { create: jest.fn().mockResolvedValue({ id: 'merge_1' }) },
      teamRegistrations: {
        findMany: jest.fn().mockResolvedValue([{ id: 'roster_1', teamId: 'team_1', userId: 'profile_1' }]),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      teamInviteEventSyncs: { updateMany: jest.fn() },
      eventRegistrations: { updateMany: jest.fn() },
      matchRosterEntries: { updateMany: jest.fn() },
    };

    const result = await claimManagedPlayerProfile({
      $transaction: (callback: (transaction: any) => Promise<unknown>) => callback(tx),
    }, {
      profileId: 'profile_1',
      inviteId: 'invite_1',
      claimantUserId: 'account_1',
      confirmation: true,
      link: { version: '1', expiresAt: String(new Date('2030-01-03T00:00:00.000Z').getTime()), signature: 'sig' },
      verifyLink: () => true,
      now: NOW,
    });

    expect(result).toMatchObject({ status: 'MERGED', primaryProfileId: 'account_1', mergeId: 'merge_1' });
    expect(tx.userProfileMerges.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceProfileId: 'profile_1',
        primaryProfileId: 'account_1',
        rosterIds: ['roster_1'],
        invitationIds: ['invite_1', 'invite_old'],
      }),
    });
    expect(tx.userData.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'account_1' },
      data: expect.objectContaining({ blockedUserIds: ['blocked_source', 'blocked_primary'] }),
    }));
    expect(tx.invites.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'invite_1' },
      data: expect.objectContaining({ claimedBy: 'account_1' }),
    }));
  });

  it('allows an authenticated account to claim a no-email profile with the signed link and confirmation', async () => {
    const tx: any = {
      invites: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'invite_no_email', type: 'TEAM', role: 'player', userId: 'profile_no_email', status: 'PENDING',
          email: null, linkVersion: 1, linkExpiresAt: new Date('2030-01-03T00:00:00.000Z'),
        }),
        update: jest.fn(),
      },
      userData: {
        findUnique: jest.fn()
          .mockResolvedValueOnce({ id: 'profile_no_email', dateOfBirth: new Date('1990-01-01T00:00:00.000Z'), isManagedPlayer: true })
          .mockResolvedValueOnce({ id: 'account_no_email', blockedUserIds: [] }),
        update: jest.fn(),
      },
      authUser: {
        findUnique: jest.fn()
          .mockResolvedValueOnce({ id: 'account_no_email', email: 'account@example.com' })
          .mockResolvedValueOnce(null),
      },
      userProfileClaims: { create: jest.fn().mockResolvedValue({ id: 'claim_no_email' }) },
      userProfileMerges: { create: jest.fn().mockResolvedValue({ id: 'merge_no_email' }) },
    };

    const result = await claimManagedPlayerProfile({
      $transaction: (callback: (transaction: any) => Promise<unknown>) => callback(tx),
    }, {
      profileId: 'profile_no_email',
      inviteId: 'invite_no_email',
      claimantUserId: 'account_no_email',
      confirmation: true,
      link: { version: '1', expiresAt: String(new Date('2030-01-03T00:00:00.000Z').getTime()), signature: 'sig' },
      verifyLink: () => true,
      now: NOW,
    });

    expect(result.status).toBe('MERGED');
    expect(tx.userProfileClaims.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ verificationMethod: 'SIGNED_URL', verifiedEmail: null }),
    }));
  });

  it('collects a missing birthdate before selecting adult or guardian authority', async () => {
    const source = {
      id: 'profile_unknown_age',
      dateOfBirth: UNKNOWN_MANAGED_PLAYER_DATE_OF_BIRTH,
      isManagedPlayer: true,
      blockedUserIds: [],
    };
    const tx: any = {
      invites: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'invite_unknown_age', type: 'TEAM', role: 'player', userId: source.id, status: 'PENDING',
          email: null, linkVersion: 1, linkExpiresAt: new Date('2030-01-03T00:00:00.000Z'),
        }),
        update: jest.fn(),
      },
      userData: {
        findUnique: jest.fn(({ where }: { where: { id: string } }) => Promise.resolve(
          where.id === source.id ? source : { id: 'account_unknown_age', blockedUserIds: [] },
        )),
        update: jest.fn(),
      },
      authUser: {
        findUnique: jest.fn(({ where }: { where: { id: string } }) => Promise.resolve(
          where.id === 'account_unknown_age' ? { id: 'account_unknown_age', email: 'player@example.com' } : null,
        )),
      },
      userProfileClaims: { create: jest.fn() },
    };
    const client = { $transaction: (callback: (transaction: any) => Promise<unknown>) => callback(tx) };
    const common = {
      profileId: source.id,
      inviteId: 'invite_unknown_age',
      claimantUserId: 'account_unknown_age',
      confirmation: true as const,
      link: { version: '1', expiresAt: String(new Date('2030-01-03T00:00:00.000Z').getTime()), signature: 'sig' },
      verifyLink: () => true,
      now: NOW,
    };

    await expect(claimManagedPlayerProfile(client, common)).resolves.toMatchObject({
      status: 'BIRTHDATE_REQUIRED',
    });

    await expect(claimManagedPlayerProfile(client, { ...common, dateOfBirth: '2018-01-01' })).resolves.toMatchObject({
      status: 'GUARDIAN_REQUIRED',
    });
    expect(tx.userData.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: source.id },
      data: expect.objectContaining({ dateOfBirth: new Date('2018-01-01T00:00:00.000Z') }),
    }));
    expect(tx.invites.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: common.inviteId },
      data: expect.objectContaining({ isMinor: true }),
    }));
  });

  it('replaces only the latest unclaimed invitation during contact correction', async () => {
    const tx: any = {
      userData: { findUnique: jest.fn().mockResolvedValue({ id: 'profile_1', isManagedPlayer: true, firstName: 'Jordan', lastName: 'Guest' }) },
      authUser: { findUnique: jest.fn().mockResolvedValue(null) },
      invites: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'invite_old', teamId: 'team_1', userId: 'profile_1', role: 'player', type: 'TEAM', status: 'PENDING',
          email: 'old@example.com', phone: null, isMinor: false, dateOfBirth: new Date('1990-01-01T00:00:00.000Z'), guardianEmail: null,
        }),
        update: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'invite_new', userId: 'profile_1', status: 'PENDING' }),
      },
      userProfileContactCorrections: { create: jest.fn() },
    };

    const replacement = await correctManagedPlayerContact({
      $transaction: (callback: (transaction: any) => Promise<unknown>) => callback(tx),
    }, {
      profileId: 'profile_1',
      managerUserId: 'manager_1',
      email: 'new@example.com',
      now: NOW,
    });

    expect(replacement.id).toBe('invite_new');
    expect(tx.invites.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'invite_old' },
      data: expect.objectContaining({ status: 'CANCELLED' }),
    }));
    expect(tx.userProfileContactCorrections.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ previousEmail: 'old@example.com', correctedEmail: 'new@example.com' }),
    }));
  });

  it('links a verified guardian without replacing the minor roster identity', async () => {
    const tx: any = {
      invites: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'invite_minor', type: 'TEAM', role: 'player', userId: 'child_1', status: 'PENDING',
          isMinor: true, guardianEmail: 'guardian@example.com', email: 'guardian@example.com',
          linkVersion: 1, linkExpiresAt: new Date('2030-01-03T00:00:00.000Z'),
        }),
        update: jest.fn(),
      },
      userData: {
        findUnique: jest.fn()
          .mockResolvedValueOnce({ id: 'child_1', dateOfBirth: new Date('2018-01-01T00:00:00.000Z'), blockedUserIds: [] })
          .mockResolvedValueOnce({ id: 'guardian_1', blockedUserIds: [] }),
      },
      authUser: {
        findUnique: jest.fn()
          .mockResolvedValueOnce({ id: 'guardian_1', email: 'guardian@example.com', emailVerifiedAt: NOW })
          .mockResolvedValueOnce(null),
      },
      parentChildLinks: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      userProfileClaims: { create: jest.fn().mockResolvedValue({ id: 'claim_guardian' }) },
    };

    const result = await claimManagedPlayerProfile({
      $transaction: (callback: (transaction: any) => Promise<unknown>) => callback(tx),
    }, {
      profileId: 'child_1',
      inviteId: 'invite_minor',
      claimantUserId: 'guardian_1',
      confirmation: true,
      link: { version: '1', expiresAt: String(new Date('2030-01-03T00:00:00.000Z').getTime()), signature: 'sig' },
      verifyLink: () => true,
      now: NOW,
    });

    expect(result).toMatchObject({ status: 'GUARDIAN_LINKED', primaryProfileId: 'child_1' });
    expect(tx.parentChildLinks.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ parentId: 'guardian_1', childId: 'child_1', status: 'ACTIVE' }),
    }));
    expect(tx.invites.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'invite_minor' },
      data: expect.objectContaining({ claimedBy: 'guardian_1' }),
    }));
  });
});
