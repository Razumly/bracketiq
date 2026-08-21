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
  $transaction: jest.fn(),
};

const requireSessionMock = jest.fn();
const canManageOrganizationMock = jest.fn();
const hasOrgPermissionMock = jest.fn();
const invalidateDocumentRequirementSatisfactionMock = jest.fn();
const appendDocumentEvidenceAuditEventMock = jest.fn();

jest.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
jest.mock("@/lib/permissions", () => ({ requireSession: requireSessionMock }));
jest.mock("@/server/accessControl", () => ({
  canManageOrganization: canManageOrganizationMock,
  hasOrgPermission: hasOrgPermissionMock,
}));
jest.mock("@/server/documentEvidence", () => ({
  DOCUMENT_EVIDENCE_PROVENANCE: { IMPORTED: "IMPORTED", BOLDSIGN: "BOLDSIGN" },
  invalidateDocumentRequirementSatisfaction:
    invalidateDocumentRequirementSatisfactionMock,
  appendDocumentEvidenceAuditEvent: appendDocumentEvidenceAuditEventMock,
}));

import { POST } from "@/app/api/organizations/[id]/documents/[signedDocumentId]/void/route";

describe("POST /api/organizations/[id]/documents/[signedDocumentId]/void", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    invalidateDocumentRequirementSatisfactionMock.mockResolvedValue(undefined);
    appendDocumentEvidenceAuditEventMock.mockResolvedValue(undefined);
    requireSessionMock.mockResolvedValue({
      userId: "manager_1",
      isAdmin: false,
    });
    hasOrgPermissionMock.mockResolvedValue(true);
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
          body: JSON.stringify({ reason: "Duplicate record." }),
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
    expect(invalidateDocumentRequirementSatisfactionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        evidenceId: "evidence_1",
      }),
      expect.anything(),
    );
    expect(appendDocumentEvidenceAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "VOID",
        evidenceId: "evidence_1",
        reason: "Duplicate record.",
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

    expect(response.status).toBe(200);
    expect(
      invalidateDocumentRequirementSatisfactionMock,
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
          body: JSON.stringify({ reason: "Not an import." }),
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
    invalidateDocumentRequirementSatisfactionMock.mockRejectedValue(
      new Error("Satisfaction invalidation failed."),
    );

    const response = await POST(
      new NextRequest(
        "http://localhost/api/organizations/org_1/documents/evidence_1/void",
        {
          method: "POST",
          body: JSON.stringify({ reason: "Atomic void." }),
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
          body: JSON.stringify({ reason: "Audit failure." }),
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
});
