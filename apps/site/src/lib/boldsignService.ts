import { apiRequest } from '@/lib/apiClient';
import type { TemplateDocument, TemplateDocumentType, UserData } from '@/types';
import type { TemplateRequiredSignerType } from '@/types';
import { normalizeRequiredSignerType } from '@/lib/templateSignerTypes';

const normalizeTemplateType = (value: unknown): TemplateDocument['type'] => {
  if (typeof value === 'string' && value.toUpperCase() === 'TEXT') {
    return 'TEXT';
  }
  return 'PDF';
};
interface TemplateDocumentApiRow {
  $id?: unknown;
  id?: unknown;
  templateId?: unknown;
  organizationId?: unknown;
  documentRequirementId?: unknown;
  versionSequence?: unknown;
  frozenAt?: unknown;
  documentRequirement?: unknown;
  requirement?: unknown;
  title?: unknown;
  description?: unknown;
  requirementTitle?: unknown;
  requirementDescription?: unknown;
  signOnce?: unknown;
  status?: unknown;
  roleIndex?: unknown;
  roleIndexes?: unknown;
  signerRoles?: unknown;
  requiredSignerType?: unknown;
  type?: unknown;
  content?: unknown;
  $createdAt?: unknown;
  createdAt?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null
);

const toTemplateDocumentApiRow = (value: unknown): TemplateDocumentApiRow => {
  if (!isRecord(value)) {
    throw new Error('Template row is not a valid object.');
  }
  return value;
};
const mapTemplateRow = (row: TemplateDocumentApiRow): TemplateDocument => {
  const templateDocumentId = typeof row.$id === 'string' && row.$id.trim()
    ? row.$id.trim()
    : typeof row.id === 'string' && row.id.trim()
      ? row.id.trim()
      : undefined;
  if (!templateDocumentId) {
    throw new Error('Template row is missing a template document id.');
  }

  const documentRequirementId = typeof row.documentRequirementId === 'string'
    && row.documentRequirementId.trim()
    ? row.documentRequirementId.trim()
    : undefined;
  if (!documentRequirementId) {
    throw new Error('Template row is missing documentRequirementId.');
  }

  const roleIndexRaw = row.roleIndex;
  const roleIndex = typeof roleIndexRaw === 'number' ? roleIndexRaw : Number(roleIndexRaw);
  const roleIndexesRaw = Array.isArray(row.roleIndexes) ? row.roleIndexes : undefined;
  const roleIndexes = roleIndexesRaw
    ? roleIndexesRaw
        .map((entry: unknown) => Number(entry))
        .filter((value: number) => Number.isFinite(value))
    : undefined;
  const signerRolesRaw = Array.isArray(row.signerRoles) ? row.signerRoles : undefined;
  const signerRoles = signerRolesRaw
    ? signerRolesRaw
        .filter((entry: unknown): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
        .map((entry: string) => entry.trim())
    : undefined;
  const signOnceRaw = row.signOnce;
  const versionSequenceRaw = row.versionSequence;
  const versionSequenceValue = typeof versionSequenceRaw === 'number'
    ? versionSequenceRaw
    : typeof versionSequenceRaw === 'string' && versionSequenceRaw.trim()
      ? Number(versionSequenceRaw)
      : Number.NaN;
  if (!Number.isInteger(versionSequenceValue) || versionSequenceValue < 1) {
    throw new Error('Template row is missing a valid versionSequence.');
  }
  const requiredSignerType = normalizeRequiredSignerType(row.requiredSignerType);

  const requirement = isRecord(row.documentRequirement)
    ? row.documentRequirement
    : isRecord(row.requirement)
      ? row.requirement
      : undefined;
  const requirementTitle = typeof requirement?.title === 'string'
    ? requirement.title
    : typeof row.requirementTitle === 'string'
      ? row.requirementTitle
      : undefined;
  const requirementDescription = typeof requirement?.description === 'string'
    ? requirement.description
    : typeof row.requirementDescription === 'string'
      ? row.requirementDescription
      : undefined;

  return {
    $id: templateDocumentId,
    templateId: typeof row.templateId === 'string' ? row.templateId : undefined,
    organizationId: typeof row.organizationId === 'string' ? row.organizationId : '',
    documentRequirementId,
    versionSequence: versionSequenceValue,
    frozenAt: row.frozenAt ? String(row.frozenAt) : undefined,
    requirementTitle,
    requirementDescription,
    title: requirementTitle ?? (typeof row.title === 'string' ? row.title : 'Untitled Template'),
    description: requirementDescription
      ?? (typeof row.description === 'string' ? row.description : undefined),
    signOnce: typeof signOnceRaw === 'boolean' ? signOnceRaw : signOnceRaw == null ? true : Boolean(signOnceRaw),
    status: typeof row.status === 'string' ? row.status : undefined,
    roleIndex: Number.isFinite(roleIndex) ? roleIndex : undefined,
    roleIndexes: roleIndexes && roleIndexes.length ? roleIndexes : undefined,
    signerRoles: signerRoles && signerRoles.length ? signerRoles : undefined,
    requiredSignerType,
    type: normalizeTemplateType(row.type),
    content: typeof row.content === 'string' ? row.content : undefined,
    $createdAt: typeof row.$createdAt === 'string'
      ? row.$createdAt
      : typeof row.createdAt === 'string' ? row.createdAt : undefined,
  };
};
type TemplateListResponse = {
  templates?: unknown[];
};
export type BoldSignSyncStatus =
  | 'PENDING_WEBHOOK'
  | 'PENDING_RECONCILE'
  | 'CONFIRMED'
  | 'FAILED'
  | 'FAILED_RETRYABLE'
  | 'TIMED_OUT'
  | string;

export type SignStep = {
  templateId: string;
  type: TemplateDocumentType;
  documentId?: string;
  url?: string;
  title?: string;
  signOnce?: boolean;
  content?: string;
  requiredSignerType?: TemplateRequiredSignerType;
  requiredSignerLabel?: string;
  signerContext?: 'participant' | 'parent_guardian' | 'child';
  operationId?: string;
  syncStatus?: BoldSignSyncStatus;
};

type CreateTemplateResponse = {
  createUrl?: string;
  template?: TemplateDocument;
  operationId?: string;
  syncStatus?: BoldSignSyncStatus;
  templateId?: string;
  error?: string;
};

export type TemplateUpdateResult = {
  template?: TemplateDocument;
  previousVersionId?: string | null;
  newVersionCreated?: boolean;
  newVersionSequence?: number;
  error?: string;
};

export type TemplateEditSession = {
  editUrl: string;
  selectedVersion?: number;
  frozen?: boolean;
  willCreateNewVersion?: boolean;
  nextVersionSequence?: number;
  operationId?: string;
  templateId?: string;
  newVersionId?: string;
};


type SignLinksResponse = {
  signLinks?: SignStep[];
  error?: string;
};

type DeleteTemplateResponse = {
  deleted?: boolean;
  operationId?: string;
  syncStatus?: BoldSignSyncStatus;
  error?: string;
};

export type BoldSignOperationStatus = {
  operationId: string;
  operationType: string;
  status: BoldSignSyncStatus;
  error?: string | null;
  templateDocumentId?: string | null;
  signedDocumentRecordId?: string | null;
  templateId?: string | null;
  documentId?: string | null;
  updatedAt?: string | null;
};

class BoldSignService {
  async getTemplates(params: {
    organizationId: string;
    isVersionHistoryIncluded?: boolean;
  }): Promise<TemplateDocument[]> {
    const query = params.isVersionHistoryIncluded ? '?includeVersions=true' : '';
    const result = await apiRequest<TemplateListResponse>(
      `/api/organizations/${params.organizationId}/templates${query}`,
      { method: 'GET' },
    );
    if (!Array.isArray(result?.templates)) {
      throw new Error('The template response did not include a templates array.');
    }
    return result.templates.map(toTemplateDocumentApiRow).map(mapTemplateRow);
  }

  async createTemplate(params: {
    organizationId: string;
    userId: string;
    title: string;
    description?: string;
    signOnce: boolean;
    requiredSignerType: TemplateRequiredSignerType;
    type: TemplateDocumentType;
    content?: string;
    file?: File;
  }): Promise<{
    createUrl?: string;
    template?: TemplateDocument;
    operationId?: string;
    syncStatus?: BoldSignSyncStatus;
    templateId?: string;
  }> {
    let result: CreateTemplateResponse;
    if (params.type === 'PDF') {
      if (!params.file) {
        throw new Error('PDF file is required for PDF templates.');
      }
      const form = new FormData();
      form.set('userId', params.userId);
      form.set('title', params.title);
      form.set('description', params.description ?? '');
      form.set('signOnce', String(params.signOnce));
      form.set('requiredSignerType', params.requiredSignerType);
      form.set('type', params.type);
      form.set('file', params.file);
      result = await apiRequest<CreateTemplateResponse>(
        `/api/organizations/${params.organizationId}/templates`,
        {
          method: 'POST',
          body: form,
          timeoutMs: 60_000,
        },
      );
    } else {
      result = await apiRequest<CreateTemplateResponse>(
        `/api/organizations/${params.organizationId}/templates`,
        {
          method: 'POST',
          body: {
            userId: params.userId,
            template: {
              title: params.title,
              description: params.description,
              signOnce: params.signOnce,
              requiredSignerType: params.requiredSignerType,
              type: params.type,
              content: params.content,
            },
          },
        },
      );
    }

    if (result?.error) {
      throw new Error(result.error);
    }

    if (params.type === 'TEXT' && !result?.template) {
      throw new Error('Template creation response is missing data.');
    }
    return {
      createUrl: result.createUrl,
      template: result.template,
      operationId: result.operationId,
      syncStatus: result.syncStatus,
      templateId: result.templateId,
    };
  }


  async updateTemplate(params: {
    organizationId: string;
    templateDocumentId: string;
    title?: string;
    description?: string | null;
    content?: string;
  }): Promise<TemplateUpdateResult> {
    const result = await apiRequest<TemplateUpdateResult>(
      `/api/organizations/${params.organizationId}/templates/${params.templateDocumentId}`,
      {
        method: 'PATCH',
        body: {
          ...(params.title !== undefined ? { title: params.title } : {}),
          ...(params.description !== undefined ? { description: params.description } : {}),
          ...(params.content !== undefined ? { content: params.content } : {}),
        },
      },
    );
    if (result?.error) {
      throw new Error(result.error);
    }
    return result;
  }
  async getTemplateEditSession(params: {
    organizationId: string;
    templateDocumentId: string;
  }): Promise<TemplateEditSession> {
    const result = await apiRequest<TemplateEditSession & { error?: string }>(
      `/api/organizations/${params.organizationId}/templates/${params.templateDocumentId}/edit-url`,
      { method: 'GET' },
    );
    if (result?.error) {
      throw new Error(result.error);
    }
    if (!result?.editUrl) {
      throw new Error('Template edit response is missing editUrl.');
    }
    return result;
  }


  async deleteTemplate(params: {
    organizationId: string;
    templateDocumentId: string;
  }): Promise<DeleteTemplateResponse> {
    const result = await apiRequest<DeleteTemplateResponse>(
      `/api/organizations/${params.organizationId}/templates/${params.templateDocumentId}`,
      {
        method: 'DELETE',
      },
    );
    if (result?.error) {
      throw new Error(result.error);
    }
    if (!result?.deleted && !result?.operationId) {
      throw new Error('Failed to delete template.');
    }
    return result;
  }

  async createSignLinks(params: {
    eventId?: string;
    teamId?: string;
    user: UserData;
    userEmail: string;
    templateId?: string;
    redirectUrl?: string;
    signerContext?: 'participant' | 'parent_guardian' | 'child';
    childUserId?: string;
    childEmail?: string;
    timeoutMs?: number;
  }): Promise<SignStep[]> {
    const targetPath = params.teamId
      ? `/api/teams/${params.teamId}/sign`
      : params.eventId
        ? `/api/events/${params.eventId}/sign`
        : null;
    if (!targetPath) {
      throw new Error('Event or team is required to create sign links.');
    }

    const result = await apiRequest<SignLinksResponse>(
      targetPath,
      {
        method: 'POST',
        timeoutMs: params.timeoutMs,
        body: {
          user: params.user,
          userId: params.user.$id,
          userEmail: params.userEmail,
          templateId: params.templateId,
          redirectUrl: params.redirectUrl,
          signerContext: params.signerContext ?? 'participant',
          childUserId: params.childUserId,
          childEmail: params.childEmail,
        },
      },
    );
    if (result?.error) {
      throw new Error(result.error);
    }
    if (!Array.isArray(result?.signLinks)) {
      return [];
    }
    return result.signLinks.map((link) => ({
      ...link,
      type: (link.type ?? 'PDF') as TemplateDocumentType,
    }));
  }

  async createRentalSignLinks(params: {
    user: UserData;
    userEmail?: string;
    eventId?: string;
    organizationId?: string;
    templateId?: string;
    templateIds?: string[];
    redirectUrl?: string;
    timeoutMs?: number;
  }): Promise<SignStep[]> {
    const result = await apiRequest<SignLinksResponse>(
      '/api/rentals/sign',
      {
        method: 'POST',
        timeoutMs: params.timeoutMs,
        body: {
          user: params.user,
          userId: params.user.$id,
          userEmail: params.userEmail,
          eventId: params.eventId,
          organizationId: params.organizationId,
          templateId: params.templateId,
          templateIds: params.templateIds,
          redirectUrl: params.redirectUrl,
        },
      },
    );
    if (result?.error) {
      throw new Error(result.error);
    }
    if (!Array.isArray(result?.signLinks)) {
      return [];
    }
    return result.signLinks.map((link) => ({
      ...link,
      type: (link.type ?? 'PDF') as TemplateDocumentType,
    }));
  }

  async getOperationStatus(operationId: string): Promise<BoldSignOperationStatus> {
    const result = await apiRequest<BoldSignOperationStatus>(
      `/api/boldsign/operations/${operationId}`,
      {
        method: 'GET',
      },
    );

    if (!result?.operationId) {
      throw new Error('Operation status response is missing operation id.');
    }
    return result;
  }
}

export const boldsignService = new BoldSignService();
