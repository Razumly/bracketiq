import { Prisma, type TemplateDocuments } from '@/generated/prisma/client';

type DocumentTemplateVersionClient = Pick<
  Prisma.TransactionClient,
  '$queryRaw' | 'documentRequirements' | 'templateDocuments'
>;

type DocumentRequirementRef = Pick<
  Prisma.DocumentRequirementsUncheckedCreateInput,
  'id' | 'organizationId'
>;

export type DocumentRequirementCreateData = Prisma.DocumentRequirementsUncheckedCreateInput;

export type DocumentTemplateVersionCreateData = Omit<
  Prisma.TemplateDocumentsUncheckedCreateInput,
  'documentRequirementId' | 'versionSequence' | 'organizationId'
> & {
  organizationId?: string;
};

const DOCUMENT_REQUIREMENT_OWNERSHIP_ERROR =
  'Document Requirement and Document Template Version must belong to the same Organization.';

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
