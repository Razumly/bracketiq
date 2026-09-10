import { apiRequest } from '@/lib/apiClient';
import type { TeamComplianceRequiredDocument } from '@/lib/eventTeamCompliance';

export type MatchRosterEntry = {
  id: string | null;
  source: 'BASE' | 'TEMPORARY' | string;
  status: 'ACTIVE' | 'REMOVED' | string;
  userId: string | null;
  firstName: string | null;
  lastName: string | null;
  userName: string | null;
  email: string | null;
  noAccount?: boolean;
  documentReadiness?: {
    isMinorAtEvent: boolean;
    documents: { signedCount: number; requiredCount: number };
    requiredDocuments: TeamComplianceRequiredDocument[];
  } | null;
};

export type MatchRosterResponse = {
  rosters?: Array<{
    eventTeamId: string;
    canEdit?: boolean;
    teamName?: string;
    entries: MatchRosterEntry[];
  }>;
  roster?: {
    eventTeamId: string;
    canEdit?: boolean;
    teamName?: string;
    entries: MatchRosterEntry[];
  };
  allowMatchRosterEdits?: boolean;
  allowTemporaryMatchPlayers?: boolean;
};

export const matchRosterService = {
  getRosters: (endpoint: string) => apiRequest<MatchRosterResponse>(endpoint),
  updateRoster: (endpoint: string, body: Record<string, unknown>) =>
    apiRequest<MatchRosterResponse>(endpoint, { method: 'POST', body }),
};
