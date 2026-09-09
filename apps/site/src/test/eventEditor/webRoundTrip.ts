import type { EventEditorDraft } from '@/contracts/eventEditor';
import { editorSnapshotToFormValues, emptyEditorSnapshot, eventFormValuesToEditorDraft } from '@/app/events/[id]/schedule/components/eventForm/editorContractAdapters';

export const webDraftRoundTrip = (draft: EventEditorDraft): EventEditorDraft => {
  const actual = eventFormValuesToEditorDraft(editorSnapshotToFormValues(emptyEditorSnapshot(draft)));
  // These optional null values have the same meaning as an absent value.
  if (actual.schedule.mode === 'GENERATED_END' && actual.basics.eventType === 'WEEKLY_EVENT') delete actual.schedule.generatedScheduleEnd;
  if (actual.competition.matchDurationMinutes === null) delete actual.competition.matchDurationMinutes;
  return actual;
};
