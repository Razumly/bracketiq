import { apiRequest } from '@/lib/apiClient';

type ImportedSignedDocumentResponse = {
  evidenceId?: string;
  documentId?: string;
  provenance?: 'IMPORTED';
  status?: 'SIGNED' | 'VOID';
  error?: string;
};

export type DocumentAuditEvent = {
  id: string;
  createdAt: string;
  eventType: string;
  actorUserId?: string | null;
  actorDisplayName?: string | null;
  reason?: string | null;
  note?: string | null;
  payload?: unknown;
};

class SignedDocumentService {
  async createImportedSignedDocument(
    organizationId: string,
    formData: FormData,
  ): Promise<ImportedSignedDocumentResponse> {
    const response = await apiRequest<ImportedSignedDocumentResponse>(
      `/api/organizations/${encodeURIComponent(organizationId)}/documents/import`,
      {
        method: 'POST',
        body: formData,
      },
    );
    if (response?.error) {
      throw new Error(response.error);
    }
    return response;
  }
  async createRecentAuthToken(password?: string): Promise<string> {
    const response = await apiRequest<{ recentAuthToken?: string; error?: string }>(
      '/api/documents/confirm-password',
      {
        method: 'POST',
        body: password?.trim() ? { password } : {},
      },
    );
    if (response?.error) {
      throw new Error(response.error);
    }
    if (!response?.recentAuthToken) {
      throw new Error('Recent identity proof was not returned.');
    }
    return response.recentAuthToken;
  }

  async updateImportedDocumentStatus(
    organizationId: string,
    signedDocumentId: string,
    reason: string,
    note?: string | null,
    recentAuthToken?: string,
  ): Promise<{ evidenceId?: string; status?: 'VOID'; error?: string }> {
    const response = await apiRequest<{ evidenceId?: string; status?: 'VOID'; error?: string }>(
      `/api/organizations/${encodeURIComponent(organizationId)}/documents/${encodeURIComponent(signedDocumentId)}/void`,
      {
        method: 'POST',
        headers: recentAuthToken
          ? { 'x-recent-auth-token': recentAuthToken }
          : undefined,
        body: {
          reason,
          note: note?.trim() || null,
        },
      },
    );
    if (response?.error) {
      throw new Error(response.error);
    }
    return response;
  }

  async getDocumentAuditHistory(
    organizationId: string,
    signedDocumentId: string,
  ): Promise<DocumentAuditEvent[]> {
    const response = await apiRequest<{ auditEvents: DocumentAuditEvent[]; error?: string }>(
      `/api/organizations/${encodeURIComponent(organizationId)}/documents/${encodeURIComponent(signedDocumentId)}/audit`,
    );
    if (response?.error) {
      throw new Error(response.error);
    }
    if (!Array.isArray(response?.auditEvents)) {
      throw new Error('Invalid document audit response.');
    }
    return response.auditEvents;
  }

  async getSignedDocument(
    documentId: string,
    userId?: string,
  ): Promise<Record<string, any> | null> {
    try {
      const params = new URLSearchParams();
      params.set('documentId', documentId);
      if (userId) {
        params.set('userId', userId);
      }
      const response = await apiRequest<{ signedDocuments?: any[] }>(`/api/documents/signed?${params.toString()}`);
      const rows = Array.isArray(response.signedDocuments) ? response.signedDocuments : [];
      return (rows[0] as Record<string, any>) ?? null;
    } catch (error) {
      return null;
    }
  }

  async isDocumentSigned(documentId: string, userId?: string): Promise<boolean> {
    const row = await this.getSignedDocument(documentId, userId);
    if (!row) {
      return false;
    }
    const status = typeof row.status === 'string' ? row.status.toLowerCase() : '';
    return status === 'signed';
  }
}

export const signedDocumentService = new SignedDocumentService();
