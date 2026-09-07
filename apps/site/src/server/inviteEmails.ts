import { prisma } from '@/lib/prisma';
import { TeamInvitationRestrictionError } from '@/server/teams/teamInvitationRestrictions';
import { hasGuardianAge } from '@/server/guardianAuthority';
import { isActiveBlockAccount } from '@/server/accountState';
import { buildInviteEmail } from '@/server/emailTemplates';
import { isEmailEnabled, sendEmail } from '@/server/email';
import { sendPushToUsers } from '@/server/pushNotifications';
import { isUserNotificationChannelEnabled } from '@/server/notificationPreferences';
import { buildManagedPlayerClaimUrl, buildTeamInviteShareUrl } from '@/server/teamInviteLinks';
import { reserveTeamInvitationDelivery, completeTeamInvitationDelivery, type TeamInvitationDeliveryRequest } from '@/server/teams/teamInvitationDelivery';

interface InviteRecord {
  isMinor?: boolean | null;
  guardianEmail?: string | null;
  id: string;
  email?: string | null;
  userId?: string | null;
  type?: string | null;
  eventId?: string | null;
  organizationId?: string | null;
  teamId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  status?: string | null;
  sentAt?: Date | string | null;
  linkVersion?: number | null;
  linkExpiresAt?: Date | string | null;
  isAssigned?: boolean | null;
  role?: string | null;
  delivery?: { failed: boolean; status: string; id?: string; error?: string; httpStatus?: number; sentAt?: Date | null };
}

interface InviteDeliveryResult {
  id: string;
  status?: string | null;
  sentAt?: Date | null;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEmail = (value?: string | null): string => (value ?? '').trim().toLowerCase();


async function resolveGuardianRecipients(invites: InviteRecord[]) {
  const playerIds = [...new Set(invites.flatMap((invite) => invite.type === 'TEAM' && invite.userId ? [invite.userId] : []))];
  const profiles = playerIds.length ? await prisma.userData.findMany({
    where: { id: { in: playerIds } }, select: { id: true, dateOfBirth: true },
  }) : [];
  const minorIds = profiles.filter((profile) => hasGuardianAge(profile.dateOfBirth)).map((profile) => profile.id);
  const links = minorIds.length ? await prisma.parentChildLinks.findMany({
    where: { childId: { in: minorIds }, status: 'ACTIVE' }, select: { childId: true, parentId: true }, orderBy: { id: 'asc' },
  }) : [];
  const parents = links.length ? await prisma.authUser.findMany({ where: { id: { in: links.map((link) => link.parentId) } } }) : [];
  const parentById = new Map(parents.filter(isActiveBlockAccount).map((parent) => [parent.id, parent]));
  return invites.map((invite) => {
    const profile = profiles.find((candidate) => candidate.id === invite.userId);
    const isMinor = profile?.dateOfBirth ? hasGuardianAge(profile.dateOfBirth) : invite.isMinor === true;
    if (!isMinor || invite.type !== 'TEAM') return invite;
    const parent = links.filter((link) => link.childId === invite.userId).map((link) => parentById.get(link.parentId)).find(Boolean);
    return { ...invite, isMinor: true, guardianEmail: invite.guardianEmail || parent?.email || null };
  });
}

async function loadInviteContext(invites: InviteRecord[]) {
  const eventIds = new Set<string>();
  const organizationIds = new Set<string>();
  const teamIds = new Set<string>();

  invites.forEach((invite) => {
    if (invite.eventId) eventIds.add(invite.eventId);
    if (invite.organizationId) organizationIds.add(invite.organizationId);
    if (invite.teamId) teamIds.add(invite.teamId);
  });

  const guardianEmails = [...new Set(invites.flatMap((invite) => invite.isMinor && invite.guardianEmail ? [normalizeEmail(invite.guardianEmail)] : []))];
  const [events, organizations, teams, guardianAccounts] = await Promise.all([
    eventIds.size
      ? prisma.events.findMany({
        where: { id: { in: Array.from(eventIds) } },
        select: { id: true, name: true },
      })
      : Promise.resolve([]),
    organizationIds.size
      ? prisma.organizations.findMany({
        where: { id: { in: Array.from(organizationIds) } },
        select: { id: true, name: true },
      })
      : Promise.resolve([]),
    teamIds.size
      ? prisma.teams.findMany({
        where: { id: { in: Array.from(teamIds) } },
        select: { id: true, name: true },
      })
      : Promise.resolve([]),
    guardianEmails.length ? prisma.authUser.findMany({ where: { email: { in: guardianEmails }, disabledAt: null }, select: { id: true, email: true } }) : [],
  ]);

  const guardianByEmail = new Map(guardianAccounts.map((account) => [account.email.toLowerCase(), account.id]));
  const eventNames = new Map(events.map((event) => [event.id, event.name]));
  const organizationNames = new Map(organizations.map((org) => [org.id, org.name]));
  const teamNames = new Map(teams.map((team) => [team.id, team.name]));

  return { guardianByEmail, eventNames, organizationNames, teamNames };
}
type InviteContext = Awaited<ReturnType<typeof loadInviteContext>>;

function inviteActionUrl(invite: InviteRecord, baseUrl: string) {
  return invite.type?.trim().toUpperCase() === 'TEAM' && invite.linkExpiresAt
          ? (invite.role?.trim().toLowerCase() === 'player' && invite.isAssigned && invite.userId
            ? buildManagedPlayerClaimUrl(invite as InviteRecord & { id: string; linkExpiresAt: Date | string }, baseUrl)
            : buildTeamInviteShareUrl(invite as InviteRecord & { id: string; linkExpiresAt: Date | string }, baseUrl))
          : undefined;
}

function inviteContent(invite: InviteRecord, baseUrl: string, context: InviteContext, email: string, hasValidEmail: boolean) {
  const { eventNames, organizationNames, teamNames } = context;
  return buildInviteEmail({
        baseUrl,
        email: hasValidEmail ? email : (invite.email?.trim() ?? ''),
        inviteType: invite.type,
        isMinor: invite.isMinor === true,
        firstName: invite.firstName,
        lastName: invite.lastName,
        eventId: invite.eventId,
        eventName: invite.eventId ? eventNames.get(invite.eventId) : undefined,
        organizationId: invite.organizationId,
        organizationName: invite.organizationId ? organizationNames.get(invite.organizationId) : undefined,
        teamId: invite.teamId,
        teamName: invite.teamId ? teamNames.get(invite.teamId) : undefined,
        actionUrl: inviteActionUrl(invite, baseUrl),
      });
}

async function dispatchInvitePush(invite: InviteRecord, inviteUserId: string | null | undefined, subject: string): Promise<InviteDeliveryResult | null> {
      const pushEnabled = inviteUserId
        ? await isUserNotificationChannelEnabled(inviteUserId, 'invitations', 'push')
        : false;
      if (inviteUserId && pushEnabled) {
        const pushResult = await sendPushToUsers({
          userIds: [inviteUserId],
          notificationType: 'invitations',
          title: subject,
          body: 'You have a new invitation in BracketIQ. Open the app to review it.',
          data: {
            notificationType: 'invitations',
            deepLink: 'mvp://profile/invites',
            inviteId: invite.id,
          },
        }).catch((error) => {
          console.warn('Failed to send invite push notification', { inviteId: invite.id, error });
          return {
            attempted: false,
            reason: 'dispatch_error',
            recipientCount: 1,
            tokenCount: 0,
            successCount: 0,
            failureCount: 0,
            prunedTokenCount: 0,
          };
        });

        // User-id invite policy:
        // 1) If the user has push targets, rely on push delivery.
        // 2) If they have no push targets, fall back to email (when available).
        if (pushResult.reason !== 'no_tokens') {
          return {
            id: invite.id,
            status: pushResult.successCount > 0 ? invite.status ?? 'PENDING' : 'FAILED',
            sentAt: pushResult.attempted && pushResult.successCount > 0 ? new Date() : null,
          };
        }
      }

  return null;
}

async function dispatchInviteEmail(invite: InviteRecord, inviteUserId: string | null | undefined, emailEnabled: boolean, hasValidEmail: boolean, email: string, content: ReturnType<typeof buildInviteEmail>): Promise<InviteDeliveryResult> {
      const emailEnabledByPreference = inviteUserId
        ? await isUserNotificationChannelEnabled(inviteUserId, 'invitations', 'email')
        : true;
      if (!emailEnabledByPreference || !emailEnabled || !hasValidEmail) {
        return { id: invite.id, status: null };
      }

      try {
        await sendEmail({
          to: email,
          subject: content.subject,
          text: content.text,
          html: content.html,
        });
        return { id: invite.id, status: invite.status ?? 'PENDING', sentAt: new Date() };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Failed to send invite email', { inviteId: invite.id, error: message });
        return { id: invite.id, status: 'FAILED' };
      }
}

async function dispatchOneInvite(invite: InviteRecord, baseUrl: string, context: InviteContext, emailEnabled: boolean): Promise<InviteDeliveryResult> {
    try {
      const email = normalizeEmail(invite.isMinor ? invite.guardianEmail : invite.email);
      const hasValidEmail = Boolean(email && EMAIL_REGEX.test(email));

      const content = inviteContent(invite, baseUrl, context, email, hasValidEmail);

      const inviteUserId = invite.isMinor ? context.guardianByEmail.get(email) : invite.userId?.trim();
      const pushed = await dispatchInvitePush(invite, inviteUserId, content.subject);
      if (pushed) return pushed;

      return await dispatchInviteEmail(invite, inviteUserId, emailEnabled, hasValidEmail, email, content);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Failed to process invite delivery', { inviteId: invite.id, error: message });
      return { id: invite.id, status: 'FAILED' };
    }

}

function deliveryOutcome(result: InviteDeliveryResult | undefined) {
  const failed = result?.status === 'FAILED';
  return { sentAt: result?.sentAt ?? null, failed, status: failed ? 'FAILED' : result?.sentAt ? 'SENT' : 'SKIPPED' };
}
function mergeDelivery(invite: InviteRecord, result: InviteDeliveryResult | undefined): InviteRecord {
    return {
      ...invite,
      status: invite.type?.toUpperCase() === 'TEAM' ? invite.status : result?.status ?? invite.status,
      sentAt: result?.sentAt ?? invite.sentAt,
      delivery: deliveryOutcome(result),
    };

}

const dispatchInviteMessages = async (invites: InviteRecord[], baseUrl: string): Promise<InviteRecord[]> => {
  if (!invites.length) {
    return invites;
  }
  invites = await resolveGuardianRecipients(invites);
  const emailEnabled = isEmailEnabled();

  const context = await loadInviteContext(invites);

  const results = await Promise.all(invites.map(invite => dispatchOneInvite(invite, baseUrl, context, emailEnabled)));
  const resultMap = new Map(results.map((update) => [update.id, update]));
  const nextInvites = invites.map(invite => mergeDelivery(invite, resultMap.get(invite.id)));

  const failedInviteIds = nextInvites
    .filter((invite) => invite.type?.toUpperCase() !== 'TEAM' && String(invite.status ?? '').toUpperCase() === 'FAILED')
    .map((invite) => invite.id);
  const sentAtUpdates = results
    .filter((result): result is InviteDeliveryResult & { sentAt: Date } => result.sentAt instanceof Date)
    .filter((result) => invites.find((invite) => invite.id === result.id)?.type?.toUpperCase() !== 'TEAM')
    .map((result) => ({ id: result.id, sentAt: result.sentAt }));
  if (failedInviteIds.length || sentAtUpdates.length) {
    const updatedAt = new Date();
    await Promise.all(
      [
        ...sentAtUpdates.map((update) => prisma.invites.update({
          where: { id: update.id },
          data: {
            sentAt: update.sentAt,
            updatedAt,
          },
        }).catch((error) => {
          console.warn('Failed to persist invite sent timestamp after delivery', { inviteId: update.id, error });
        })),
        ...failedInviteIds.map((inviteId) => prisma.invites.update({
          where: { id: inviteId },
          data: {
            status: 'FAILED',
            updatedAt,
          },
        }).catch((error) => {
          console.warn('Failed to persist FAILED invite status after email send error', { inviteId, error });
        })),
      ],
    );
  }

  return nextInvites;
};

async function reserveInvite(invite: InviteRecord, request: TeamInvitationDeliveryRequest, results: Map<string, InviteRecord>, reserved: Array<{ invite: InviteRecord; deliveryId: string }>) {
    try {
      const reservation = await reserveTeamInvitationDelivery(invite.id, request);
      if (!reservation.invite || !reservation.delivery) {
        results.set(invite.id, { ...invite, ...reservation.invite, delivery: {
          failed: true, status: 'UNAVAILABLE', error: reservation.error, httpStatus: 409,
        } });
      } else if (!reservation.dispatch) {
        results.set(invite.id, { ...reservation.invite, delivery: {
          id: reservation.delivery.id, status: reservation.delivery.status, failed: reservation.delivery.status === 'FAILED',
        } });
      } else {
        reserved.push({ invite: reservation.invite, deliveryId: reservation.delivery.id });
      }
    } catch (error) {
      const message = error instanceof Response ? await error.text() : error instanceof Error ? error.message : 'Delivery could not be saved.';
      results.set(invite.id, { ...invite, delivery: { failed: true, status: 'FAILED', error: message,
        httpStatus: error instanceof Response || error instanceof TeamInvitationRestrictionError ? error.status : 500 } });
    }
}

async function recordDelivery(invite: InviteRecord, deliveryId: string, results: Map<string, InviteRecord>) {
    try {
      const current = await completeTeamInvitationDelivery(deliveryId, invite.id, {
        status: invite.delivery?.status ?? 'SKIPPED', sentAt: invite.delivery?.sentAt,
      });
      results.set(invite.id, { ...invite, ...current, delivery: { ...invite.delivery!, id: deliveryId } });
    } catch (error) {
      console.warn('Invitation delivery completion could not be recorded', { inviteId: invite.id, error });
      results.set(invite.id, { ...invite, delivery: { id: deliveryId, status: 'UNKNOWN', failed: true } });
    }
}

export const sendInviteEmails = async (
  invites: InviteRecord[], baseUrl: string, request: TeamInvitationDeliveryRequest = {},
): Promise<InviteRecord[]> => {
  const results = new Map<string, InviteRecord>();
  const reserved: Array<{ invite: InviteRecord; deliveryId: string }> = [];
  const otherInvites: InviteRecord[] = [];
  for (const invite of invites) {
    if (invite.type?.toUpperCase() !== 'TEAM') {
      otherInvites.push(invite);
      continue;
    }
    await reserveInvite(invite, request, results, reserved);
  }
  const dispatchCandidates = [...otherInvites, ...reserved.map((entry) => entry.invite)];
  const dispatched = await dispatchInviteMessages(dispatchCandidates, baseUrl).catch((error) => {
    console.warn('Invitation delivery preparation failed', error);
    return dispatchCandidates.map((invite) => ({ ...invite, delivery: { failed: true, status: 'FAILED', sentAt: null } }));
  });
  for (const invite of dispatched) {
    const reservation = reserved.find((entry) => entry.invite.id === invite.id);
    if (!reservation) {
      results.set(invite.id, invite);
      continue;
    }
    await recordDelivery(invite, reservation.deliveryId, results);
  }
  return invites.map((invite) => results.get(invite.id) ?? invite);
};
