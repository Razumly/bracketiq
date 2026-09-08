import type { RefundRequest } from "@/types";
import { eventService } from "@/lib/eventService";
import { userService } from "@/lib/userService";
import { organizationService } from "@/lib/organizationService";
import { teamService } from "@/lib/teamService";

export type RefundReferences = {
  events: Record<string, string>;
  users: Record<string, string>;
  organizations: Record<string, string>;
  teams: Record<string, string>;
};

export type RefundFilters = {
  organizationId?: string;
  userId?: string;
  hostId?: string;
};

export function filterRefundRequests(
  refunds: RefundRequest[],
  filters: RefundFilters,
) {
  if (filters.hostId) {
    return refunds.filter(
      (refund) =>
        refund.hostId === filters.hostId && refund.userId !== filters.hostId,
    );
  }
  if (filters.organizationId) {
    return refunds.filter(
      (refund) => refund.organizationId === filters.organizationId,
    );
  }
  if (filters.userId)
    return refunds.filter((refund) => refund.userId === filters.userId);
  return refunds;
}

function uniqueIds(ids: Array<string | undefined>) {
  return Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
}

function requireNames(
  ids: string[],
  entries: Array<readonly [string, string]>,
  entity: string,
) {
  const names = Object.fromEntries(entries);
  for (const id of ids) {
    if (!names[id]?.trim()) {
      throw new Error(
        `Could not load the ${entity} name for a refund request. Reload the requests before taking action.`,
      );
    }
  }
  return names;
}

export async function loadRefundReferences(
  refunds: RefundRequest[],
): Promise<RefundReferences> {
  const eventIds = uniqueIds(refunds.map((refund) => refund.eventId));
  const userIds = uniqueIds(
    refunds.flatMap((refund) => [refund.userId, refund.hostId]),
  );
  const organizationIds = uniqueIds(
    refunds.map((refund) => refund.organizationId),
  );
  const teamIds = uniqueIds(refunds.map((refund) => refund.teamId));
  const [events, users, organizations, teams] = await Promise.all([
    Promise.all(eventIds.map((id) => eventService.getEventById(id))),
    userIds.length ? userService.getUsersByIds(userIds) : [],
    organizationIds.length
      ? organizationService.getOrganizationsByIds(organizationIds)
      : [],
    teamIds.length ? teamService.getTeamsByIds(teamIds, true) : [],
  ]);
  return {
    events: requireNames(
      eventIds,
      events
        .filter((event): event is NonNullable<typeof event> => Boolean(event))
        .map((event) => [event.$id, event.name]),
      "event",
    ),
    users: requireNames(
      userIds,
      users.map((user) => [
        user.$id,
        `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim(),
      ]),
      "customer or host",
    ),
    organizations: requireNames(
      organizationIds,
      organizations.map((org) => [org.$id, org.name]),
      "organization",
    ),
    teams: requireNames(
      teamIds,
      teams.map((team) => [team.$id, team.name]),
      "team",
    ),
  };
}
