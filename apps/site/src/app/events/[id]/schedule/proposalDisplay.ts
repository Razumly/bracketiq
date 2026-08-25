import type { EventEditorCreateProposal } from "@/contracts/eventEditor";

export const formatProposalTime = (
  value: string | null,
  timeZone?: string | null,
): string => {
  if (!value) return "Time unavailable";
  const parsed = new Date(value);
  const normalizedTimeZone = timeZone?.trim();
  if (Number.isNaN(parsed.getTime()) || !normalizedTimeZone) {
    return "Time unavailable";
  }
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: normalizedTimeZone,
    }).format(parsed);
  } catch {
    return "Time unavailable";
  }
};

export const proposalFieldLabel = (
  fields: Array<Record<string, unknown>>,
  fieldId: string | null,
): string => {
  if (!fieldId) return "Field pending";
  const field = fields.find(
    (candidate) => String(candidate.id ?? candidate.$id ?? "") === fieldId,
  );
  return proposalRecordLabel(field, "Field unavailable");
};

export const proposalRecordLabelValue = (
  record: unknown,
): string | null => {
  if (!record || typeof record !== "object") return null;
  const value = record as Record<string, unknown>;
  const label = [
    value.name,
    value.label,
    value.title,
    value.teamName,
    value.displayName,
  ].find(
    (candidate): candidate is string =>
      typeof candidate === "string" && candidate.trim().length > 0,
  );
  if (label) return label.trim();
  const fullName = [value.firstName, value.lastName]
    .filter(
      (candidate): candidate is string =>
        typeof candidate === "string" && candidate.trim().length > 0,
    )
    .join(" ")
    .trim();
  return fullName || null;
};

export const proposalRecordLabel = (
  record: unknown,
  fallback: string,
): string => proposalRecordLabelValue(record) ?? fallback;

const proposalRecordsById = (
  records: unknown,
): Map<string, Record<string, unknown>> => {
  if (!Array.isArray(records)) return new Map();
  return new Map(
    records.flatMap((candidate) => {
      if (!candidate || typeof candidate !== "object") return [];
      const record = candidate as Record<string, unknown>;
      const id =
        typeof record.id === "string"
          ? record.id
          : typeof record.$id === "string"
            ? record.$id
            : null;
      return id ? [[id, record] as const] : [];
    }),
  );
};
const proposalPhaseSettingsForMatch = (
  event: Record<string, unknown>,
  match: Record<string, unknown>,
): Record<string, unknown> | null => {
  const details = [
    ...(Array.isArray(event.divisionDetails) ? event.divisionDetails : []),
    ...(Array.isArray(event.playoffDivisionDetails)
      ? event.playoffDivisionDetails
      : []),
  ].filter(
    (detail): detail is Record<string, unknown> =>
      Boolean(detail) && typeof detail === "object" && !Array.isArray(detail),
  );
  const division = details.find((detail) =>
    [match.division, match.phaseDivisionId, match.sourceDivisionId].some(
      (id) => typeof id === "string" && id === detail.id,
    ),
  );
  const phase = String(match.phase ?? division?.phase ?? "").trim().toUpperCase();
  if (!phase || !division?.phaseSettings || typeof division.phaseSettings !== "object") {
    return null;
  }
  const settings = Object.entries(
    division.phaseSettings as Record<string, unknown>,
  ).find(([key]) => key.trim().toUpperCase() === phase)?.[1];
  return settings && typeof settings === "object" && !Array.isArray(settings)
    ? (settings as Record<string, unknown>)
    : null;
};

const proposalOfficialPositionsForMatch = (
  event: Record<string, unknown>,
  match: Record<string, unknown>,
): unknown[] => {
  const phasePositions = proposalPhaseSettingsForMatch(event, match)?.officialPositions;
  return Array.isArray(phasePositions)
    ? phasePositions
    : Array.isArray(event.officialPositions)
      ? event.officialPositions
      : [];
};


export const proposalAssignmentLabels = (
  match: unknown,
  graphEvent: unknown,
): string[] => {
  if (!match || typeof match !== "object") return [];
  const record = match as Record<string, unknown>;
  const event =
    graphEvent && typeof graphEvent === "object"
      ? (graphEvent as Record<string, unknown>)
      : {};
  const positionsById = proposalRecordsById(
    proposalOfficialPositionsForMatch(event, record),
  );
  const officialsById = proposalRecordsById(event.officials);
  const eventOfficialsById = proposalRecordsById(event.eventOfficials);
  const teamsById = proposalRecordsById(event.teams);
  const resolveOfficial = (candidate: unknown): unknown => {
    if (candidate && typeof candidate === "object") return candidate;
    if (typeof candidate !== "string") return undefined;
    const directOfficial = officialsById.get(candidate);
    if (directOfficial) return directOfficial;
    const eventOfficial = eventOfficialsById.get(candidate);
    const userId =
      typeof eventOfficial?.userId === "string"
        ? eventOfficial.userId
        : undefined;
    return userId ? officialsById.get(userId) : undefined;
  };
  const assignments = Array.isArray(record.officialAssignments)
    ? record.officialAssignments
    : Array.isArray(record.officialIds)
      ? record.officialIds
      : [];
  const labels = assignments.map((assignment, index) => {
    if (!assignment || typeof assignment !== "object") {
      const official = resolveOfficial(assignment);
      return `Official ${index + 1}: ${proposalRecordLabel(official, "Unassigned official")}`;
    }
    const value = assignment as Record<string, unknown>;
    const positionId =
      typeof value.positionId === "string" ? value.positionId : null;
    const position =
      value.position ??
      (positionId ? positionsById.get(positionId) : undefined);
    const positionLabel = proposalRecordLabel(
      position,
      typeof value.holderType === "string"
        ? value.holderType
        : `Official ${index + 1}`,
    );
    const holder =
      resolveOfficial(value.user ?? value.official) ??
      resolveOfficial(value.userId) ??
      resolveOfficial(value.eventOfficialId);
    return `${positionLabel}: ${proposalRecordLabel(holder, "Unassigned official")}`;
  });
  const teamOfficialId =
    typeof record.teamOfficialId === "string" ? record.teamOfficialId : null;
  const teamOfficial =
    record.teamOfficial ??
    (teamOfficialId ? teamsById.get(teamOfficialId) : undefined);
  if (teamOfficialId || teamOfficial) {
    labels.push(
      `Team official: ${proposalRecordLabel(teamOfficial, "Team unavailable")}`,
    );
  }
  if (labels.length === 0 && record.official) {
    labels.push(
      `Official: ${proposalRecordLabel(record.official, "Official unavailable")}`,
    );
  }
  return labels;
};

const proposalMatchKey = (match: Record<string, unknown>): string[] =>
  [
    typeof match.id === "string" ? match.id : null,
    typeof match.matchId === "number" ? String(match.matchId) : null,
  ].filter((value): value is string => Boolean(value));

const proposalDisplayIssues = (
  proposal: EventEditorCreateProposal,
): { errors: string[]; warnings: string[] } => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const graphEvent = proposal.graph.event as Record<string, unknown>;
  const graphMatches = proposal.graph.matches as Array<
    Record<string, unknown>
  >;
  const matchByKey = new Map(
    graphMatches.flatMap((match, index) => {
      const label = `Match ${match.matchId ?? index + 1}`;
      return proposalMatchKey(match).map((key) => [key, label] as const);
    }),
  );
  const fields = Array.isArray(graphEvent.fields)
    ? (graphEvent.fields as Array<Record<string, unknown>>)
    : [];
  const teams = proposalRecordsById(graphEvent.teams);
  const officials = proposalRecordsById(graphEvent.officials);
  const eventOfficials = proposalRecordsById(graphEvent.eventOfficials);
  const resolveOfficial = (candidate: unknown): unknown => {
    if (candidate && typeof candidate === "object") return candidate;
    if (typeof candidate !== "string") return undefined;
    const official = officials.get(candidate);
    if (official) return official;
    const eventOfficial = eventOfficials.get(candidate);
    return typeof eventOfficial?.userId === "string"
      ? officials.get(eventOfficial.userId)
      : undefined;
  };

  if (!proposal.snapshot.draft.basics.timeZone.trim()) {
    warnings.push("The proposal time zone is unavailable.");
  }
  if (
    proposal.scheduleOutcome.matchCount !== graphMatches.length
    || proposal.scheduleOutcome.matches.length !== graphMatches.length
  ) {
    errors.push("The proposal Match Graph count does not match its schedule.");
  }
  proposal.scheduleOutcome.matches.forEach((match, index) => {
    const label = `Match ${match.matchId ?? index + 1}`;
    const graphMatch = graphMatches.find((candidate) =>
      proposalMatchKey(candidate).some((key) =>
        proposalMatchKey(match as unknown as Record<string, unknown>).includes(
          key,
        ),
      ),
    );
    if (!graphMatch) {
      errors.push(`${label} is missing from the Match Graph.`);
      return;
    }
    const graphStart =
      typeof graphMatch.start === "string" ? graphMatch.start : null;
    const graphEnd =
      typeof graphMatch.end === "string" ? graphMatch.end : null;
    if (!match.start || !match.end || !graphStart || !graphEnd) {
      errors.push(`${label} has no proposed time.`);
    }
    if (
      String(graphMatch.placementState ?? "").trim().toUpperCase() !== "PLACED"
    ) {
      errors.push(`${label} is not placed.`);
    }
    for (const teamId of [match.team1Id, match.team2Id]) {
      if (teamId && !proposalRecordLabelValue(teams.get(teamId))) {
        errors.push(`${label} has an unavailable team label.`);
      }
    }
    const graphFieldId =
      typeof graphMatch.fieldId === "string" ? graphMatch.fieldId : null;
    const fieldId = match.fieldId ?? graphFieldId;
    if (!match.fieldId || !graphFieldId) {
      errors.push(`${label} has no resource assignment.`);
    } else {
      const field = fields.find(
        (candidate) =>
          String(candidate.id ?? candidate.$id ?? "") === fieldId,
      );
      if (!proposalRecordLabelValue(field)) {
        errors.push(`${label} has an unavailable resource label.`);
      }
    }
    const assignments = Array.isArray(graphMatch.officialAssignments)
      ? graphMatch.officialAssignments
      : Array.isArray(graphMatch.officialIds)
        ? graphMatch.officialIds
        : [];
    const phaseSettings = proposalPhaseSettingsForMatch(graphEvent, graphMatch);
    const configuredPositions = proposalOfficialPositionsForMatch(
      graphEvent,
      graphMatch,
    ).filter(
      (position): position is Record<string, unknown> =>
        Boolean(position) && typeof position === "object" && !Array.isArray(position),
    );
    const positions = proposalRecordsById(configuredPositions);
    assignments.forEach((assignment) => {
      if (!assignment || typeof assignment !== "object") {
        errors.push(`${label} has an invalid officiating assignment.`);
        return;
      }
      const value = assignment as Record<string, unknown>;
      const positionId =
        typeof value.positionId === "string" ? value.positionId : null;
      if (!positionId || !proposalRecordLabelValue(positions.get(positionId))) {
        errors.push(`${label} has an unavailable officiating position.`);
      }
      const holderId =
        typeof value.userId === "string" && value.userId.trim()
          ? value.userId
          : typeof value.eventOfficialId === "string" &&
              value.eventOfficialId.trim()
            ? value.eventOfficialId
            : null;
      const holder = resolveOfficial(holderId);
      if (!holderId) {
        errors.push(`${label} has an unassigned officiating slot.`);
      } else if (!proposalRecordLabelValue(holder)) {
        errors.push(`${label} has an unavailable official label.`);
      }
    });
    configuredPositions.forEach((position) => {
      const positionId =
        typeof position.id === "string" ? position.id : null;
      const count =
        typeof position.count === "number" && Number.isInteger(position.count)
          ? position.count
          : 0;
      for (let slotIndex = 0; slotIndex < count; slotIndex += 1) {
        const assignment = assignments.find(
          (candidate) =>
            candidate
            && typeof candidate === "object"
            && (candidate as Record<string, unknown>).positionId === positionId
            && (candidate as Record<string, unknown>).slotIndex === slotIndex,
        );
        const value =
          assignment && typeof assignment === "object"
            ? (assignment as Record<string, unknown>)
            : null;
        const holderId =
          typeof value?.userId === "string" && value.userId.trim()
            ? value.userId
            : typeof value?.eventOfficialId === "string"
              && value.eventOfficialId.trim()
              ? value.eventOfficialId
              : null;
        if (!holderId) {
          errors.push(`${label} has an unassigned officiating slot.`);
        }
      }
    });
    const teamOfficialId =
      typeof graphMatch.teamOfficialId === "string"
        ? graphMatch.teamOfficialId
        : null;
    const requiresTeamOfficial =
      typeof phaseSettings?.doTeamsOfficiate === "boolean"
        ? phaseSettings.doTeamsOfficiate
        : graphEvent.doTeamsOfficiate === true;
    if (requiresTeamOfficial && !teamOfficialId) {
      errors.push(`${label} has no proposed team official.`);
    } else if (
      teamOfficialId
      && !proposalRecordLabelValue(teams.get(teamOfficialId))
    ) {
      errors.push(`${label} has an unavailable team official label.`);
    }
    const officialId =
      typeof graphMatch.officialId === "string" ? graphMatch.officialId : null;
    if (officialId && !proposalRecordLabelValue(resolveOfficial(officialId))) {
      errors.push(`${label} has an unavailable official label.`);
    }
    for (const link of [
      graphMatch.previousLeftId,
      graphMatch.previousRightId,
      graphMatch.winnerNextMatchId,
      graphMatch.loserNextMatchId,
    ]) {
      if (typeof link === "string" && !matchByKey.has(link)) {
        errors.push(`${label} has an unresolved Match Graph link.`);
      }
    }
  });
  return {
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
  };
};

export const proposalDisplayErrors = (
  proposal: EventEditorCreateProposal,
): string[] => proposalDisplayIssues(proposal).errors;

export const proposalDisplayWarnings = (
  proposal: EventEditorCreateProposal,
): string[] => proposalDisplayIssues(proposal).warnings;
