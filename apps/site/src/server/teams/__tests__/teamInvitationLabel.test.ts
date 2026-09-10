/** @jest-environment node */

import { teamInvitationLabel } from '@/server/teams/teamInvitationLabel';

const NOW = new Date('2030-09-10T12:00:00.000Z');
const pendingInvite = { id: 'invite_1', status: 'PENDING', isMinor: false };

describe('team invitation labels', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('uses the current adult Player birthday instead of an old invitation birthday', () => {
    expect(teamInvitationLabel({
      ...pendingInvite,
      dateOfBirth: '2020-01-01',
    }, new Date('1990-01-01'))).toBe('Pending acceptance');
  });

  it.each([undefined, null, new Date(0), '1970-01-01T00:00:00.000Z'])(
    'does not infer guardian need from an unknown invitation birthday: %s',
    (dateOfBirth) => {
      expect(teamInvitationLabel({ ...pendingInvite, dateOfBirth })).toBe('Pending acceptance');
    },
  );

  it('does not infer guardian need from an unknown Player birthday', () => {
    expect(teamInvitationLabel(pendingInvite, new Date(0))).toBe('Pending acceptance');
  });

  it('uses the invitation birthday when the Player birthday is unknown', () => {
    expect(teamInvitationLabel({
      ...pendingInvite,
      dateOfBirth: '1990-01-01',
    }, new Date(0))).toBe('Pending acceptance');
    expect(teamInvitationLabel({
      ...pendingInvite,
      dateOfBirth: '2020-01-01',
    }, new Date(0))).toBe('Awaiting guardian');
  });

  it('shows guardian acceptance for an explicit minor without a known birthday', () => {
    expect(teamInvitationLabel({ ...pendingInvite, isMinor: true })).toBe('Awaiting guardian');
  });

  it('does not discard an explicit minor flag when a birthday is present', () => {
    expect(teamInvitationLabel({
      ...pendingInvite,
      isMinor: true,
    }, new Date('1990-01-01'))).toBe('Awaiting guardian');
  });

  it('shows guardian acceptance for a known minor invitation without a Player birthday', () => {
    expect(teamInvitationLabel({
      ...pendingInvite,
      dateOfBirth: '2020-01-01',
    })).toBe('Awaiting guardian');
  });

  it('changes from guardian to Player acceptance on the eighteenth UTC birthday', () => {
    expect(teamInvitationLabel(pendingInvite, new Date('2012-09-11'))).toBe('Awaiting guardian');
    expect(teamInvitationLabel(pendingInvite, new Date('2012-09-10'))).toBe('Pending acceptance');
  });

  it('shows expiry at the expiry instant instead of pending guardian acceptance', () => {
    expect(teamInvitationLabel({
      ...pendingInvite,
      isMinor: true,
      linkExpiresAt: NOW.toISOString(),
    })).toBe('Invitation expired');
  });

  it('keeps an explicitly expired invitation expired even with a future link expiry', () => {
    expect(teamInvitationLabel({
      ...pendingInvite,
      status: 'EXPIRED',
      linkExpiresAt: new Date('2030-09-11T12:00:00.000Z'),
    })).toBe('Invitation expired');
  });

  it.each(['ACCEPTED', 'DECLINED', 'CANCELLED'])(
    'keeps the final %s label after link expiry',
    (status) => {
      expect(teamInvitationLabel({
        ...pendingInvite,
        status,
        isMinor: true,
        linkExpiresAt: new Date('2030-09-09T12:00:00.000Z'),
      })).toBe(`Invitation ${status.toLowerCase()}`);
    },
  );
});
