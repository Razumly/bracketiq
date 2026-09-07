import { isMinorAtUtcDate } from '@/server/userPrivacy';
import { isInvitationExpired, isPendingInvitation } from './teamInvitationState';

type LabelInvitation = {
  id: string;
  status?: string | null;
  linkExpiresAt?: Date | string | null;
  dateOfBirth?: Date | string | null;
  isMinor?: boolean | null;
};

export const teamInvitationLabel = (invite: LabelInvitation, playerBirthday?: Date | null): string => {
  if (invite.status === 'EXPIRED' || isInvitationExpired(invite)) return 'Invitation expired';
  if (!isPendingInvitation(invite.status)) return `Invitation ${String(invite.status).toLowerCase()}`;
  const birthday = playerBirthday ?? invite.dateOfBirth;
  const needsGuardian = birthday ? isMinorAtUtcDate(birthday) : Boolean(invite.isMinor);
  return needsGuardian ? 'Awaiting guardian' : 'Awaiting player';
};
