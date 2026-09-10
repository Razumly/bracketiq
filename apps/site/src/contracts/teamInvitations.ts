import { z } from 'zod';

// Optional fields preserve the existing plain-decline request.
export const declineTeamInvitationSchema = z.object({
  blockScope: z.enum(['sender', 'team']).optional(),
  leaveSharedChats: z.boolean().optional(),
}).strict().refine((value) => !value.leaveSharedChats || value.blockScope === 'sender', {
  message: 'Leaving shared chats requires Block sender.',
});

export type DeclineTeamInvitationInput = z.infer<typeof declineTeamInvitationSchema>;

export const invitationReminderSchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(200),
}).strict();
