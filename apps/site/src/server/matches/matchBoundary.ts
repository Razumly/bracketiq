import type { Prisma } from "@/generated/prisma/client";
import { matchBoundaryErrorSchema } from "@/contracts/matchBoundary";
import type { MatchPersistenceInput } from "@/server/repositories/events";

export type MatchSavePolicy = { approvedScheduleEnd?: Date };

type Placement = { id: string; start: Date; end: Date; fieldId: string };

const placed = (match: MatchPersistenceInput): Placement[] => {
  if (
    !match.field ||
    !match.start ||
    !match.end
  )
    return [];
  return [
    {
      id: match.id,
      start: match.start,
      end: match.end,
      fieldId: match.field.id,
    },
  ];
};

const isSamePlacement = (
  next: Placement,
  previous?: { start: Date | null; end: Date | null; fieldId: string | null },
): boolean =>
  previous?.start?.getTime() === next.start.getTime() &&
  previous?.end?.getTime() === next.end.getTime() &&
  previous.fieldId === next.fieldId;

const isOutsideBounds = (
  placement: Placement,
  start: Date,
  end: Date | null,
): boolean =>
  !end ||
  !Number.isFinite(+placement.start) ||
  !Number.isFinite(+placement.end) ||
  +placement.start < +start ||
  +placement.end > +end ||
  +placement.end <= +placement.start;

const isGeneratedEndPermitted = (event: {
  noFixedEndDateTime: boolean;
  automatedScheduling: boolean;
  eventType: string | null;
}) =>
  event.noFixedEndDateTime &&
  event.automatedScheduling &&
  ["LEAGUE", "TOURNAMENT"].includes(event.eventType ?? "");

/** The caller holds the Event lock and owns the transaction. */
export async function assertMatchSaveBoundaries(
  eventId: string,
  matches: MatchPersistenceInput[],
  client: Prisma.TransactionClient,
  policy: MatchSavePolicy,
): Promise<void> {
  const placements = matches.flatMap(placed);
  if (!placements.length) return;
  const [event, previous] = await Promise.all([
    client.events.findUnique({
      where: { id: eventId },
      select: {
        start: true,
        end: true,
        noFixedEndDateTime: true,
        automatedScheduling: true,
        eventType: true,
      },
    }),
    client.matches.findMany({
      where: { eventId, id: { in: placements.map((match) => match.id) } },
      select: { id: true, start: true, end: true, fieldId: true },
    }),
  ]);
  if (!event)
    throw Response.json({ error: "Event not found." }, { status: 404 });
  const isEndChangePermitted = isGeneratedEndPermitted(event);
  const end = isEndChangePermitted ? (policy.approvedScheduleEnd ?? event.end) : event.end;
  const previousById = new Map(previous.map((match) => [match.id, match]));
  const invalid = placements.filter(
    (match) =>
      !isSamePlacement(match, previousById.get(match.id)) &&
      isOutsideBounds(match, event.start, end),
  );
  if (!invalid.length) return;
  throw Response.json(
    matchBoundaryErrorSchema.parse({
      code: "MATCH_OUTSIDE_EVENT_BOUNDS",
      error:
        "The Match must be within the Event bounds. Set or extend Planned End before moving the Match.",
      eventId,
      eventStart: event.start.toISOString(),
      eventEnd: end?.toISOString() ?? null,
      matchIds: invalid.map((match) => match.id),
    }),
    { status: 409 },
  );
}
