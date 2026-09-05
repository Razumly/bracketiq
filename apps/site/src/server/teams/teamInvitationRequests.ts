import { createHash } from 'node:crypto';
import type { Prisma } from '@/generated/prisma/client';

type RequestScope = { teamId: string; senderId: string; requestKey?: string; payload: Record<string, unknown> };

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, field]) => field !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, field]) => `${JSON.stringify(key)}:${canonicalJson(field)}`).join(',')}}`;
  return JSON.stringify(value);
};
export const invitationRequestFingerprint = (payload: Record<string, unknown>) => createHash('sha256').update(canonicalJson(payload)).digest('hex');

export class InvitationRequestError extends Error {
  constructor(message: string, readonly status = 409) { super(message); }
}

export const replayInvitationRequest = async (tx: Prisma.TransactionClient, input: RequestScope) => {
  if (!input.requestKey) return null;
  const receipt = await tx.invitationRequests.findUnique({ where: { teamId_senderId_requestKey: {
    teamId: input.teamId, senderId: input.senderId, requestKey: input.requestKey,
  } } });
  if (!receipt) return null;
  if (receipt.fingerprint && receipt.fingerprint !== invitationRequestFingerprint(input.payload)) throw new InvitationRequestError('This request key belongs to another invitation request.');
  const invite = await tx.invites.findUnique({ where: { id: receipt.inviteId } });
  if (!invite) throw new InvitationRequestError('This saved invitation is no longer available. Start a new invitation.', 410);
  return invite;
};

export const recordInvitationRequest = async (tx: Prisma.TransactionClient, input: RequestScope, inviteId: string) => {
  if (!input.requestKey) return;
  await tx.invitationRequests.create({ data: {
    teamId: input.teamId, senderId: input.senderId, requestKey: input.requestKey, inviteId, fingerprint: invitationRequestFingerprint(input.payload),
  } });
};
