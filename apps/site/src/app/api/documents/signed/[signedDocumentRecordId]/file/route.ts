import { Readable } from 'stream';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { getStorageProvider } from '@/lib/storageProvider';
import { downloadSignedDocumentPdf, isBoldSignConfigured } from '@/lib/boldsignServer';
import {
  hasOrgPermission,
} from '@/server/accessControl';
import { ORG_PERMISSIONS } from '@/lib/organizationPermissions';
export const dynamic = 'force-dynamic';

const sanitizeFileName = (value: string): string => {
  const cleaned = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!cleaned) {
    return 'signed-document.pdf';
  }
  return cleaned.toLowerCase().endsWith('.pdf') ? cleaned : `${cleaned}.pdf`;
};

const readPdfPrefixAndCreateBody = async (
  stream: Readable,
): Promise<{ body: ReadableStream<Uint8Array> | null; isPdf: boolean }> => {
  const iterator = stream[Symbol.asyncIterator]();
  const prefixChunks: Buffer[] = [];
  let prefixLength = 0;
  while (prefixLength < 5) {
    const result = await iterator.next();
    if (result.done) break;
    const chunk = Buffer.isBuffer(result.value) ? result.value : Buffer.from(result.value);
    prefixChunks.push(chunk);
    prefixLength += chunk.length;
  }

  const prefix = Buffer.concat(prefixChunks, prefixLength).subarray(0, 5);
  if (prefix.toString('ascii') !== '%PDF-') {
    stream.destroy();
    return { body: null, isPdf: false };
  }

  const responseStream = Readable.from((async function* () {
    for (const chunk of prefixChunks) {
      yield chunk;
    }
    while (true) {
      const result = await iterator.next();
      if (result.done) return;
      yield Buffer.isBuffer(result.value) ? result.value : Buffer.from(result.value);
    }
  })());
  return {
    body: Readable.toWeb(responseStream) as ReadableStream<Uint8Array>,
    isPdf: true,
  };
};
const isMissingStorageObjectError = (error: unknown): boolean => {
  if (error instanceof Error && error.message === 'FILE_MISSING') {
    return true;
  }
  if (!error || typeof error !== 'object') {
    return false;
  }
  const message = 'message' in error && typeof error.message === 'string'
    ? error.message
    : null;
  const name = 'name' in error && typeof error.name === 'string'
    ? error.name
    : null;
  const code = 'code' in error && typeof error.code === 'string'
    ? error.code
    : null;
  const metadata = '$metadata' in error && error.$metadata && typeof error.$metadata === 'object'
    ? error.$metadata
    : null;
  const httpStatusCode = metadata
    && 'httpStatusCode' in metadata
    && typeof metadata.httpStatusCode === 'number'
    ? metadata.httpStatusCode
    : null;
  return message === 'FILE_MISSING'
    || name === 'NoSuchKey'
    || name === 'NotFound'
    || code === 'NoSuchKey'
    || code === 'NotFound'
    || httpStatusCode === 404;
};

const hasOrganizationStaffAccess = async (params: {
  sessionUserId: string;
  isAdmin: boolean;
  organizationId?: string | null;
}): Promise<boolean> => {
  if (params.isAdmin) {
    return true;
  }
  const organizationId = params.organizationId ?? null;
  if (!organizationId) {
    return false;
  }
  const organization = await prisma.organizations.findUnique({
    where: { id: organizationId },
    select: { id: true, ownerId: true },
  });
  if (!organization) {
    return false;
  }
  return hasOrgPermission(
    { userId: params.sessionUserId, isAdmin: params.isAdmin },
    organization,
    ORG_PERMISSIONS.DOCUMENTS_IMPORT,
  );
};
const hasImportedDocumentAccess = async (params: {
  sessionUserId: string;
  isAdmin: boolean;
  signedDocument: {
    userId: string | null;
    documentSubjectId: string | null;
    organizationId: string | null;
    eventId: string | null;
    teamId: string | null;
  };
}): Promise<boolean> => {
  if (params.isAdmin) {
    return true;
  }

  const subject = params.signedDocument.documentSubjectId
    ? await prisma.documentSubjects.findUnique({
      where: { id: params.signedDocument.documentSubjectId },
      select: { userId: true, organizationId: true },
    })
    : null;
  const subjectUserId = subject?.userId ?? params.signedDocument.userId;

  if (subjectUserId === params.sessionUserId) {
    return true;
  }

  if (subjectUserId) {
    const parentChildLink = await prisma.parentChildLinks.findFirst({
      where: {
        parentId: params.sessionUserId,
        childId: subjectUserId,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    if (parentChildLink) {
      return true;
    }
  }

  return hasOrganizationStaffAccess({
    sessionUserId: params.sessionUserId,
    isAdmin: params.isAdmin,
    organizationId: subject?.organizationId ?? params.signedDocument.organizationId,
  });
};

const hasOrganizationDocumentAccess = async (params: {
  sessionUserId: string;
  isAdmin: boolean;
  organizationId?: string | null;
  eventId?: string | null;
  teamId?: string | null;
}): Promise<boolean> => {
  if (params.isAdmin) {
    return true;
  }

  let organizationId = params.organizationId ?? null;
  let eventId = params.eventId ?? null;
  let teamId = params.teamId ?? null;

  if (!organizationId && eventId) {
    const event = await prisma.events.findUnique({
      where: { id: eventId },
      select: { organizationId: true },
    });
    if (!event) {
      return false;
    }
    organizationId = event.organizationId;
    const registration = await prisma.eventRegistrations.findFirst({
      where: {
        eventId,
        registrantId: params.sessionUserId,
        status: { in: ['STARTED', 'PENDING', 'ACTIVE', 'BLOCKED'] },
      },
      select: { id: true },
    });
    if (registration) {
      return true;
    }
  }

  if (!organizationId && teamId) {
    const team = await prisma.canonicalTeams.findUnique({
      where: { id: teamId },
      select: { organizationId: true },
    });
    if (!team) {
      return false;
    }
    organizationId = team.organizationId;
  }

  if (await hasOrganizationStaffAccess({
    sessionUserId: params.sessionUserId,
    isAdmin: params.isAdmin,
    organizationId,
  })) {
    return true;
  }

  if (eventId) {
    const registration = await prisma.eventRegistrations.findFirst({
      where: {
        eventId,
        OR: [
          { registrantId: params.sessionUserId },
          { createdBy: params.sessionUserId },
        ],
      },
      select: { id: true },
    });
    if (registration) {
      return true;
    }
  }

  if (teamId) {
    const registration = await prisma.teamRegistrations.findFirst({
      where: {
        teamId,
        status: { in: ['STARTED', 'PENDING', 'ACTIVE'] },
        OR: [
          { userId: params.sessionUserId },
          { parentId: params.sessionUserId },
          { createdBy: params.sessionUserId },
        ],
      },
      select: { id: true },
    });
    if (registration) {
      return true;
    }

    const staffAssignment = await prisma.teamStaffAssignments.findFirst({
      where: {
        teamId,
        userId: params.sessionUserId,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    if (staffAssignment) {
      return true;
    }
  }

  return false;
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ signedDocumentRecordId: string }> },
) {
  const session = await requireSession(req);
  const { signedDocumentRecordId } = await params;

  const signedDocument = await prisma.signedDocuments.findUnique({
    where: { id: signedDocumentRecordId },
    select: {
      id: true,
      signedDocumentId: true,
      provenance: true,
      templateId: true,
      userId: true,
      documentSubjectId: true,
      importedFileId: true,
      documentName: true,
      organizationId: true,
      eventId: true,
      teamId: true,
    },
  });
  if (!signedDocument) {
    return NextResponse.json({ error: 'Signed document not found.' }, { status: 404 });
  }

  const canAccess = signedDocument.provenance === 'IMPORTED'
    ? await hasImportedDocumentAccess({
      sessionUserId: session.userId,
      isAdmin: session.isAdmin,
      signedDocument,
    })
    : session.isAdmin || session.userId === signedDocument.userId || await hasOrganizationDocumentAccess({
      sessionUserId: session.userId,
      isAdmin: session.isAdmin,
      organizationId: signedDocument.organizationId,
      eventId: signedDocument.eventId,
      teamId: signedDocument.teamId,
    });
  if (!canAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (signedDocument.provenance === 'IMPORTED') {
    if (!signedDocument.importedFileId) {
      return NextResponse.json({ error: 'Imported document file not found.' }, { status: 404 });
    }

    const storedFile = await prisma.file.findUnique({
      where: { id: signedDocument.importedFileId },
      select: {
        id: true,
        organizationId: true,
        bucket: true,
        originalName: true,
        mimeType: true,
        path: true,
      },
    });
    if (!storedFile || (
      signedDocument.organizationId
      && storedFile.organizationId
      && storedFile.organizationId !== signedDocument.organizationId
    )) {
      return NextResponse.json({ error: 'Imported document file not found.' }, { status: 404 });
    }
    if (storedFile.mimeType?.trim().toLowerCase() !== 'application/pdf') {
      return NextResponse.json(
        { error: 'Imported document file is not a PDF.' },
        { status: 415 },
      );
    }

    let streamResult;
    try {
      streamResult = await getStorageProvider().getObjectStream({
        key: storedFile.path,
        bucket: storedFile.bucket,
      });
    } catch (error: unknown) {
      if (isMissingStorageObjectError(error)) {
        return NextResponse.json({ error: 'Imported document file not found.' }, { status: 404 });
      }
      throw error;
    }
    const streamedPdf = await readPdfPrefixAndCreateBody(streamResult.stream);
    if (!streamedPdf.isPdf || !streamedPdf.body) {
      return NextResponse.json(
        { error: 'Imported document file is not a PDF.' },
        { status: 415 },
      );
    }
    const fileName = sanitizeFileName(storedFile.originalName || signedDocument.documentName || 'signed-document');
    const headers: Record<string, string> = {
      'Content-Type': 'application/pdf',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `inline; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    };
    if (typeof streamResult.sizeBytes === 'number') {
      headers['Content-Length'] = streamResult.sizeBytes.toString();
    }

    return new NextResponse(streamedPdf.body, {
      status: 200,
      headers,
    });
  }

  const template = await prisma.templateDocuments.findUnique({
    where: { id: signedDocument.templateId },
    select: { type: true, title: true },
  });
  if (template?.type === 'TEXT') {
    return NextResponse.json(
      { error: 'This signed record is a TEXT waiver and does not have a PDF file.' },
      { status: 400 },
    );
  }

  if (!isBoldSignConfigured()) {
    return NextResponse.json(
      { error: 'BoldSign is not configured on the server. Set BOLDSIGN_API_KEY.' },
      { status: 503 },
    );
  }

  const file = await downloadSignedDocumentPdf({
    documentId: signedDocument.signedDocumentId,
  });
  const fileName = sanitizeFileName(template?.title || signedDocument.documentName || 'signed-document');

  return new NextResponse(new Uint8Array(file.data), {
    status: 200,
    headers: {
      'Content-Type': file.contentType || 'application/pdf',
      'Content-Disposition': `inline; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  });
}

