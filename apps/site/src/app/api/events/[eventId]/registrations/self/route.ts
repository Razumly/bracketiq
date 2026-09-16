import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/permissions";
import {
  resolveEventDivisionSelection,
  validateRegistrantAgeForSelection,
} from "@/app/api/events/[eventId]/registrationDivisionUtils";
import {
  findEventRegistration,
  upsertEventRegistration,
  acquireEventLockAndLoadStructure,
} from "@/server/events/eventRegistrations";
import { eventRegistrationErrorResponse } from "@/server/events/eventRegistrationErrorResponse";
import {
  isActiveWeeklyParentEvent,
  isArchivedWeeklyParentEvent,
  isWeeklyOccurrenceJoinClosed,
  resolveWeeklyOccurrence,
  WEEKLY_EVENT_ARCHIVED_ERROR,
  WEEKLY_OCCURRENCE_JOIN_CLOSED_ERROR,
} from "@/server/events/weeklyOccurrences";
import { dispatchRequiredEventDocuments } from "@/lib/eventConsentDispatch";
import {
  documentSatisfactionScopeFor,
  documentSubjectIdFor,
  findSatisfiedDocumentTemplateIds,
} from "@/server/documentEvidence";
import { normalizeRequiredSignerType } from "@/lib/templateSignerTypes";
import {
  loadAndBuildRegistrationAnswerSnapshot,
  upsertRegistrationQuestionResponse,
} from "@/server/registrationQuestions";
import { requireVerifiedEmailForEventRegistrationIfPaid } from "@/server/paidRegistrationGate";
import { sendEventRegistrationHostNotification } from "@/server/registrationHostNotifications";

export const dynamic = "force-dynamic";

const schema = z
  .object({
    divisionId: z.string().optional(),
    divisionTypeId: z.string().optional(),
    divisionTypeKey: z.string().optional(),
    slotId: z.string().optional(),
    occurrenceDate: z.string().optional(),
  })
  .passthrough();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { eventId } = await params;
  const event = await prisma.events.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      start: true,
      end: true,
      archivedAt: true,
      minAge: true,
      maxAge: true,
      sportIds: true,
      registrationByDivisionType: true,
      requiredTemplateIds: true,
      organizationId: true,
      price: true,
      eventType: true,
      teamSignup: true,
      includePlayoffs: true,
      parentEvent: true,
      timeSlotIds: true,
    },
  });
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  if (isArchivedWeeklyParentEvent(event)) {
    return NextResponse.json(
      { error: WEEKLY_EVENT_ARCHIVED_ERROR },
      { status: 409 },
    );
  }

  const hasOccurrenceInput = Boolean(
    parsed.data.slotId || parsed.data.occurrenceDate,
  );
  const occurrence = isActiveWeeklyParentEvent(event)
    ? await resolveWeeklyOccurrence({
        event,
        occurrence: parsed.data,
      })
    : null;
  if (occurrence && !occurrence.ok) {
    return NextResponse.json({ error: occurrence.error }, { status: 400 });
  }
  if (!isActiveWeeklyParentEvent(event) && hasOccurrenceInput) {
    return NextResponse.json(
      { error: "Weekly occurrence selection is only valid for weekly events." },
      { status: 400 },
    );
  }
  const resolvedOccurrence = occurrence?.ok ? occurrence.value : null;
  if (resolvedOccurrence && isWeeklyOccurrenceJoinClosed(resolvedOccurrence)) {
    return NextResponse.json(
      { error: WEEKLY_OCCURRENCE_JOIN_CLOSED_ERROR },
      { status: 409 },
    );
  }

  const user = await prisma.userData.findUnique({
    where: { id: session.userId },
    select: { dateOfBirth: true },
  });
  if (!user) {
    return NextResponse.json(
      { error: "User profile not found" },
      { status: 404 },
    );
  }

  const divisionSelection = await resolveEventDivisionSelection({
    event,
    input: parsed.data,
  });
  if (!divisionSelection.ok) {
    return NextResponse.json(
      { error: divisionSelection.error ?? "Invalid division selection" },
      { status: 400 },
    );
  }
  const emailVerificationRequired =
    await requireVerifiedEmailForEventRegistrationIfPaid({
      userId: session.userId,
      event,
      selection: divisionSelection.selection,
    });
  if (emailVerificationRequired) {
    return emailVerificationRequired;
  }
  const eventAnswersSnapshot = await loadAndBuildRegistrationAnswerSnapshot({
    scopeType: "EVENT",
    scopeId: eventId,
    answers: parsed.data.answers,
  });

  const ageCheck = validateRegistrantAgeForSelection({
    dateOfBirth: user.dateOfBirth,
    event,
    selection: divisionSelection.selection,
  });
  if (ageCheck.error === "Invalid date of birth") {
    return NextResponse.json({ error: ageCheck.error }, { status: 400 });
  }
  if (ageCheck.error) {
    return NextResponse.json({ error: ageCheck.error }, { status: 403 });
  }
  const ageAtEvent = ageCheck.ageAtEvent;

  // Minors can request to join, but a linked parent/guardian must approve.
  if (ageAtEvent < 18) {
    const parentLink = await prisma.parentChildLinks.findFirst({
      where: {
        childId: session.userId,
        status: "ACTIVE",
      },
      orderBy: {
        updatedAt: "desc",
      },
      select: {
        parentId: true,
      },
    });
    if (!parentLink?.parentId) {
      return NextResponse.json(
        {
          error:
            "No linked parent/guardian found. Ask a parent to add you first.",
        },
        { status: 403 },
      );
    }
    let childResult: {
      registration: Awaited<ReturnType<typeof upsertEventRegistration>>;
      existing: boolean;
    };
    try {
      childResult = await prisma.$transaction(async (tx) => {
        await acquireEventLockAndLoadStructure(tx, eventId, {
          eventType: event.eventType,
          teamSignup: event.teamSignup,
        });
        const existingRequest = await findEventRegistration(
          {
            eventId,
            registrantType: "CHILD",
            registrantId: session.userId,
            occurrence: resolvedOccurrence,
          },
          tx,
        );
        if (existingRequest) {
          return { registration: existingRequest, existing: true };
        }

        const registration = await upsertEventRegistration(
          {
            eventId,
            registrantType: "CHILD",
            registrantId: session.userId,
            parentId: parentLink.parentId,
            rosterRole: "PARTICIPANT",
            status: "STARTED",
            ageAtEvent,
            divisionId: divisionSelection.selection.divisionId,
            divisionTypeId: divisionSelection.selection.divisionTypeId,
            divisionTypeKey: divisionSelection.selection.divisionTypeKey,
            consentStatus: "guardian_approval_required",
            createdBy: session.userId,
            occurrence: resolvedOccurrence,
          },
          tx,
        );
        if (eventAnswersSnapshot.length) {
          await upsertRegistrationQuestionResponse({
            scopeType: "EVENT",
            scopeId: eventId,
            subjectType: "EVENT_REGISTRATION",
            subjectId: registration.id,
            responderUserId: session.userId,
            registrantUserId: session.userId,
            registrantType: "CHILD",
            answersSnapshot: eventAnswersSnapshot,
            client: tx,
          });
        }
        return { registration, existing: false };
      });
    } catch (error) {
      const registrationResponse = eventRegistrationErrorResponse(error);
      if (registrationResponse) return registrationResponse;
      throw error;
    }

    if (childResult.existing) {
      return NextResponse.json(
        {
          registration: childResult.registration,
          requiresParentApproval: true,
          consent: {
            status:
              childResult.registration.consentStatus ??
              "guardian_approval_required",
            parentId: parentLink.parentId,
          },
        },
        { status: 200 },
      );
    }

    const registration = childResult.registration;

    return NextResponse.json(
      {
        registration: registration,
        requiresParentApproval: true,
        consent: {
          status: "guardian_approval_required",
          parentId: parentLink.parentId,
        },
      },
      { status: 200 },
    );
  }

  const requiredTemplateIds = Array.isArray(event.requiredTemplateIds)
    ? event.requiredTemplateIds.filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      )
    : [];
  let participantRequiredTemplateIds = requiredTemplateIds;
  let participantTemplates: Array<{
    id: string;
    requiredSignerType: string | null;
    signOnce: boolean | null;
  }> = [];
  if (requiredTemplateIds.length > 0) {
    const templates = await prisma.templateDocuments.findMany({
      where: { id: { in: requiredTemplateIds } },
      select: {
        id: true,
        requiredSignerType: true,
        signOnce: true,
      },
    });
    const templateById = new Map(
      templates.map((template) => [template.id, template]),
    );
    participantRequiredTemplateIds = requiredTemplateIds.filter(
      (templateId) => {
        const template = templateById.get(templateId);
        if (!template) {
          return false;
        }
        return (
          normalizeRequiredSignerType(template.requiredSignerType) ===
          "PARTICIPANT"
        );
      },
    );
    participantTemplates = participantRequiredTemplateIds
      .map((templateId) => templateById.get(templateId))
      .filter(
        (template): template is NonNullable<typeof template> =>
          template !== undefined,
      );
  }

  let hasAllParticipantSignatures = false;
  if (participantRequiredTemplateIds.length > 0) {
    const documentSubjectId = documentSubjectIdFor(event.organizationId, session.userId);
    const satisfactionScopes = participantTemplates.flatMap((template) => {
      const scope = documentSatisfactionScopeFor({
        organizationId: event.organizationId,
        documentSubjectUserId: session.userId,
        eventId,
        teamId: null,
        signOnce: template.signOnce === true,
        templateDocumentId: template.id,
      });
      return scope ? [scope] : [];
    });
    const satisfiedTemplateIds = await findSatisfiedDocumentTemplateIds({
      documentSubjectId,
      scopes: satisfactionScopes,
    });
    hasAllParticipantSignatures = participantRequiredTemplateIds.every(
      (templateId) => satisfiedTemplateIds.has(templateId),
    );
  }

  const legacyNeedsConsent =
    participantRequiredTemplateIds.length > 0 && !hasAllParticipantSignatures;
  const consentDispatch = legacyNeedsConsent
    ? await dispatchRequiredEventDocuments({
        eventId,
        organizationId: event.organizationId ?? null,
        requiredTemplateIds: participantRequiredTemplateIds,
        participantUserId: session.userId,
      })
    : null;
  const needsConsent = legacyNeedsConsent
    && consentDispatch?.isAllRequiredTemplatesSatisfied !== true;
  const consentStatus =
    participantRequiredTemplateIds.length === 0
      ? null
      : !needsConsent
        ? "completed"
        : (consentDispatch?.errors.length ?? 0) > 0
          ? "send_failed"
          : "sent";

  let selfResult: {
    registration: Awaited<ReturnType<typeof upsertEventRegistration>>;
    wasActive: boolean;
  };
  try {
    selfResult = await prisma.$transaction(async (tx) => {
      await acquireEventLockAndLoadStructure(tx, eventId, {
        eventType: event.eventType,
        teamSignup: event.teamSignup,
      });
      const existingRegistration = await findEventRegistration(
        {
          eventId,
          registrantType: "SELF",
          registrantId: session.userId,
          occurrence: resolvedOccurrence,
        },
        tx,
      );
      const nextStatus = needsConsent ? "STARTED" : "ACTIVE";
      const nextConsentDocumentId = needsConsent
        ? (consentDispatch?.firstDocumentId ??
          existingRegistration?.consentDocumentId ??
          null)
        : (existingRegistration?.consentDocumentId ?? null);
      const nextConsentStatus =
        consentStatus ?? existingRegistration?.consentStatus ?? null;
      const registration = await upsertEventRegistration(
        {
          eventId,
          registrantType: "SELF",
          registrantId: session.userId,
          rosterRole: "PARTICIPANT",
          status: nextStatus,
          ageAtEvent,
          divisionId: divisionSelection.selection.divisionId,
          divisionTypeId: divisionSelection.selection.divisionTypeId,
          divisionTypeKey: divisionSelection.selection.divisionTypeKey,
          consentDocumentId: nextConsentDocumentId,
          consentStatus: nextConsentStatus,
          createdBy: session.userId,
          occurrence: resolvedOccurrence,
        },
        tx,
      );
      if (eventAnswersSnapshot.length) {
        await upsertRegistrationQuestionResponse({
          scopeType: "EVENT",
          scopeId: eventId,
          subjectType: "EVENT_REGISTRATION",
          subjectId: registration.id,
          responderUserId: session.userId,
          registrantUserId: session.userId,
          registrantType: "SELF",
          answersSnapshot: eventAnswersSnapshot,
          client: tx,
        });
      }
      await tx.invites?.deleteMany?.({
        where: {
          type: "EVENT",
          eventId,
          userId: session.userId,
        },
      });
      return {
        registration,
        wasActive: existingRegistration?.status === "ACTIVE",
      };
    });
  } catch (error) {
    const registrationResponse = eventRegistrationErrorResponse(error);
    if (registrationResponse) return registrationResponse;
    throw error;
  }

  const registration = selfResult.registration;
  if (registration.status === "ACTIVE" && !selfResult.wasActive) {
    await sendEventRegistrationHostNotification({
      eventId,
      registrationId: registration.id,
    });
  }

  return NextResponse.json(
    {
      registration,
      warnings: consentDispatch?.errors.length
        ? consentDispatch.errors
        : undefined,
    },
    { status: 200 },
  );
}
