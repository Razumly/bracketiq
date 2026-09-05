export type InvitationEvidence = {
  inviteId: string; status: string; attemptCreatedAt: string | null; finalizedAt: string | null;
  senderName: string | null; playerName: string | null; teamName: string | null;
  actingGuardianName: string | null;
  deliveries: Array<{ id: string; kind: string; status: string; createdAt: string }>;
};

export const invitationEvidenceService = {
  async getEvidence(reportId: string): Promise<InvitationEvidence | null> {
    const response = await fetch(`/api/admin/moderation/${encodeURIComponent(reportId)}/evidence`, { credentials: 'include' });
    if (!response.ok) throw new Error('Invitation evidence could not be loaded.');
    const payload: { evidence: InvitationEvidence | null } = await response.json();
    return payload.evidence;
  },
};
