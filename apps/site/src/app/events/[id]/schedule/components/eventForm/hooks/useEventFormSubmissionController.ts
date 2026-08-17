import { useCallback, useImperativeHandle, useRef } from "react";
import type { ForwardedRef, MutableRefObject, SetStateAction } from "react";
import type { UseFormGetValues, UseFormTrigger } from "react-hook-form";

import type { EventStaffSnapshot } from "@/lib/eventStaffService";
import type { Event, RegistrationQuestionDraft } from "@/types";
import { buildEventDraft } from "../buildEventDraft";
import type { EventFormValues } from "../formTypes";
import { eventFormValuesToEditorDraft } from "../editorContractAdapters";
import { supportsScheduleSlotsForEvent } from "../eventRules";
import type { CapturedEventConfiguration, EventFormHandle } from "../types";
import { buildRegistrationQuestionValidationIssues } from "../schema";
import type { buildEventFormSchema } from "../schema";
import {
  normalizePendingStaffInvite,
  type PendingStaffInvite,
} from "../staffInvites";
import {
  dedupeValidationErrors,
  flattenZodIssues,
  type FlattenedFormError,
} from "../validationErrors";

type BuildEventDraftInput = Parameters<typeof buildEventDraft>[0];
type EventDraftContext = Omit<
  BuildEventDraftInput,
  "previousEventFieldLocation" | "source"
>;
type EventFormStateSetter<T> = (
  updater: SetStateAction<T>,
  options?: Record<string, unknown>,
) => void;

type UseEventFormSubmissionControllerParams = EventDraftContext & {
  assignedActiveOfficialsForStaffing: number;
  commitDirtyBaseline: () => void;
  eventData: EventFormValues;
  eventValidationSchema: ReturnType<typeof buildEventFormSchema>;
  formRef: ForwardedRef<EventFormHandle>;
  getValues: UseFormGetValues<EventFormValues>;
  isAffiliateEvent: boolean;
  officialStaffingCoverageError: string | null;
  previousEventFieldLocationRef: MutableRefObject<string>;
  registrationQuestionDrafts: RegistrationQuestionDraft[];
  requiredOfficialSlotsPerMatch: number;
  setEventData: EventFormStateSetter<EventFormValues>;
  trigger: UseFormTrigger<EventFormValues>;
  validatePendingStaffAssignments: (
    pendingInvites: PendingStaffInvite[],
  ) => Promise<void>;
  onValidationResult?: (
    errors: FlattenedFormError[],
    source: "FORM" | "EXTERNAL" | "CLEAR",
  ) => void;
};

export const useEventFormSubmissionController = ({
  activeEditingEvent,
  assignedActiveOfficialsForStaffing,
  commitDirtyBaseline,
  currentUser,
  eventData,
  eventValidationSchema,
  fieldCount,
  fields,
  fieldsReferencedInSlots,
  formRef,
  getValues,
  hasImmutableTimeSlots,
  hasRestrictedImmutableFields,
  hasStripeAccount,
  immutableFields,
  immutableTimeSlots,
  isAffiliateEvent,
  isEditMode,
  isOrganizationHostedEvent,
  isOrganizationManagedEvent,
  joinAsParticipant,
  officialStaffingCoverageError,
  organizationHostedEventId,
  organizationOfficialsById,
  previousEventFieldLocationRef,
  registrationQuestionDrafts,
  rentalLockedSlotsForDraft,
  rentalPurchase,
  requiredOfficialSlotsPerMatch,
  resolvedOrganization,
  selectedRentedFieldIds,
  setEventData,
  shouldManageLocalFields,
  shouldProvisionFields,
  sportsById,
  trigger,
  validatePendingStaffAssignments,
  onValidationResult,
}: UseEventFormSubmissionControllerParams) => {
  const lastValidationErrorsRef = useRef<FlattenedFormError[]>([]);
  const setLastValidationErrors = useCallback(
    (validationErrors: FlattenedFormError[]) => {
      lastValidationErrorsRef.current = validationErrors;
    },
    [],
  );
  const buildDraftEvent = useCallback(
    (formValues?: EventFormValues): Partial<Event> =>
      buildEventDraft({
        activeEditingEvent,
        currentUser,
        fieldCount,
        fields,
        fieldsReferencedInSlots,
        hasImmutableTimeSlots,
        hasRestrictedImmutableFields,
        hasStripeAccount,
        immutableFields,
        immutableTimeSlots,
        isEditMode,
        isOrganizationHostedEvent,
        isOrganizationManagedEvent,
        joinAsParticipant,
        organizationHostedEventId,
        organizationOfficialsById,
        previousEventFieldLocation: previousEventFieldLocationRef.current,
        rentalLockedSlotsForDraft,
        rentalPurchase,
        resolvedOrganization,
        selectedRentedFieldIds,
        shouldManageLocalFields,
        shouldProvisionFields,
        source: formValues ?? eventData,
        sportsById,
      }),
    [
      activeEditingEvent,
      currentUser,
      eventData,
      fieldCount,
      fields,
      fieldsReferencedInSlots,
      hasImmutableTimeSlots,
      hasRestrictedImmutableFields,
      hasStripeAccount,
      immutableFields,
      immutableTimeSlots,
      isEditMode,
      isOrganizationHostedEvent,
      isOrganizationManagedEvent,
      joinAsParticipant,
      organizationHostedEventId,
      organizationOfficialsById,
      previousEventFieldLocationRef,
      rentalLockedSlotsForDraft,
      rentalPurchase,
      resolvedOrganization,
      selectedRentedFieldIds,
      shouldManageLocalFields,
      shouldProvisionFields,
      sportsById,
    ],
  );

  const getRegistrationQuestionDrafts =
    useCallback((): RegistrationQuestionDraft[] => {
      if (isAffiliateEvent) {
        return [];
      }

      return registrationQuestionDrafts
        .map((question, index) => ({
          ...(typeof question.id === "string" && question.id.trim()
            ? { id: question.id.trim() }
            : typeof question.clientId === "string" && question.clientId.trim()
              ? { clientId: question.clientId.trim() }
              : { clientId: `question-client-${index + 1}` }),
          prompt: String(question.prompt ?? "").trim(),
          answerType: question.answerType ?? "TEXT",
          required: Boolean(question.required),
          sortOrder: Number.isFinite(Number(question.sortOrder))
            ? Number(question.sortOrder)
            : index,
        }))
        .filter((question) => question.prompt.length > 0);
    }, [isAffiliateEvent, registrationQuestionDrafts]);

  const captureCurrentEventConfiguration =
    useCallback((): CapturedEventConfiguration => {
      const currentValues = getValues();
      const schemaResult = eventValidationSchema.safeParse(currentValues);
      const registrationQuestions = getRegistrationQuestionDrafts();
      const registrationQuestionValidationDrafts = isAffiliateEvent
        ? []
        : registrationQuestionDrafts;
      const validationErrors = dedupeValidationErrors([
        ...(schemaResult.success
          ? []
          : flattenZodIssues(schemaResult.error.issues)),
        ...flattenZodIssues(
          buildRegistrationQuestionValidationIssues(
            registrationQuestionValidationDrafts,
          ),
        ),
        ...(!isAffiliateEvent && officialStaffingCoverageError
          ? [
              {
                path: "officialSchedulingMode",
                message: officialStaffingCoverageError,
              },
            ]
          : []),
      ]);
      const eventConfiguration = buildDraftEvent(currentValues);
      return {
        eventType: schemaResult.success ? schemaResult.data.eventType : null,
        draft: eventFormValuesToEditorDraft(
          eventConfiguration as EventFormValues,
          registrationQuestions,
        ),
        validationErrors,
      };
    }, [
      buildDraftEvent,
      eventValidationSchema,
      getRegistrationQuestionDrafts,
      registrationQuestionDrafts,
      getValues,
      isAffiliateEvent,
      officialStaffingCoverageError,
    ]);

  const validateDraft = useCallback(
    async (
      capturedConfiguration: CapturedEventConfiguration = captureCurrentEventConfiguration(),
    ) => {
      // Keep React Hook Form's visible error state current, but decide from
      // the configuration captured before this asynchronous validation starts.
      await trigger();
      const flattenedErrors = capturedConfiguration.validationErrors;
      if (flattenedErrors.length > 0) {
        lastValidationErrorsRef.current = flattenedErrors;
        const hasStaffingCoverageError = flattenedErrors.some(
          (error) =>
            error.path === "officialSchedulingMode" &&
            error.message === officialStaffingCoverageError,
        );
        onValidationResult?.(
          flattenedErrors,
          hasStaffingCoverageError ? "EXTERNAL" : "FORM",
        );
        if (hasStaffingCoverageError) {
          console.warn(
            "Event form submission blocked by official staffing requirements.",
            {
              requiredOfficialSlotsPerMatch,
              assignedActiveOfficialsForStaffing,
              mode: capturedConfiguration.draft.staff.officialSchedulingMode,
            },
          );
        } else {
          console.warn("Event form validation failed.", {
            errorCount: flattenedErrors.length,
            errors: flattenedErrors,
          });
        }
        return false;
      }

      if (
        !capturedConfiguration.eventType ||
        !supportsScheduleSlotsForEvent(
          capturedConfiguration.eventType,
          capturedConfiguration.draft.basics.parentEvent,
        )
      ) {
        lastValidationErrorsRef.current = [];
        onValidationResult?.([], "CLEAR");
        return true;
      }

      lastValidationErrorsRef.current = [];
      onValidationResult?.([], "CLEAR");
      return true;
    },
    [
      assignedActiveOfficialsForStaffing,
      captureCurrentEventConfiguration,
      officialStaffingCoverageError,
      onValidationResult,
      requiredOfficialSlotsPerMatch,
      trigger,
    ],
  );
  const validatePendingStaffAssignmentsForSubmit = useCallback(
    async (
      capturedConfiguration: CapturedEventConfiguration = captureCurrentEventConfiguration(),
    ) => {
      if (isAffiliateEvent) {
        return;
      }
      const pendingInvites =
        capturedConfiguration.draft.staff.pendingInvites.map((invite) =>
          normalizePendingStaffInvite(invite),
        );
      await validatePendingStaffAssignments(pendingInvites);
    },
    [
      captureCurrentEventConfiguration,
      isAffiliateEvent,
      validatePendingStaffAssignments,
    ],
  );

  const applyCanonicalStaffState = useCallback(
    (snapshot: EventStaffSnapshot) => {
      setEventData(
        (previous: EventFormValues) => ({
          ...previous,
          assistantHostIds: [...snapshot.assistantHostIds],
          officialPositions: snapshot.officialPositions.map((position) => ({
            ...position,
          })),
          eventOfficials: snapshot.eventOfficials.map((official) => ({
            ...official,
            positionIds: [...official.positionIds],
            fieldIds: [...official.fieldIds],
          })),
          officialIds: [...snapshot.officialIds],
          pendingStaffInvites: [],
        }),
        { shouldDirty: false, shouldValidate: true },
      );
    },
    [setEventData],
  );

  useImperativeHandle(
    formRef,
    () => ({
      captureCurrentEventConfiguration,
      getRegistrationQuestionDrafts,
      validate: validateDraft,
      getValidationErrors: () => lastValidationErrorsRef.current,
      validatePendingStaffAssignments: validatePendingStaffAssignmentsForSubmit,
      commitDirtyBaseline,
      applyCanonicalStaffState,
    }),
    [
      applyCanonicalStaffState,
      captureCurrentEventConfiguration,
      commitDirtyBaseline,
      getRegistrationQuestionDrafts,
      validateDraft,
      validatePendingStaffAssignmentsForSubmit,
    ],
  );

  return { buildDraftEvent, setLastValidationErrors };
};
