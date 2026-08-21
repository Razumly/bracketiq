/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  $transaction: jest.fn(),
  documentSubjects: {
    upsert: jest.fn(),
  },
  organizations: {
    findUnique: jest.fn(),
  },
  templateDocuments: {
    findUnique: jest.fn(),
  },
  events: {
    findUnique: jest.fn(),
  },
  fields: {
    findMany: jest.fn(),
  },
  eventRegistrations: {
    findFirst: jest.fn(),
  },
  teams: {
    findMany: jest.fn(),
  },
  canonicalTeams: {
    findMany: jest.fn(),
  },
  teamRegistrations: {
    findFirst: jest.fn(),
  },
  signedDocuments: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
};

const requireSessionMock = jest.fn();
const canManageOrganizationMock = jest.fn();
const hasOrgPermissionMock = jest.fn();
const dispatchRequiredEventDocumentsMock = jest.fn();
const listOrganizationUsersScopeEventsMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/accessControl', () => ({
  canManageOrganization: canManageOrganizationMock,
  hasOrgPermission: hasOrgPermissionMock,
}));
jest.mock('@/server/organizationUsersAccess', () => ({
  listOrganizationUsersScopeEvents: listOrganizationUsersScopeEventsMock,
}));

import { POST } from '@/app/api/organizations/[id]/documents/route';

describe('POST /api/organizations/[id]/documents', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => Promise<unknown>) => callback(prismaMock));
    prismaMock.documentSubjects.upsert.mockResolvedValue({});
    requireSessionMock.mockResolvedValue({ userId: 'manager_1', isAdmin: false });
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_1', ownerId: 'owner_1' });
    canManageOrganizationMock.mockResolvedValue(false);
    hasOrgPermissionMock.mockReturnValue(true);
    prismaMock.templateDocuments.findUnique.mockResolvedValue({
      id: 'template_1',
      organizationId: 'org_1',
      title: 'Participant waiver',
      type: 'TEXT',
      requiredSignerType: 'PARTICIPANT',
    });
    prismaMock.events.findUnique.mockResolvedValue({ id: 'event_1', organizationId: 'org_1', fieldIds: [] });
    prismaMock.eventRegistrations.findFirst.mockResolvedValue({ id: 'registration_1' });
    prismaMock.teams.findMany.mockResolvedValue([]);
    listOrganizationUsersScopeEventsMock.mockResolvedValue([{ userIds: ['player_1'], teamIds: [] }]);
    prismaMock.signedDocuments.findFirst.mockResolvedValue(null);
    prismaMock.signedDocuments.create.mockResolvedValue({ signedDocumentId: 'text-document_1' });
  });

  it('creates a text document record for a registered player', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/organizations/org_1/documents', {
        method: 'POST',
        body: JSON.stringify({ userId: 'player_1', eventId: 'event_1', templateId: 'template_1' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'org_1' }) },
    );

    expect(response.status).toBe(201);
    expect(prismaMock.signedDocuments.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        templateId: 'template_1',
        userId: 'player_1',
        eventId: 'event_1',
        status: 'UNSIGNED',
      }),
    }));
  });
  it('creates a text document without an event for an organization customer', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/organizations/org_1/documents', {
        method: 'POST',
        body: JSON.stringify({ userId: 'player_1', eventId: null, templateId: 'template_1' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'org_1' }) },
    );

    expect(response.status).toBe(201);
    expect(prismaMock.signedDocuments.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: 'player_1',
        eventId: null,
        status: 'UNSIGNED',
      }),
    }));
  });

  it('rejects a document request for an unregistered player', async () => {
    prismaMock.eventRegistrations.findFirst.mockResolvedValue(null);

    const response = await POST(
      new NextRequest('http://localhost/api/organizations/org_1/documents', {
        method: 'POST',
        body: JSON.stringify({ userId: 'outsider_1', eventId: 'event_1', templateId: 'template_1' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'org_1' }) },
    );

    expect(response.status).toBe(404);
    expect(prismaMock.signedDocuments.create).not.toHaveBeenCalled();
  });
});
