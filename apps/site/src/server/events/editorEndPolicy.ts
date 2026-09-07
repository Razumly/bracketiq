import type {
  EventEditorDraft,
  EventEditorSnapshot,
} from "@/contracts/eventEditor";
import { parseDateTimeInTimeZone } from "@/lib/dateUtils";

type Schedule = EventEditorDraft["schedule"];

const plannedEndError = (draft: EventEditorDraft): string | null => {
  if (draft.schedule.mode !== "FIXED_END") return null;
  const start = parseDateTimeInTimeZone(
    draft.basics.start,
    draft.basics.timeZone,
  );
  const end = parseDateTimeInTimeZone(
    draft.schedule.endConstraint,
    draft.basics.timeZone,
  );
  return start && end && end > start
    ? null
    : "Planned End must be after the Event start.";
};

export const editorEndPolicyError = (
  draft: EventEditorDraft,
  baseline: EventEditorSnapshot | null,
): string | null => {
  if (draft.schedule.mode === "FIXED_END") {
    return plannedEndError(draft);
  }
  const type = draft.basics.eventType.trim().toUpperCase();
  if (type === "WEEKLY_EVENT" && !draft.basics.parentEvent) return null;
  if (!["LEAGUE", "TOURNAMENT"].includes(type))
    return "This Event Type requires a Planned End.";
  const retained = baseline?.draft.schedule?.mode === "GENERATED_END";
  if (draft.schedule.isAutomatedScheduling === false && !retained) {
    return "Set End From Schedule requires Automated Scheduling.";
  }
  return null;
};

/** Settings saves retain the accepted end. Schedule operations own generated end changes. */
export const retainedEditorSchedule = (
  schedule: Schedule,
  baseline: EventEditorSnapshot | null,
): Schedule => {
  if (!baseline || schedule.mode !== "GENERATED_END") return schedule;
  if (baseline.draft.basics.eventType === "WEEKLY_EVENT") return schedule;
  const previous = baseline.draft.schedule;
  const end =
    previous?.mode === "FIXED_END"
      ? previous.endConstraint
      : previous?.generatedScheduleEnd;
  return { ...schedule, generatedScheduleEnd: end ?? null };
};
