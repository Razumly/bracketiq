import { Prisma } from '@/generated/prisma/client';
import { createModerationReport } from './moderation';
import { isRoutineInvitationVisible, invitationRetentionCutoff } from './invitationRetention';

export const reportInvitation = async (tx: Prisma.TransactionClient, input: {
  inviteId: string; reporterUserId: string; category?: string; notes?: string;
}, now = new Date()) => {
  // The row lock serializes capture with outcome changes and ordinary erasure.
  await tx.$queryRaw`SELECT "id" FROM "Invites" WHERE "id" = ${input.inviteId} FOR UPDATE`;
  const invite = await tx.invites.findUnique({ where: { id: input.inviteId } });
  if (!invite || invite.type !== 'TEAM' || !isRoutineInvitationVisible(invite, now)) {
    throw new Response('Invitation history is no longer available.', { status: 410 });
  }
  const existing = await tx.moderationReport.findFirst({ where: {
    reporterUserId: input.reporterUserId, targetType: 'TEAM_INVITATION', targetId: invite.id,
    status: { in: ['OPEN', 'IN_REVIEW'] },
  } });
  if (existing) return existing;
  const deliveries = await tx.inviteDeliveries.findMany({
    where: { inviteId: invite.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, kind: true, requestedBy: true, status: true, createdAt: true, sentAt: true, completedAt: true, failureCode: true },
  });
  const report = await createModerationReport({
    reporterUserId: input.reporterUserId, targetType: 'TEAM_INVITATION', targetId: invite.id,
    category: input.category ?? 'unwanted_invitation', notes: input.notes, client: tx,
  });
  await tx.invitationEvidence.create({ data: {
    reportId: report.id, inviteId: invite.id, capturedAt: now, attemptCreatedAt: invite.createdAt,
    senderId: invite.createdBy, playerId: invite.userId, teamId: invite.teamId,
    status: invite.status ?? 'PENDING', finalizedAt: invite.finalizedAt, sentAt: invite.sentAt,
    actedBy: invite.actedBy, actingGuardianId: invite.actingGuardianId, declineBlockScope: invite.declineBlockScope,
    deliveries: deliveries.map((delivery) => ({ ...delivery, createdAt: delivery.createdAt.toISOString(),
      sentAt: delivery.sentAt?.toISOString() ?? null, completedAt: delivery.completedAt?.toISOString() ?? null })),
  } });
  return report;
};

export const pruneInvitationEvidence = async (client: Pick<Prisma.TransactionClient, '$executeRaw'>, now = new Date(), reportId?: string) => {
  const cutoff = invitationRetentionCutoff(now);
  return client.$executeRaw`
    WITH candidates AS (
      SELECT evidence."reportId" FROM "InvitationEvidence" evidence
      JOIN "ModerationReport" report ON report."id" = evidence."reportId"
      WHERE report."status" IN ('ACTIONED', 'DISMISSED')
        AND ${reportId ? Prisma.sql`report."id" = ${reportId}` : Prisma.sql`TRUE`}
        AND (evidence."finalizedAt" <= ${cutoff}
          OR (evidence."finalizedAt" IS NULL AND NOT EXISTS (
            SELECT 1 FROM "Invites" invite WHERE invite."id" = evidence."inviteId"
          )))
      ORDER BY evidence."finalizedAt" ASC NULLS LAST, evidence."reportId" ASC
      LIMIT 250
      FOR UPDATE OF evidence, report SKIP LOCKED
    )
    DELETE FROM "InvitationEvidence" evidence USING candidates
    WHERE evidence."reportId" = candidates."reportId"
  `;
};

export const readInvitationEvidence = async (tx: Prisma.TransactionClient, reportId: string, now = new Date()) => {
  // Lock the report so closure, reopening, and erasure have one result.
  await tx.$queryRaw`SELECT "id" FROM "ModerationReport" WHERE "id" = ${reportId} FOR UPDATE`;
  const report = await tx.moderationReport.findUnique({ where: { id: reportId } });
  if (!report || report.targetType !== 'TEAM_INVITATION') throw new Response('Not found', { status: 404 });
  await pruneInvitationEvidence(tx, now, reportId);
  return tx.invitationEvidence.findUnique({ where: { reportId } });
};
