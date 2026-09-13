export const WEEKLY_REPEATING_TIME_SLOT_REQUIRED_MESSAGE =
  'Add at least one weekly repeating timeslot for this Weekly Event.';

export const hasWeeklyRepeatingTimeSlot = (
  slots: Array<{ repeating?: unknown }> | null | undefined,
): boolean => (
  Array.isArray(slots) && slots.some((slot) => slot.repeating !== false)
);
export const eventRequiresConfiguredTimeSlot = (
  eventType: string | null | undefined,
  automatedScheduling: boolean | null | undefined,
  parentEvent?: string | null,
): boolean => {
  if (
    eventType === "WEEKLY_EVENT"
    && typeof parentEvent === "string"
    && parentEvent.trim().length > 0
  ) {
    return false;
  }
  if (eventType === "WEEKLY_EVENT" || eventType === "TRYOUT") {
    return true;
  }
  return (
    automatedScheduling !== false
    && (eventType === "LEAGUE" || eventType === "TOURNAMENT")
  );
};
