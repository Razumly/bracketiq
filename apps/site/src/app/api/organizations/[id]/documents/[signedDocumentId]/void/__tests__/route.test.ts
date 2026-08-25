/** @jest-environment node */

import { NextRequest } from "next/server";

const txMock = {
  signedDocuments: {
    updateMany: jest.fn(),
  },
};

const prismaMock = {
  organizations: {
    findUnique: jest.fn(),
  },
  signedDocuments: {
    findFirst: jest.fn(),
  },
  documentSubjects: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
};

const requireSessionMock = jest.fn();
const verifyRecentAuthTokenMock = jest.fn();
const hasOrgPermissionMock = jest.fn();
const invalidateDocumentRequirementSatisfactionsMock = jest.fn();
const appendDocumentEvidenceAuditEventMock = jest.fn();
const notifyDocumentEvidenceChangeMock = jest.fn();
const recordDocumentEvidenceInAppNotificationMock = jest.fn();
jest.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
jest.mock("@/lib/authServer", () => ({
  verifyRecentAuthToken: (...args: unknown[]) => verifyRecentAuthTokenMock(...args),
}));
jest.mock("@/lib/permissions", () => ({ requireSession: requireSessionMock }));
jest.mock("@/server/accessControl", () => ({
  hasOrgPermission: hasOrgPermissionMock,
}));
jest.mock("@/server/documentEvidence", () => ({
  DOCUMENT_EVIDENCE_PROVENANCE: { IMPORTED: "IMPORTED", BOLDSIGN: "BOLDSIGN" },
  invalidateDocumentRequirementSatisfactions:
    invalidateDocumentRequirementSatisfactionsMock,
  appendDocumentEvidenceAuditEvent: appendDocumentEvidenceAuditEventMock,
}));
jest.mock("@/server/documentNotifications", () => ({
  notifyDocumentEvidenceChange: notifyDocumentEvidenceChangeMock,
  recordDocumentEvidenceInAppNotification: recordDocumentEvidenceInAppNotificationMock,
}));

import { POST } from "@/app/api/organizations/[id]/documents/[signedDocumentId]/void/route";

describe("POST /api/organizations/[id]/documents/[signedDocumentId]/void", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyRecentAuthTokenMock.mockReturnValue({
      userId: "manager_1",
      purpose: "sensitive_action",
      issuedAtSeconds: Math.floor(Date.now() / 1000),
    });
    invalidateDocumentRequirementSatisfactionsMock.mockResolvedValue(undefined);
    appendDocumentEvidenceAuditEventMock.mockResolvedValue(undefined);
    notifyDocumentEvidenceChangeMock.mockResolvedValue(undefined);
    txMock.signedDocuments.updateMany.mockResolvedValue({ count: 1 });
    hasOrgPermissionMock.mockResolvedValue(true);
    requireSessionMock.mockResolvedValue({
      userId: "manager_1",
      isAdmin: false,
      issuedAtSeconds: Math.floor(Date.now() / 1000),
    });
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: "org_1",
      ownerId: "owner_1",
    });
    prismaMock.signedDocuments.findFirst.mockResolvedValue({
      id: "evidence_1",
      provenance: "IMPORTED",
      status: "SIGNED",
    });
    txMock.signedDocuments.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback(txMock),
    );
  });

  it("voids evidence, invalidates Satisfaction, and records an audit event", async () => {
    const response = await POST(
      new NextRequest(
        "http://localhost/api/organizations/org_1/documents/evidence_1/void",
        {
          method: "POST",
          body: JSON.stringify({ reason: "Duplicate evidence" }),
          headers: { "Content-Type": "application/json" },
        },
      ),
      {
        params: Promise.resolve({
          id: "org_1",
          signedDocumentId: "evidence_1",
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(txMock.signedDocuments.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "evidence_1" }),
        data: { status: "VOID", updatedAt: expect.any(Date) },
      }),
    );
    expect(invalidateDocumentRequirementSatisfactionsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        evidenceIds: ["evidence_1"],
      }),
      expect.anything(),
    );
    expect(appendDocumentEvidenceAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "VOID",
        evidenceId: "evidence_1",
        reason: "Duplicate evidence",
      }),
      expect.anything(),
    );
  });

  it("does not append a duplicate audit event when the row is voided concurrently", async () => {
    txMock.signedDocuments.updateMany.mockResolvedValue({ count: 0 });

    const response = await POST(
      new NextRequest(
        "http://localhost/api/organizations/org_1/documents/evidence_1/void",
        {
          method: "POST",
          body: JSON.stringify({ reason: "Duplicate evidence" }),
          headers: { "Content-Type": "application/json" },
        },
      ),
      {
        params: Promise.resolve({
          id: "org_1",
          signedDocumentId: "evidence_1",
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(
      invalidateDocumentRequirementSatisfactionsMock,
    ).not.toHaveBeenCalled();
    expect(appendDocumentEvidenceAuditEventMock).not.toHaveBeenCalled();
  });

  it("rejects voiding provider evidence", async () => {
    prismaMock.signedDocuments.findFirst.mockResolvedValue({
      id: "evidence_1",
      provenance: "BOLDSIGN",
      status: "SIGNED",
    });

    const response = await POST(
      new NextRequest(
        "http://localhost/api/organizations/org_1/documents/evidence_1/void",
        {
          method: "POST",
          body: JSON.stringify({ reason: "Wrong Document Subject" }),
          headers: { "Content-Type": "application/json" },
        },
      ),
      {
        params: Promise.resolve({
          id: "org_1",
          signedDocumentId: "evidence_1",
        }),
      },
    );

    expect(response.status).toBe(409);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
  it("returns a client error when Satisfaction invalidation fails", async () => {
    invalidateDocumentRequirementSatisfactionsMock.mockRejectedValue(
      new Error("Satisfaction invalidation failed."),
    );

    const response = await POST(
      new NextRequest(
        "http://localhost/api/organizations/org_1/documents/evidence_1/void",
        {
          method: "POST",
          body: JSON.stringify({ reason: "Replaced by corrected evidence" }),
          headers: { "Content-Type": "application/json" },
        },
      ),
      {
        params: Promise.resolve({
          id: "org_1",
          signedDocumentId: "evidence_1",
        }),
      },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(
      expect.objectContaining({ error: "Satisfaction invalidation failed." }),
    );
    expect(appendDocumentEvidenceAuditEventMock).not.toHaveBeenCalled();
  });

  it("returns a client error when audit append fails", async () => {
    appendDocumentEvidenceAuditEventMock.mockRejectedValue(
      new Error("Audit append failed."),
    );

    const response = await POST(
      new NextRequest(
        "http://localhost/api/organizations/org_1/documents/evidence_1/void",
        {
          method: "POST",
          body: JSON.stringify({ reason: "Other", note: "Audit failure." }),
          headers: { "Content-Type": "application/json" },
        },
      ),
      {
        params: Promise.resolve({
          id: "org_1",
          signedDocumentId: "evidence_1",
        }),
      },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(
      expect.objectContaining({ error: "Audit append failed." }),
    );
  });
  it("rejects staff without document void permission", async () => {
    hasOrgPermissionMock.mockResolvedValue(false);

    const response = await POST(
      new NextRequest(
        "http://localhost/api/organizations/org_1/documents/evidence_1/void",
        {
          method: "POST",
          body: JSON.stringify({}),
          headers: { "Content-Type": "application/json" },
        },
      ),
      {
        params: Promise.resolve({
          id: "org_1",
          signedDocumentId: "evidence_1",
        }),
      },
    );

    expect(response.status).toBe(403);
    expect(prismaMock.signedDocuments.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("requires a recent password proof before voiding evidence", async () => {
    verifyRecentAuthTokenMock.mockReturnValue(null);

    const response = await POST(
      new NextRequest(
        "http://localhost/api/organizations/org_1/documents/evidence_1/void",
        {
          method: "POST",
          body: JSON.stringify({ reason: "Duplicate evidence" }),
          headers: { "Content-Type": "application/json" },
        },
      ),
      {
        params: Promise.resolve({
          id: "org_1",
          signedDocumentId: "evidence_1",
        }),
      },
    );

    expect(response.status).toBe(401);
    expect(prismaMock.signedDocuments.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
  it("rejects identity proof older than ten minutes", async () => {
    verifyRecentAuthTokenMock.mockReturnValue({
      userId: "manager_1",
      purpose: "sensitive_action",
      issuedAtSeconds: Math.floor(Date.now() / 1000) - 601,
    });

    const response = await POST(
      new NextRequest(
        "http://localhost/api/organizations/org_1/documents/evidence_1/void",
        {
          method: "POST",
          body: JSON.stringify({ reason: "Duplicate evidence" }),
          headers: { "Content-Type": "application/json" },
        },
      ),
      {
        params: Promise.resolve({
          id: "org_1",
          signedDocumentId: "evidence_1",
        }),
      },
    );

    expect(response.status).toBe(401);
    expect(prismaMock.signedDocuments.findFirst).not.toHaveBeenCalled();
  });

  it("notifies the document subject after a successful void", async () => {
    prismaMock.signedDocuments.findFirst.mockResolvedValue({
      id: "evidence_1",
      provenance: "IMPORTED",
      status: "SIGNED",
      documentName: "Waiver",
      documentSubjectId: "subject_1",
    });
    prismaMock.documentSubjects.findUnique.mockResolvedValue({ userId: "player_1" });

    const response = await POST(
      new NextRequest(
        "http://localhost/api/organizations/org_1/documents/evidence_1/void",
        {
          method: "POST",
          body: JSON.stringify({ reason: "Wrong Document Requirement or Version" }),
          headers: { "Content-Type": "application/json" },
        },
      ),
      {
        params: Promise.resolve({
          id: "org_1",
          signedDocumentId: "evidence_1",
        }),
      },
    );

    expect(recordDocumentEvidenceInAppNotificationMock).toHaveBeenCalledWith(
      {
        organizationId: "org_1",
        subjectUserId: "player_1",
        evidenceId: "evidence_1",
        documentName: "Waiver",
        action: "VOID",
        actorUserId: "manager_1",
      },
      expect.anything(),
    );
    expect(notifyDocumentEvidenceChangeMock).toHaveBeenCalledWith(
      {
        organizationId: "org_1",
        subjectUserId: "player_1",
        evidenceId: "evidence_1",
        documentName: "Waiver",
        action: "VOID",
        actorUserId: "manager_1",
      },
      { isInAppIncluded: false },
    );
  });
  it("rolls back a void when in-app notification recording fails", async () => {
    recordDocumentEvidenceInAppNotificationMock.mockRejectedValueOnce(
      new Error("In-app notification storage failed."),
    );
    prismaMock.signedDocuments.findFirst.mockResolvedValue({
      id: "evidence_1",
      provenance: "IMPORTED",
      status: "SIGNED",
      documentName: "Waiver",
      documentSubjectId: "subject_1",
    });
    prismaMock.documentSubjects.findUnique.mockResolvedValue({ userId: "player_1" });

    const response = await POST(
      new NextRequest(
        "http://localhost/api/organizations/org_1/documents/evidence_1/void",
        {
          method: "POST",
          body: JSON.stringify({ reason: "Duplicate evidence" }),
          headers: { "Content-Type": "application/json" },
        },
      ),
      {
        params: Promise.resolve({
          id: "org_1",
          signedDocumentId: "evidence_1",
        }),
      },
    );

    expect(response.status).toBe(400);
    expect(txMock.signedDocuments.updateMany).toHaveBeenCalled();
    expect(notifyDocumentEvidenceChangeMock).not.toHaveBeenCalled();
  });
  it.each([
    "Wrong Document Subject",
    "Wrong Document Requirement or Version",
    "Wrong scope",
    "Duplicate evidence",
    "Incomplete or unsigned document",
    "Unreadable or incorrect file",
    "Replaced by corrected evidence",
  ])("accepts controlled reason %s", async (reason) => {
    const response = await POST(
      new NextRequest(
        "http://localhost/api/organizations/org_1/documents/evidence_1/void",
        {
          method: "POST",
          body: JSON.stringify({ reason }),
          headers: { "Content-Type": "application/json" },
        },
      ),
      {
        params: Promise.resolve({
          id: "org_1",
          signedDocumentId: "evidence_1",
        }),
      },
    );

    expect(response.status).toBe(200);
  });

  it("requires a private note for the Other reason", async () => {
    const response = await POST(
      new NextRequest(
        "http://localhost/api/organizations/org_1/documents/evidence_1/void",
        {
          method: "POST",
          body: JSON.stringify({ reason: "Other" }),
          headers: { "Content-Type": "application/json" },
        },
      ),
      {
        params: Promise.resolve({
          id: "org_1",
          signedDocumentId: "evidence_1",
        }),
      },
    );

    expect(response.status).toBe(400);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("stores the Other note only in the audit event", async () => {
    const response = await POST(
      new NextRequest(
        "http://localhost/api/organizations/org_1/documents/evidence_1/void",
        {
          method: "POST",
          body: JSON.stringify({ reason: "Other", note: "Duplicate source file." }),
          headers: { "Content-Type": "application/json" },
        },
      ),
      {
        params: Promise.resolve({
          id: "org_1",
          signedDocumentId: "evidence_1",
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(appendDocumentEvidenceAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "Other",
        note: "Duplicate source file.",
      }),
      expect.anything(),
    );
  });

  it("rejects an uncontrolled reason before opening a transaction", async () => {
    const response = await POST(
      new NextRequest(
        "http://localhost/api/organizations/org_1/documents/evidence_1/void",
        {
          method: "POST",
          body: JSON.stringify({ reason: "Not a controlled reason" }),
          headers: { "Content-Type": "application/json" },
        },
      ),
      {
        params: Promise.resolve({
          id: "org_1",
          signedDocumentId: "evidence_1",
        }),
      },
    );

    expect(response.status).toBe(400);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
