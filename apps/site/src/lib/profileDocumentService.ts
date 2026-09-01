import { apiRequest } from '@/lib/apiClient';
import type { SignerContext } from '@/lib/templateSignerTypes';

export type ProfileDocumentProvenance = 'BOLDSIGN' | 'BRACKETIQ' | 'IMPORTED';
export const formatDocumentScopeLabel = (scopeType?: string): string => {
  switch (scopeType?.trim().toUpperCase()) {
    case 'ORGANIZATION':
      return 'This Organization';
    case 'EVENT_PARTICIPATION':
      return 'Event participation';
    case 'TEAM_MEMBERSHIP':
      return 'Team membership';
    default:
      return scopeType?.trim() || 'Unknown';
  }
};

export const formatDocumentStatusLabel = (status?: string): string => {
  switch (status?.trim().toUpperCase()) {
    case 'UNSIGNED':
      return 'Unsigned';
    case 'SIGNED':
      return 'Signed';
    case 'VOID':
      return 'Voided';
    default:
      return status?.trim() || 'Signed';
  }
};

export type ProfileDocumentCard = {
  id: string;
  status: 'UNSIGNED' | 'SIGNED' | 'VOID';
  eventId?: string;
  eventName?: string;
  teamId?: string;
  teamName?: string;
  organizationId?: string;
  organizationName: string;
  templateId: string;
  title: string;
  type: 'PDF' | 'TEXT';
  provenance?: ProfileDocumentProvenance;
  documentRequirementTitle?: string;
  versionSequence?: number;
  scopeType?: string;
  scopeId?: string;
  historicalSigningDate?: string;
  requiredSignerType: string;
  requiredSignerLabel: string;
  signerContext: SignerContext;
  signerContextLabel: string;
  childUserId?: string;
  childName?: string;
  childEmail?: string;
  consentStatus?: string;
  requiresChildEmail?: boolean;
  statusNote?: string;
  signedAt?: string;
  signedDocumentRecordId?: string;
  viewUrl?: string;
  content?: string;
};

export type ChildUnsignedDocumentCount = {
  childUserId: string;
  unsignedCount: number;
};

type ProfileDocumentsResponse = {
  unsigned: ProfileDocumentCard[];
  signed: ProfileDocumentCard[];
  voided: ProfileDocumentCard[];
  childUnsignedCounts: ChildUnsignedDocumentCount[];
  error?: string;
};

const requireProfileDocumentArray = <T>(value: unknown, field: string): T[] => {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid profile documents response: ${field} must be an array.`);
  }
  return value as T[];
};

class ProfileDocumentService {
  async listDocuments(): Promise<{
    unsigned: ProfileDocumentCard[];
    signed: ProfileDocumentCard[];
    childUnsignedCounts: ChildUnsignedDocumentCount[];
  }> {
    const response = await apiRequest<ProfileDocumentsResponse>('/api/profile/documents', {
      method: 'GET',
    });
    if (response?.error) {
      throw new Error(response.error);
    }
    const unsigned = requireProfileDocumentArray<ProfileDocumentCard>(
      response?.unsigned,
      'unsigned',
    );
    const signed = requireProfileDocumentArray<ProfileDocumentCard>(
      response?.signed,
      'signed',
    );
    const voided = requireProfileDocumentArray<ProfileDocumentCard>(
      response?.voided,
      'voided',
    );
    const childUnsignedCounts = requireProfileDocumentArray<ChildUnsignedDocumentCount>(
      response?.childUnsignedCounts,
      'childUnsignedCounts',
    );
    return {
      unsigned,
      signed: [...signed, ...voided],
      childUnsignedCounts,
    };
  }
}

export const profileDocumentService = new ProfileDocumentService();
