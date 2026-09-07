import { apiRequest } from './apiClient';

export type ProfileClaimPreview = {
  available: boolean;
  invite: { id: string; profileId: string; hasAttachedEmail: boolean; isMinor?: boolean; teamId?: string | null;
    guardianSetupRequired?: boolean; guardianContactRequired?: boolean; guardianDeclaration?: string; birthdateRequired?: boolean };
  profile: { displayName: string; isManaged: boolean; dateOfBirth?: string | null };
  team?: { id: string; name: string } | null;
};

type ClaimInput = {
  inviteId: string; confirmation: true; guardianDeclaration?: boolean; acceptTeamInvitation?: boolean;
  reviewGuardianInvitation?: boolean; dateOfBirth?: string;
};

type ClaimResponse = { status?: string; primaryProfileId?: string; sourceProfileId?: string };

export const profileClaimService = {
  preview(inviteId: string, signedQuery: string) {
    return apiRequest<ProfileClaimPreview>(`/api/public/profile-claims/${encodeURIComponent(inviteId)}?${signedQuery}`);
  },
  claim(profileId: string, signedQuery: string, body: ClaimInput) {
    return apiRequest<ClaimResponse>(`/api/user-profiles/${encodeURIComponent(profileId)}/claim?${signedQuery}`, { method: 'POST', body });
  },
};
