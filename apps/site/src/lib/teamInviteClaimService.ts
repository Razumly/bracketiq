import { apiRequest } from './apiClient';

export type TeamInvitePreview = {
  available: boolean;
  invite: { id: string; firstName?: string | null; expiresAt?: string | null;
    role?: 'PLAYER' | 'MANAGER' | 'HEAD_COACH' | 'ASSISTANT_COACH'; profileClaimRequired?: boolean };
  team: { id: string; name: string; sport?: string | null; division?: string | null; teamSize?: number | null };
};

export const teamInviteClaimService = {
  preview(inviteId: string, signedQuery: string) {
    return apiRequest<TeamInvitePreview>(`/api/public/team-invites/${encodeURIComponent(inviteId)}?${signedQuery}`);
  },
  act(inviteId: string, signedQuery: string, review: boolean) {
    return apiRequest(`/api/team-invites/${encodeURIComponent(inviteId)}/claim?${signedQuery}`, {
      method: 'POST', body: { action: review ? 'review' : 'accept' },
    });
  },
};
