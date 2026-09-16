import type { EventType } from "@/types";

export const defaultAutomatedSchedulingForEventType = (
  eventType: EventType | string | null | undefined,
): boolean => {
  const normalized = String(eventType ?? "").trim().toUpperCase();
  return normalized === "LEAGUE" || normalized === "TOURNAMENT" || normalized === "WEEKLY_EVENT";
};

export const normalizeAutomatedSchedulingForEventType = (
  eventType: EventType | string | null | undefined,
  value: unknown,
): boolean => {
  const normalized = String(eventType ?? "").trim().toUpperCase();
  if (!defaultAutomatedSchedulingForEventType(normalized)) return false;
  if (normalized === "WEEKLY_EVENT") return true;
  return typeof value === "boolean"
    ? value
    : defaultAutomatedSchedulingForEventType(normalized);
};
