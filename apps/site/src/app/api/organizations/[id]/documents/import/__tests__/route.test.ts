/** @jest-environment node */

import { NextRequest } from "next/server";

const txMock = {
  signedDocuments: {
    create: jest.fn(),
  },
};

const prismaMock = {
  organizations: {
    findUnique: jest.fn(),
  },
  templateDocuments: {
    findUnique: jest.fn(),
  },
  documentRequirements: {
    findUnique: jest.fn(),
  },
  userData: {
    findMany: jest.fn(),
  },
  events: {
    findUnique: jest.fn(),
  },
  canonicalTeams: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  teamRegistrations: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  file: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
};

const requireSessionMock = jest.fn();
const canManageOrganizationMock = jest.fn();
const hasOrgPermissionMock = jest.fn();
const listOrganizationUsersScopeEventsMock = jest.fn();
const ensureDocumentSubjectMock = jest.fn();
const signedDocumentEvidenceFieldsMock = jest.fn();
const createDocumentRequirementSatisfactionMock = jest.fn();
const appendDocumentEvidenceAuditEventMock = jest.fn();

jest.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
jest.mock("@/lib/permissions", () => ({ requireSession: requireSessionMock }));
jest.mock("@/server/accessControl", () => ({
  canManageOrganization: canManageOrganizationMock,
  hasOrgPermission: hasOrgPermissionMock,
}));
jest.mock("@/server/organizationUsersAccess", () => ({
  listOrganizationUsersScopeEvents: listOrganizationUsersScopeEventsMock,
}));
jest.mock("@/server/documentEvidence", () => ({
  DOCUMENT_EVIDENCE_PROVENANCE: { IMPORTED: "IMPORTED" },
  ensureDocumentSubject: ensureDocumentSubjectMock,
  signedDocumentEvidenceFields: signedDocumentEvidenceFieldsMock,
  createDocumentRequirementSatisfaction:
    createDocumentRequirementSatisfactionMock,
  appendDocumentEvidenceAuditEvent: appendDocumentEvidenceAuditEventMock,
}));

import { POST } from "@/app/api/organizations/[id]/documents/import/route";

describe("POST /api/organizations/[id]/documents/import", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({
      userId: "manager_1",
      isAdmin: false,
    });
    canManageOrganizationMock.mockResolvedValue(false);
    hasOrgPermissionMock.mockResolvedValue(true);
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: "org_1",
      ownerId: "owner_1",
    });
    prismaMock.templateDocuments.findUnique.mockResolvedValue({
      id: "version_1",
      organizationId: "org_1",
      documentRequirementId: "requirement_1",
      requiredSignerType: "PARTICIPANT",
      signerRoles: ["participant"],
    });
    prismaMock.documentRequirements.findUnique.mockResolvedValue({
      id: "requirement_1",
      organizationId: "org_1",
    });
    prismaMock.userData.findMany.mockResolvedValue([{ id: "player_1" }]);
    listOrganizationUsersScopeEventsMock.mockResolvedValue([
      { id: "event_1", userIds: ["player_1"], teamIds: [] },
    ]);
    prismaMock.events.findUnique.mockResolvedValue(null);
    prismaMock.canonicalTeams.findUnique.mockResolvedValue(null);
    prismaMock.canonicalTeams.findMany.mockResolvedValue([]);
    prismaMock.teamRegistrations.findMany.mockResolvedValue([]);
    prismaMock.file.findUnique.mockResolvedValue({
      id: "file_1",
      organizationId: "org_1",
    });
    signedDocumentEvidenceFieldsMock.mockImplementation(
      (params: { userId?: string | null }) => ({
        provenance: "IMPORTED",
        providerDocumentId: null,
        signerUserId: params.userId ?? null,
        documentSubjectId: "document-subject:org_1:player_1",
        scopeType: "ORGANIZATION",
        scopeId: "org_1",
      }),
    );
    txMock.signedDocuments.create.mockResolvedValue({ id: "evidence_1" });
    ensureDocumentSubjectMock.mockResolvedValue(
      "document-subject:org_1:player_1",
    );
    createDocumentRequirementSatisfactionMock.mockResolvedValue(undefined);
    appendDocumentEvidenceAuditEventMock.mockResolvedValue(undefined);
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback(txMock),
    );
  });

  it("stores imported evidence and records its import audit event", async () => {
    const response = await POST(
      new NextRequest(
        "http://localhost/api/organizations/org_1/documents/import",
        {
          method: "POST",
          body: JSON.stringify({
            subjectUserId: "player_1",
            signerUserId: "player_1",
            templateId: "version_1",
            documentName: "Prior waiver",
            contentHash: "sha256:abc",
            importedFileId: "file_1",
            scopeType: "ORGANIZATION",
            scopeId: "org_1",
            historicalSigningDate: "2026-08-01T10:00:00.000Z",
            signerRole: "participant",
          }),
          headers: { "Content-Type": "application/json" },
        },
      ),
      { params: Promise.resolve({ id: "org_1" }) },
    );

    expect(response.status).toBe(201);
    expect(txMock.signedDocuments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provenance: "IMPORTED",
          providerDocumentId: null,
          contentHash: "sha256:abc",
          documentSubjectId: "document-subject:org_1:player_1",
          status: "SIGNED",
        }),
      }),
    );
    expect(ensureDocumentSubjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "player_1",
        documentSubjectUserId: "player_1",
      }),
      expect.anything(),
    );
    expect(createDocumentRequirementSatisfactionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        evidenceId: "evidence_1",
        templateDocumentId: "version_1",
        requiredSignerRoles: ["participant"],
      }),
      expect.anything(),
    );
    expect(appendDocumentEvidenceAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "IMPORT",
        evidenceId: "evidence_1",
      }),
      expect.anything(),
    );
  });
  it("projects sign-once imported evidence to Organization scope", async () => {
    prismaMock.templateDocuments.findUnique.mockResolvedValueOnce({
      id: "version_1",
      organizationId: "org_1",
      documentRequirementId: "requirement_1",
      requiredSignerType: "PARTICIPANT",
      signerRoles: ["participant"],
      signOnce: true,
    });

    const response = await POST(
      new NextRequest(
        "http://localhost/api/organizations/org_1/documents/import",
        {
          method: "POST",
          body: JSON.stringify({
            subjectUserId: "player_1",
            signerUserId: "player_1",
            templateId: "version_1",
            documentName: "Prior sign-once waiver",
            contentHash: "sha256:sign-once",
            importedFileId: "file_1",
            scopeType: "ORGANIZATION",
            scopeId: "org_1",
            signerRole: "participant",
          }),
          headers: { "Content-Type": "application/json" },
        },
      ),
      { params: Promise.resolve({ id: "org_1" }) },
    );

    expect(response.status).toBe(201);
    expect(signedDocumentEvidenceFieldsMock).toHaveBeenCalledWith(
      expect.objectContaining({ signOnce: true }),
    );
    expect(txMock.signedDocuments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scopeType: "ORGANIZATION",
          scopeId: "org_1",
        }),
      }),
    );
  });

  it("derives combined signer roles for imported evidence", async () => {
    prismaMock.templateDocuments.findUnique.mockResolvedValueOnce({
      id: "version_1",
      organizationId: "org_1",
      documentRequirementId: "requirement_1",
      requiredSignerType: "PARENT_GUARDIAN_CHILD",
      signerRoles: [],
    });

    const response = await POST(
      new NextRequest(
        "http://localhost/api/organizations/org_1/documents/import",
        {
          method: "POST",
          body: JSON.stringify({
            subjectUserId: "player_1",
            signerUserId: "player_1",
            templateId: "version_1",
            documentName: "Prior combined waiver",
            contentHash: "sha256:combined",
            importedFileId: "file_1",
            scopeType: "ORGANIZATION",
            scopeId: "org_1",
            signerRole: "Child",
          }),
          headers: { "Content-Type": "application/json" },
        },
      ),
      { params: Promise.resolve({ id: "org_1" }) },
    );

    expect(response.status).toBe(201);
    expect(createDocumentRequirementSatisfactionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        requiredSignerRoles: ["Parent/Guardian", "Child"],
        completedSignerRoles: ["Parent/Guardian", "Child"],
        signerRole: "Child",
      }),
      expect.anything(),
    );
  });
  it("treats a signed import without a signer role as complete evidence for every required role", async () => {
    prismaMock.templateDocuments.findUnique.mockResolvedValueOnce({
      id: "version_1",
      organizationId: "org_1",
      documentRequirementId: "requirement_1",
      requiredSignerType: "PARENT_GUARDIAN_CHILD",
      signerRoles: [],
    });

    const response = await POST(
      new NextRequest(
        "http://localhost/api/organizations/org_1/documents/import",
        {
          method: "POST",
          body: JSON.stringify({
            subjectUserId: "player_1",
            templateId: "version_1",
            documentName: "Prior combined waiver",
            contentHash: "sha256:combined-no-role",
            importedFileId: "file_1",
            scopeType: "ORGANIZATION",
            scopeId: "org_1",
          }),
          headers: { "Content-Type": "application/json" },
        },
      ),
      { params: Promise.resolve({ id: "org_1" }) },
    );

    expect(response.status).toBe(201);
    expect(createDocumentRequirementSatisfactionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        requiredSignerRoles: ["Parent/Guardian", "Child"],
        completedSignerRoles: ["Parent/Guardian", "Child"],
        signerRole: undefined,
      }),
      expect.anything(),
    );
  });

  it("rejects an exact imported evidence duplicate", async () => {
    txMock.signedDocuments.create.mockRejectedValue({ code: "P2002" });

    const response = await POST(
      new NextRequest(
        "http://localhost/api/organizations/org_1/documents/import",
        {
          method: "POST",
          body: JSON.stringify({
            subjectUserId: "player_1",
            templateId: "version_1",
            documentName: "Prior waiver",
            contentHash: "sha256:abc",
            importedFileId: "file_1",
            scopeType: "ORGANIZATION",
            scopeId: "org_1",
          }),
          headers: { "Content-Type": "application/json" },
        },
      ),
      { params: Promise.resolve({ id: "org_1" }) },
    );

    expect(response.status).toBe(409);
  });

  it("rejects an import for a missing customer User before opening a transaction", async () => {
    prismaMock.userData.findMany.mockResolvedValue([]);

    const response = await POST(
      new NextRequest(
        "http://localhost/api/organizations/org_1/documents/import",
        {
          method: "POST",
          body: JSON.stringify({
            subjectUserId: "missing_user",
            templateId: "version_1",
            documentName: "Prior waiver",
            contentHash: "sha256:missing-user",
            importedFileId: "file_1",
            scopeType: "ORGANIZATION",
            scopeId: "org_1",
          }),
          headers: { "Content-Type": "application/json" },
        },
      ),
      { params: Promise.resolve({ id: "org_1" }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        error: expect.stringContaining("User was not found"),
      }),
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejects an Event or File owned by another Organization", async () => {
    prismaMock.events.findUnique.mockResolvedValue({
      id: "event_2",
      organizationId: "org_2",
    });
    prismaMock.file.findUnique.mockResolvedValue({
      id: "file_2",
      organizationId: "org_2",
    });

    const response = await POST(
      new NextRequest(
        "http://localhost/api/organizations/org_1/documents/import",
        {
          method: "POST",
          body: JSON.stringify({
            subjectUserId: "player_1",
            templateId: "version_1",
            documentName: "Prior waiver",
            contentHash: "sha256:foreign-scope",
            importedFileId: "file_2",
            scopeType: "EVENT_PARTICIPATION",
            scopeId: "event_2",
          }),
          headers: { "Content-Type": "application/json" },
        },
      ),
      { params: Promise.resolve({ id: "org_1" }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        error: "Document scope does not belong to this Organization.",
      }),
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
  it("stores subject-only evidence without inferring a signer", async () => {
    const response = await POST(
      new NextRequest(
        "http://localhost/api/organizations/org_1/documents/import",
        {
          method: "POST",
          body: JSON.stringify({
            subjectUserId: "player_1",
            templateId: "version_1",
            documentName: "Unsigned historical waiver",
            contentHash: "sha256:subject-only",
            importedFileId: "file_1",
            scopeType: "ORGANIZATION",
            scopeId: "org_1",
          }),
          headers: { "Content-Type": "application/json" },
        },
      ),
      { params: Promise.resolve({ id: "org_1" }) },
    );

    expect(response.status).toBe(201);
    expect(ensureDocumentSubjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: null,
        hostId: null,
        documentSubjectUserId: "player_1",
      }),
      expect.anything(),
    );
    expect(txMock.signedDocuments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: null,
          signerUserId: null,
          documentSubjectId: "document-subject:org_1:player_1",
        }),
      }),
    );
  });
  it("rejects a User who is not an Organization customer", async () => {
    listOrganizationUsersScopeEventsMock.mockResolvedValue([
      { id: "event_1", userIds: ["other_player"], teamIds: [] },
    ]);

    const response = await POST(
      new NextRequest("http://localhost/api/organizations/org_1/documents/import", {
        method: "POST",
        body: JSON.stringify({
          subjectUserId: "player_1",
          templateId: "version_1",
          documentName: "Foreign customer",
          contentHash: "sha256:foreign-customer",
          importedFileId: "file_1",
          scopeType: "ORGANIZATION",
          scopeId: "org_1",
        }),
      }),
      { params: Promise.resolve({ id: "org_1" }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        error: "Document Subject is not a customer of this Organization.",
      }),
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a signer User who is outside the Organization customer scope", async () => {
    prismaMock.userData.findMany.mockResolvedValue([
      { id: "player_1" },
      { id: "signer_2" },
    ]);
    listOrganizationUsersScopeEventsMock.mockResolvedValue([
      { id: "event_1", userIds: ["player_1"], teamIds: [] },
    ]);

    const response = await POST(
      new NextRequest("http://localhost/api/organizations/org_1/documents/import", {
        method: "POST",
        body: JSON.stringify({
          subjectUserId: "player_1",
          signerUserId: "signer_2",
          templateId: "version_1",
          documentName: "Foreign signer",
          contentHash: "sha256:foreign-signer",
          importedFileId: "file_1",
          scopeType: "ORGANIZATION",
          scopeId: "org_1",
        }),
      }),
      { params: Promise.resolve({ id: "org_1" }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        error: "Signer is not a customer of this Organization.",
      }),
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a template whose Requirement belongs to another Organization", async () => {
    prismaMock.documentRequirements.findUnique.mockResolvedValue({
      id: "requirement_1",
      organizationId: "org_2",
    });

    const response = await POST(
      new NextRequest("http://localhost/api/organizations/org_1/documents/import", {
        method: "POST",
        body: JSON.stringify({
          subjectUserId: "player_1",
          templateId: "version_1",
          documentName: "Foreign Requirement",
          contentHash: "sha256:foreign-requirement",
          importedFileId: "file_1",
          scopeType: "ORGANIZATION",
          scopeId: "org_1",
        }),
      }),
      { params: Promise.resolve({ id: "org_1" }) },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual(
      expect.objectContaining({ error: "Document template not found." }),
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a Team scope owned by another Organization", async () => {
    prismaMock.canonicalTeams.findUnique.mockResolvedValue({
      id: "team_2",
      organizationId: "org_2",
    });

    const response = await POST(
      new NextRequest("http://localhost/api/organizations/org_1/documents/import", {
        method: "POST",
        body: JSON.stringify({
          subjectUserId: "player_1",
          templateId: "version_1",
          documentName: "Foreign team scope",
          contentHash: "sha256:foreign-team",
          importedFileId: "file_1",
          scopeType: "TEAM_MEMBERSHIP",
          scopeId: "team_2",
        }),
      }),
      { params: Promise.resolve({ id: "org_1" }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        error: "Document scope does not belong to this Organization.",
      }),
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejects an import with a missing scope", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/organizations/org_1/documents/import", {
        method: "POST",
        body: JSON.stringify({
          subjectUserId: "player_1",
          templateId: "version_1",
          documentName: "Missing scope",
          contentHash: "sha256:missing-scope",
          importedFileId: "file_1",
        }),
      }),
      { params: Promise.resolve({ id: "org_1" }) },
    );

    expect(response.status).toBe(400);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a File owned by another Organization", async () => {
    prismaMock.file.findUnique.mockResolvedValue({
      id: "file_2",
      organizationId: "org_2",
    });

    const response = await POST(
      new NextRequest("http://localhost/api/organizations/org_1/documents/import", {
        method: "POST",
        body: JSON.stringify({
          subjectUserId: "player_1",
          templateId: "version_1",
          documentName: "Foreign file",
          contentHash: "sha256:foreign-file",
          importedFileId: "file_2",
          scopeType: "ORGANIZATION",
          scopeId: "org_1",
        }),
      }),
      { params: Promise.resolve({ id: "org_1" }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        error: "Imported File does not belong to this Organization.",
      }),
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejects an import whose File is missing", async () => {
    prismaMock.file.findUnique.mockResolvedValue(null);

    const response = await POST(
      new NextRequest("http://localhost/api/organizations/org_1/documents/import", {
        method: "POST",
        body: JSON.stringify({
          subjectUserId: "player_1",
          templateId: "version_1",
          documentName: "Missing file",
          contentHash: "sha256:missing-file",
          importedFileId: "file_missing",
          scopeType: "ORGANIZATION",
          scopeId: "org_1",
        }),
      }),
      { params: Promise.resolve({ id: "org_1" }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        error: "Imported File does not belong to this Organization.",
      }),
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a signer role that is not required by the selected Version", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/organizations/org_1/documents/import", {
        method: "POST",
        body: JSON.stringify({
          subjectUserId: "player_1",
          signerUserId: "player_1",
          signerRole: "guardian",
          templateId: "version_1",
          documentName: "Invalid signer relationship",
          contentHash: "sha256:invalid-signer-role",
          importedFileId: "file_1",
          scopeType: "ORGANIZATION",
          scopeId: "org_1",
        }),
      }),
      { params: Promise.resolve({ id: "org_1" }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        error: "Signer role is not required by this Document Template Version.",
      }),
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a host that is not the Document Subject", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/organizations/org_1/documents/import", {
        method: "POST",
        body: JSON.stringify({
          subjectUserId: "player_1",
          signerUserId: "player_1",
          hostId: "other_player",
          templateId: "version_1",
          documentName: "Invalid host relationship",
          contentHash: "sha256:invalid-host",
          importedFileId: "file_1",
          scopeType: "ORGANIZATION",
          scopeId: "org_1",
        }),
      }),
      { params: Promise.resolve({ id: "org_1" }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(
      expect.objectContaining({ error: "hostId must match subjectUserId." }),
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a Team identifier as a Document Subject", async () => {
    prismaMock.userData.findMany.mockResolvedValue([{ id: "team_1" }]);
    prismaMock.canonicalTeams.findUnique.mockResolvedValue({
      id: "team_1",
      organizationId: "org_1",
    });
    prismaMock.canonicalTeams.findMany.mockResolvedValue([{ id: "team_1" }]);

    const response = await POST(
      new NextRequest("http://localhost/api/organizations/org_1/documents/import", {
        method: "POST",
        body: JSON.stringify({
          subjectUserId: "team_1",
          templateId: "version_1",
          documentName: "Team subject",
          contentHash: "sha256:team-subject",
          importedFileId: "file_1",
          scopeType: "ORGANIZATION",
          scopeId: "org_1",
        }),
      }),
      { params: Promise.resolve({ id: "org_1" }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        error: "Document Subject must be a User, not a Team.",
      }),
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("returns a client error when Satisfaction creation fails", async () => {
    createDocumentRequirementSatisfactionMock.mockRejectedValue(
      new Error("Satisfaction write failed."),
    );

    const response = await POST(
      new NextRequest("http://localhost/api/organizations/org_1/documents/import", {
        method: "POST",
        body: JSON.stringify({
          subjectUserId: "player_1",
          templateId: "version_1",
          documentName: "Atomic import",
          contentHash: "sha256:atomic-import",
          importedFileId: "file_1",
          scopeType: "ORGANIZATION",
          scopeId: "org_1",
        }),
      }),
      { params: Promise.resolve({ id: "org_1" }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(
      expect.objectContaining({ error: "Satisfaction write failed." }),
    );
    expect(ensureDocumentSubjectMock).toHaveBeenCalled();
    expect(txMock.signedDocuments.create).toHaveBeenCalled();
    expect(appendDocumentEvidenceAuditEventMock).not.toHaveBeenCalled();
  });
  it("returns a client error when audit creation fails", async () => {
    appendDocumentEvidenceAuditEventMock.mockRejectedValue(
      new Error("Audit write failed."),
    );

    const response = await POST(
      new NextRequest("http://localhost/api/organizations/org_1/documents/import", {
        method: "POST",
        body: JSON.stringify({
          subjectUserId: "player_1",
          templateId: "version_1",
          documentName: "Atomic audit import",
          contentHash: "sha256:atomic-audit",
          importedFileId: "file_1",
          scopeType: "ORGANIZATION",
          scopeId: "org_1",
        }),
      }),
      { params: Promise.resolve({ id: "org_1" }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(
      expect.objectContaining({ error: "Audit write failed." }),
    );
    expect(ensureDocumentSubjectMock).toHaveBeenCalled();
    expect(txMock.signedDocuments.create).toHaveBeenCalled();
  });
});
