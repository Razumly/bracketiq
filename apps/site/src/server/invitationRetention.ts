import type { Prisma } from '@/generated/prisma/client';

export const TERMINAL_INVITE_RETENTION_DAYS = 90;
export const FINAL_TEAM_INVITATION_STATUSES = ['ACCEPTED', 'DECLINED', 'REJECTED', 'CANCELLED', 'EXPIRED'];
const teamTypes = ['TEAM', 'PLAYER', 'TEAM_MANAGER', 'TEAM_HEAD_COACH', 'TEAM_ASSISTANT_COACH'];

export const invitationRetentionCutoff = (now = new Date()) =>
  new Date(now.getTime() - TERMINAL_INVITE_RETENTION_DAYS * 24 * 60 * 60 * 1000);

export const isRoutineInvitationVisible = (invite: {
  type?: string | null; status?: string | null; finalizedAt?: Date | string | null;
  updatedAt?: Date | string | null; createdAt?: Date | string | null;
}, now = new Date()): boolean => {
  const team = teamTypes.includes(String(invite.type).toUpperCase());
  const terminal = FINAL_TEAM_INVITATION_STATUSES.includes(String(invite.status).toUpperCase())
    || (!team && invite.status === 'FAILED');
  if (!terminal) return true;
  const time = invite.finalizedAt ?? invite.updatedAt ?? invite.createdAt;
  return !time || new Date(time).getTime() > invitationRetentionCutoff(now).getTime();
};

export const routineInvitationWhere = (now = new Date()): Prisma.InvitesWhereInput => {
  const cutoff = invitationRetentionCutoff(now);
  return { NOT: { AND: [
    { OR: [{ status: { in: FINAL_TEAM_INVITATION_STATUSES } }, { type: { notIn: teamTypes }, status: 'FAILED' }] },
    { OR: [
      { finalizedAt: { lte: cutoff } },
      { finalizedAt: null, updatedAt: { lte: cutoff } },
      { finalizedAt: null, updatedAt: null, createdAt: { lte: cutoff } },
    ] },
  ] } };
};
