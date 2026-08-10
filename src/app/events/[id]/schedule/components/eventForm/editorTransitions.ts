import type { EventEditorDraft } from '@/contracts/eventEditor';

export type EditorTransitionResult = {
  draft: EventEditorDraft;
  warnings: string[];
  confirmationFields: string[];
};

const result = (
  draft: EventEditorDraft,
  warnings: string[] = [],
  confirmationFields: string[] = [],
): EditorTransitionResult => ({ draft, warnings, confirmationFields });

const withCompetition = (
  draft: EventEditorDraft,
  competition: Partial<EventEditorDraft['competition']>,
): EventEditorDraft => ({
  ...draft,
  competition: { ...draft.competition, ...competition },
});

/** Change the event type without rehydrating or clearing unrelated draft values. */
export const changeEventType = (
  draft: EventEditorDraft,
  eventType: string,
): EditorTransitionResult => result({
  ...draft,
  basics: { ...draft.basics, eventType: eventType.trim() || draft.basics.eventType },
});

/** Select a sport while preserving every event-owned setting. */
export const changeSport = (
  draft: EventEditorDraft,
  sportIds: string[],
): EditorTransitionResult => result({
  ...draft,
  basics: { ...draft.basics, sportIds: [...sportIds] },
});

/** Switch the explicit schedule mode. Clearing an end constraint is intentional. */
export const changeScheduleMode = (
  draft: EventEditorDraft,
  mode: 'FIXED_END' | 'GENERATED_END',
  endConstraint?: string | null,
): EditorTransitionResult => {
  if (mode === 'FIXED_END') {
    const candidateEnd = endConstraint ?? (
      draft.schedule.mode === 'FIXED_END'
        ? draft.schedule.endConstraint
        : draft.schedule.generatedScheduleEnd
    );
    const nextEnd = candidateEnd instanceof Date ? candidateEnd.toISOString() : candidateEnd;
    if (!nextEnd) {
      return result(draft, ['A fixed end date/time is required before switching to fixed-end scheduling.'], ['schedule.endConstraint']);
    }
    return result({
      ...draft,
      schedule: { mode, endConstraint: nextEnd },
    });
  }

  return result({
    ...draft,
    schedule: {
      mode,
      endConstraint: null,
      generatedScheduleEnd: draft.schedule.mode === 'GENERATED_END'
        ? draft.schedule.generatedScheduleEnd
        : null,
    },
  });
};

/** Change payment mode; prices and payment policy are never inferred from capability loading. */
export const changeRegistrationPaymentMode = (
  draft: EventEditorDraft,
  mode: 'FREE' | 'ONLINE' | 'MANUAL',
): EditorTransitionResult => result({
  ...draft,
  registration: {
    ...draft.registration,
    payment: { ...draft.registration.payment, mode },
  },
});

/** Explicitly disable registration questions and report the destructive field. */
export const disableRegistrationQuestions = (
  draft: EventEditorDraft,
): EditorTransitionResult => {
  if (draft.registration.questions.length === 0) return result(draft);
  return result({
    ...draft,
    registration: { ...draft.registration, questions: [] },
  }, ['Registration questions will be removed from the active editor.'], ['registration.questions']);
};

/** Change single/multiple division presentation without fabricating a division. */
export const changeDivisionMode = (
  draft: EventEditorDraft,
  singleDivision: boolean,
): EditorTransitionResult => result({
  ...draft,
  participation: { ...draft.participation, singleDivision },
});

/** Toggle pool play on one league phase while preserving playoff phase settings. */
export const changePoolPlay = (
  draft: EventEditorDraft,
  divisionId: string,
  enabled: boolean,
): EditorTransitionResult => {
  const normalizedId = divisionId.trim();
  if (!normalizedId) return result(draft);
  const update = (division: EventEditorDraft['competition']['divisionDetails'][number]) => (
    division.id === normalizedId
      ? {
        ...division,
        poolPlay: enabled,
        phaseSettings: {
          ...(division.phaseSettings ?? {}),
          poolPlay: enabled,
        },
      }
      : division
  );
  return result(withCompetition(draft, {
    divisionDetails: draft.competition.divisionDetails.map(update),
  }));
};

/** Select the single canonical officiating mode; compatibility projections are derived later. */
export const changeOfficialSchedulingMode = (
  draft: EventEditorDraft,
  mode: 'SCHEDULE' | 'STAFFING' | 'TEAM_STAFFING',
): EditorTransitionResult => result({
  ...draft,
  staff: { ...draft.staff, officialSchedulingMode: mode },
});
