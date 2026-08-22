import { randomUUID } from 'node:crypto';
import { Prisma, type TemplateDocuments } from '@/generated/prisma/client';

type DocumentTemplateVersionClient = Pick<
  Prisma.TransactionClient,
  '$queryRaw' | 'documentRequirements' | 'templateDocuments'
>;

type DocumentRequirementRef = Pick<
  Prisma.DocumentRequirementsUncheckedCreateInput,
  'id' | 'organizationId'
>;

type LockedTemplateDocument = Pick<
  TemplateDocuments,
  | 'id'
  | 'createdAt'
  | 'updatedAt'
  | 'templateId'
  | 'documentRequirementId'
  | 'versionSequence'
  | 'frozenAt'
  | 'type'
  | 'organizationId'
  | 'title'
  | 'description'
  | 'signOnce'
  | 'requiredSignerType'
  | 'status'
  | 'createdBy'
  | 'roleIndex'
  | 'roleIndexes'
  | 'signerRoles'
  | 'content'
>;

export type DocumentRequirementCreateData = Prisma.DocumentRequirementsUncheckedCreateInput;

export type DocumentTemplateVersionCreateData = Omit<
  Prisma.TemplateDocumentsUncheckedCreateInput,
  'documentRequirementId' | 'versionSequence' | 'organizationId'
> & {
  organizationId?: string;
};

export type DocumentTemplateVersionMaterialData = Partial<Pick<
  Prisma.TemplateDocumentsUncheckedCreateInput,
  | 'templateId'
  | 'type'
  | 'signOnce'
  | 'requiredSignerType'
  | 'roleIndex'
  | 'roleIndexes'
  | 'signerRoles'
  | 'content'
>> & {
  status?: string | null;
};

export type DocumentRequirementDisplayData = {
  title?: string;
  description?: string | null;
};

export type DocumentTemplateVersionEditResult = {
  template: TemplateDocuments;
  requirement: {
    id: string;
    organizationId: string;
    title: string;
    description: string | null;
  } | null;
  previousVersionId: string | null;
  isNewVersionCreated: boolean;
};

export class DocumentTemplateVersionNotFoundError extends Error {
  constructor(versionId: string) {
    super(`Document Template Version ${versionId} was not found.`);
    this.name = 'DocumentTemplateVersionNotFoundError';
  }
}

export class DocumentTemplateVersionFrozenError extends Error {
  readonly versionId: string;

  constructor(versionId: string) {
    super(`Document Template Version ${versionId} is frozen and cannot be edited in place.`);
    this.name = 'DocumentTemplateVersionFrozenError';
    this.versionId = versionId;
  }
}

const DOCUMENT_REQUIREMENT_OWNERSHIP_ERROR =
  'Document Requirement and Document Template Version must belong to the same Organization.';
const DOCUMENT_TEMPLATE_VERSION_OWNERSHIP_ERROR =
  'Document Template Version does not belong to this Organization.';

const MATERIAL_FIELDS = [
  'templateId',
  'type',
  'signOnce',
  'requiredSignerType',
  'roleIndex',
  'roleIndexes',
  'signerRoles',
  'content',
] as const;

const arraysEqual = (left: unknown, right: unknown): boolean => (
  Array.isArray(left)
  && Array.isArray(right)
  && left.length === right.length
  && left.every((value, index) => value === right[index])
);

const valuesEqual = (left: unknown, right: unknown): boolean => (
  Array.isArray(left) || Array.isArray(right)
    ? arraysEqual(left, right)
    : left === right
);

const hasMaterialChanges = (
  current: LockedTemplateDocument,
  patch: DocumentTemplateVersionMaterialData,
): boolean => MATERIAL_FIELDS.some((field) => (
  patch[field] !== undefined && !valuesEqual(current[field], patch[field])
));

const materialPatchFrom = (
  patch: DocumentTemplateVersionMaterialData,
): Record<string, unknown> => Object.fromEntries(
  MATERIAL_FIELDS
    .filter((field) => patch[field] !== undefined)
    .map((field) => [field, patch[field]]),
);

const lockTemplateDocumentVersion = async (
  tx: DocumentTemplateVersionClient,
  versionId: string,
): Promise<LockedTemplateDocument> => {
  const rows = await tx.$queryRaw<LockedTemplateDocument[]>(Prisma.sql`
    SELECT *
    FROM "TemplateDocuments"
    WHERE "id" = ${versionId}
    FOR UPDATE
  `);
  const version = rows[0];
  if (!version) {
    throw new DocumentTemplateVersionNotFoundError(versionId);
  }
  return version;
};

const hasPersistedVersionReference = async (
  tx: DocumentTemplateVersionClient,
  versionId: string,
): Promise<boolean> => {
  const references = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "Events"
    WHERE ${versionId} = ANY("requiredTemplateIds")
    UNION ALL
    SELECT "id" FROM "Teams"
    WHERE ${versionId} = ANY("requiredTemplateIds")
    UNION ALL
    SELECT "id" FROM "EventTemplates"
    WHERE ${versionId} = ANY("requiredTemplateIds")
    UNION ALL
    SELECT "id" FROM "TimeSlots"
    WHERE ${versionId} = ANY("requiredTemplateIds")
       OR ${versionId} = ANY("hostRequiredTemplateIds")
    UNION ALL
    SELECT "id" FROM "EventTemplateTimeSlots"
    WHERE ${versionId} = ANY("requiredTemplateIds")
       OR ${versionId} = ANY("hostRequiredTemplateIds")
    UNION ALL
    SELECT "id" FROM "RentalBookingItems"
    WHERE ${versionId} = ANY("requiredTemplateIds")
       OR ${versionId} = ANY("hostRequiredTemplateIds")
    UNION ALL
    SELECT "id" FROM "SignedDocuments"
    WHERE "templateId" = ${versionId}
    LIMIT 1
  `);
  return references.length > 0;
};

const requirementForVersion = async (
  tx: DocumentTemplateVersionClient,
  version: Pick<LockedTemplateDocument, 'documentRequirementId' | 'organizationId'>,
) => tx.documentRequirements.findUnique({
  where: { id: version.documentRequirementId },
  select: {
    id: true,
    organizationId: true,
    title: true,
    description: true,
  },
});

const updateRequirementDisplayMetadata = async (
  tx: DocumentTemplateVersionClient,
  version: Pick<LockedTemplateDocument, 'documentRequirementId' | 'organizationId'>,
  display: DocumentRequirementDisplayData | undefined,
) => {
  if (!display || (display.title === undefined && display.description === undefined)) {
    return requirementForVersion(tx, version);
  }

  const requirement = await requirementForVersion(tx, version);
  if (!requirement) {
    throw new DocumentTemplateVersionNotFoundError(version.documentRequirementId);
  }
  if (requirement.organizationId !== version.organizationId) {
    throw new Error(DOCUMENT_REQUIREMENT_OWNERSHIP_ERROR);
  }

  return tx.documentRequirements.update({
    where: { id: requirement.id },
    data: {
      ...(display.title !== undefined ? { title: display.title } : {}),
      ...(display.description !== undefined ? { description: display.description } : {}),
      updatedAt: new Date(),
    },
    select: {
      id: true,
      organizationId: true,
      title: true,
      description: true,
    },
  });
};

export const ensureDocumentRequirement = async (
  tx: DocumentTemplateVersionClient,
  data: DocumentRequirementCreateData,
): Promise<DocumentRequirementRef> => {
  const requirement = await tx.documentRequirements.upsert({
    where: { id: data.id },
    create: data,
    update: {
      updatedAt: data.updatedAt ?? new Date(),
    },
    select: {
      id: true,
      organizationId: true,
    },
  });

  if (requirement.organizationId !== data.organizationId) {
    throw new Error(DOCUMENT_REQUIREMENT_OWNERSHIP_ERROR);
  }

  return requirement;
};

export const createDocumentTemplateVersion = async (
  tx: DocumentTemplateVersionClient,
  params: {
    requirement: DocumentRequirementRef;
    version: DocumentTemplateVersionCreateData;
  },
): Promise<TemplateDocuments> => {
  if (params.version.organizationId && params.version.organizationId !== params.requirement.organizationId) {
    throw new Error(DOCUMENT_REQUIREMENT_OWNERSHIP_ERROR);
  }

  const lockedRequirement = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "DocumentRequirements"
    WHERE "id" = ${params.requirement.id}
      AND "organizationId" = ${params.requirement.organizationId}
    FOR UPDATE
  `);
  if (lockedRequirement.length === 0) {
    throw new Error(`Document Requirement ${params.requirement.id} does not exist.`);
  }

  const latestVersion = await tx.templateDocuments.findFirst({
    where: { documentRequirementId: params.requirement.id },
    orderBy: { versionSequence: 'desc' },
    select: { versionSequence: true },
  });
  const versionSequence = (latestVersion?.versionSequence ?? 0) + 1;
  const { organizationId: _versionOrganizationId, ...versionData } = params.version;

  return tx.templateDocuments.create({
    data: {
      ...versionData,
      documentRequirementId: params.requirement.id,
      organizationId: params.requirement.organizationId,
      versionSequence,
    },
  });
};

export const createDocumentRequirementWithVersion = async (
  tx: DocumentTemplateVersionClient,
  params: {
    requirement: DocumentRequirementCreateData;
    version: DocumentTemplateVersionCreateData;
  },
): Promise<TemplateDocuments> => {
  const requirement = await ensureDocumentRequirement(tx, params.requirement);
  return createDocumentTemplateVersion(tx, {
    requirement,
    version: params.version,
  });
};

export const lockDocumentTemplateVersionForUpdate = async (
  tx: DocumentTemplateVersionClient,
  versionId: string,
) => {
  const version = await lockTemplateDocumentVersion(tx, versionId);
  const isFrozen = version.frozenAt !== null
    || await hasPersistedVersionReference(tx, versionId);
  return { version, isFrozen };
};

export const isDocumentTemplateVersionFrozen = async (
  tx: DocumentTemplateVersionClient,
  versionId: string,
): Promise<boolean> => {
  const version = await tx.templateDocuments.findUnique({
    where: { id: versionId },
    select: { id: true, frozenAt: true },
  });
  if (!version) {
    throw new DocumentTemplateVersionNotFoundError(versionId);
  }
  if (version.frozenAt) {
    return true;
  }
  return hasPersistedVersionReference(tx, versionId);
};

export const editDocumentTemplateVersion = async (
  tx: DocumentTemplateVersionClient,
  params: {
    versionId: string;
    organizationId: string;
    material?: DocumentTemplateVersionMaterialData;
    display?: DocumentRequirementDisplayData;
    newVersionId?: string;
    isFrozenRejectionRequired?: boolean;
    isNewVersionRequired?: boolean;
  },
): Promise<DocumentTemplateVersionEditResult> => {
  const current = await lockTemplateDocumentVersion(tx, params.versionId);
  if (current.organizationId !== params.organizationId) {
    throw new Error(DOCUMENT_TEMPLATE_VERSION_OWNERSHIP_ERROR);
  }

  const material = params.material ?? {};
  const changed = hasMaterialChanges(current, material);
  const lifecyclePatch = material.status !== undefined
    ? { status: material.status }
    : {};
  const referenced = params.isFrozenRejectionRequired
    ? current.frozenAt !== null || await hasPersistedVersionReference(tx, current.id)
    : false;

  if (referenced) {
    throw new DocumentTemplateVersionFrozenError(current.id);
  }
  if (params.isNewVersionRequired && params.newVersionId) {
    const existingNewVersion = await tx.templateDocuments.findUnique({
      where: { id: params.newVersionId },
    });
    if (
      existingNewVersion
      && existingNewVersion.documentRequirementId === current.documentRequirementId
      && existingNewVersion.organizationId === current.organizationId
    ) {
      return {
        template: existingNewVersion,
        requirement: await requirementForVersion(tx, current),
        previousVersionId: current.id,
        isNewVersionCreated: false,
      };
    }
  }

  const requirement = await updateRequirementDisplayMetadata(tx, current, params.display);

  if (!changed && !params.isNewVersionRequired) {

    const template = Object.keys(lifecyclePatch).length > 0
      ? await tx.templateDocuments.update({
        where: { id: current.id },
        data: { ...lifecyclePatch, updatedAt: new Date() },
      })
      : current as TemplateDocuments;
    return {
      template,
      requirement,
      previousVersionId: null,
      isNewVersionCreated: false,
    };
  }

  const shouldCreateVersion = params.isNewVersionRequired
    || current.frozenAt !== null
    || await hasPersistedVersionReference(tx, current.id);
  if (!shouldCreateVersion) {
    const template = await tx.templateDocuments.update({
      where: { id: current.id },
      data: {
        ...materialPatchFrom(material),
        ...lifecyclePatch,
        updatedAt: new Date(),
      },
    });
    return {
      template,
      requirement,
      previousVersionId: null,
      isNewVersionCreated: false,
    };
  }

  const frozenAt = current.frozenAt ?? new Date();
  const nextVersionAt = new Date(Math.max(Date.now(), frozenAt.getTime() + 1));
  if (!current.frozenAt) {
    await tx.templateDocuments.update({
      where: { id: current.id },
      data: { frozenAt, updatedAt: frozenAt },
    });
  }

  const nextVersion = await createDocumentTemplateVersion(tx, {
    requirement: {
      id: current.documentRequirementId,
      organizationId: current.organizationId,
    },
    version: {
      id: params.newVersionId ?? randomUUID(),
      createdAt: nextVersionAt,
      updatedAt: nextVersionAt,
      templateId: current.templateId,
      type: current.type,
      title: current.title,
      description: current.description,
      signOnce: current.signOnce,
      requiredSignerType: current.requiredSignerType,
      status: current.status,
      createdBy: current.createdBy,
      roleIndex: current.roleIndex,
      roleIndexes: current.roleIndexes,
      signerRoles: current.signerRoles,
      content: current.content,
      ...materialPatchFrom(material),
      ...lifecyclePatch,
    },
  });

  return {
    template: nextVersion,
    requirement,
    previousVersionId: current.id,
    isNewVersionCreated: true,
  };
};
