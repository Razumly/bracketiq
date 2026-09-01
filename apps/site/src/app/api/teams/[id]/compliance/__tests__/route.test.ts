/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  canonicalTeams: { findUnique: jest.fn() },
  organizations: { findUnique: jest.fn() },
  teamRegistrations: { findMany: jest.fn() },
  userData: { findMany: jest.fn() },
  templateDocuments: { findMany: jest.fn() },
  bills: { findMany: jest.fn() },
  billPayments: { findMany: jest.fn() },
  registrationQuestionResponses: { findMany: jest.fn() },
  documentRequirementSatisfactions: { findMany: jest.fn() },
  signedDocuments: { findMany: jest.fn() },
};

const requireSessionMock = jest.fn();
const canManageCanonicalTeamMock = jest.fn();
const hasOrganizationStaffAccessMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/teams/teamMembership', () => ({
  canManageCanonicalTeam: canManageCanonicalTeamMock,
}));
jest.mock('@/server/accessControl', () => ({
  hasOrganizationStaffAccess: hasOrganizationStaffAccessMock,
}));

import { GET } from '@/app/api/teams/[id]/compliance/route';

describe('GET /api/teams/[id]/compliance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'manager_1', isAdmin: false });
    canManageCanonicalTeamMock.mockResolvedValue(true);
    hasOrganizationStaffAccessMock.mockResolvedValue(false);
    prismaMock.canonicalTeams.findUnique.mockResolvedValue({
      id: 'team_1',
      name: 'North Stars',
      organizationId: 'org_1',
      requiredTemplateIds: ['template_1'],
      registrationPriceCents: 0,
    });
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_1', ownerId: 'owner_1' });
    prismaMock.teamRegistrations.findMany.mockResolvedValue([
      {
        id: 'registration_1',
        userId: 'user_1',
        parentId: null,
        registrantType: 'SELF',
        status: 'ACTIVE',
        updatedAt: new Date('2026-08-01T00:00:00.000Z'),
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    ]);
    prismaMock.userData.findMany.mockResolvedValue([
      {
        id: 'user_1',
        firstName: 'Player',
        lastName: 'One',
        userName: 'player-one',
        dateOfBirth: new Date('2000-01-01T00:00:00.000Z'),
      },
    ]);
    prismaMock.templateDocuments.findMany.mockResolvedValue([
      {
        id: 'template_1',
        title: 'Team waiver',
        type: 'PDF',
        signOnce: false,
        requiredSignerType: 'PARTICIPANT',
      },
    ]);
    prismaMock.bills.findMany.mockResolvedValue([]);
    prismaMock.billPayments.findMany.mockResolvedValue([]);
    prismaMock.registrationQuestionResponses.findMany.mockResolvedValue([]);
    prismaMock.documentRequirementSatisfactions.findMany.mockResolvedValue([]);
    prismaMock.signedDocuments.findMany.mockResolvedValue([]);
  });

  it('uses completed Team-membership Satisfaction as the signed result', async () => {
    prismaMock.documentRequirementSatisfactions.findMany.mockResolvedValue([
      {
        documentSubjectId: 'document-subject:org_1:user_1',
        templateDocumentId: 'template_1',
        scopeType: 'TEAM_MEMBERSHIP',
        scopeId: 'team_1',
        sourceEvidenceId: 'evidence_1',
        updatedAt: new Date('2026-08-02T00:00:00.000Z'),
      },
    ]);
    prismaMock.signedDocuments.findMany.mockResolvedValue([
      { id: 'evidence_1', signedAt: new Date('2026-08-02T00:00:00.000Z') },
    ]);

    const response = await GET(
      new NextRequest('http://localhost/api/teams/team_1/compliance'),
      { params: Promise.resolve({ id: 'team_1' }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.team.users[0].requiredDocuments).toEqual([
      expect.objectContaining({
        status: 'SIGNED',
        signedDocumentRecordId: 'evidence_1',
      }),
    ]);
    expect(json.team.users[0].documents).toEqual({ signedCount: 1, requiredCount: 1 });
    expect(prismaMock.signedDocuments.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['evidence_1'] } },
      select: { id: true, signedAt: true },
    });
  });

  it('does not treat a raw signed document as team requirement completion', async () => {
    prismaMock.signedDocuments.findMany.mockResolvedValue([
      {
        id: 'raw_signed',
        templateId: 'template_1',
        userId: 'user_1',
        teamId: 'team_1',
        status: 'SIGNED',
        signedAt: new Date('2026-08-02T00:00:00.000Z'),
        createdAt: new Date('2026-08-02T00:00:00.000Z'),
      },
    ]);

    const response = await GET(
      new NextRequest('http://localhost/api/teams/team_1/compliance'),
      { params: Promise.resolve({ id: 'team_1' }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.team.users[0].requiredDocuments).toEqual([
      expect.objectContaining({
        status: 'UNSIGNED',
      }),
    ]);
    expect(json.team.users[0].requiredDocuments[0]).not.toHaveProperty('signedDocumentRecordId');
    expect(prismaMock.documentRequirementSatisfactions.findMany).toHaveBeenCalled();
  });
});
