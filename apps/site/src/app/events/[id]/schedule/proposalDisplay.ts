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
const proposalOfficialResolver = (
  event: Record<string, unknown>,
): ((candidate: unknown) => unknown) => {
  const officialsById = proposalRecordsById(event.officials);
  const eventOfficialsById = proposalRecordsById(event.eventOfficials);
  return (candidate: unknown): unknown => {
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
};
const isProposalRecord = (
  value: unknown,
): value is Record<string, unknown> => (
  Boolean(value) && typeof value === "object" && !Array.isArray(value)
);

const proposalRecordArray = (value: unknown): Record<string, unknown>[] => (
  Array.isArray(value) ? value.filter(isProposalRecord) : []
);

const proposalMatchDivisionIds = (
  match: Record<string, unknown>,
): string[] => (
  [match.division, match.phaseDivisionId, match.sourceDivisionId]
    .filter((id): id is string => typeof id === "string")
);
const proposalPhaseSettingsForMatch = (
  event: Record<string, unknown>,
  match: Record<string, unknown>,
): Record<string, unknown> | null => {
  const details = [
    ...proposalRecordArray(event.divisionDetails),
    ...proposalRecordArray(event.playoffDivisionDetails),
  ];
  const division = details.find((detail) =>
    proposalMatchDivisionIds(match).some((id) => id === detail.id),
  );
  const phase = String(match.phase ?? division?.phase ?? "").trim().toUpperCase();
  const phaseSettings = division?.phaseSettings;
  if (!phase || !isProposalRecord(phaseSettings)) {
    return null;
  }
  const settings = Object.entries(phaseSettings).find(
    ([key]) => key.trim().toUpperCase() === phase,
  )?.[1];
  return isProposalRecord(settings) ? settings : null;
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


const proposalAssignmentValues = (record: Record<string, unknown>): unknown[] => (
  Array.isArray(record.officialAssignments)
    ? record.officialAssignments
    : Array.isArray(record.officialIds)
      ? record.officialIds
      : []
);

const proposalAssignmentLabel = (
  assignment: unknown,
  index: number,
  positionsById: Map<string, Record<string, unknown>>,
  resolveOfficial: (candidate: unknown) => unknown,
): string => {
  if (!isProposalRecord(assignment)) {
    return `Official ${index + 1}: ${proposalRecordLabel(
      resolveOfficial(assignment),
      "Unassigned official",
    )}`;
  }
  const positionId =
    typeof assignment.positionId === "string" ? assignment.positionId : null;
  const position =
    assignment.position
    ?? (positionId ? positionsById.get(positionId) : undefined);
  const positionLabel = proposalRecordLabel(
    position,
    typeof assignment.holderType === "string"
      ? assignment.holderType
      : `Official ${index + 1}`,
  );
  const holder =
    resolveOfficial(assignment.user ?? assignment.official)
    ?? resolveOfficial(assignment.userId)
    ?? resolveOfficial(assignment.eventOfficialId);
  return `${positionLabel}: ${proposalRecordLabel(holder, "Unassigned official")}`;
};
export const proposalAssignmentLabels = (
  match: unknown,
  graphEvent: unknown,
): string[] => {
  if (!isProposalRecord(match)) return [];
  const record = match;
  const event = isProposalRecord(graphEvent) ? graphEvent : {};
  const positionsById = proposalRecordsById(
    proposalOfficialPositionsForMatch(event, record),
  );
  const resolveOfficial = proposalOfficialResolver(event);
  const teamsById = proposalRecordsById(event.teams);
  const labels = proposalAssignmentValues(record).map(
    (assignment, index) =>
      proposalAssignmentLabel(assignment, index, positionsById, resolveOfficial),
  );
  const teamOfficialId =
    typeof record.teamOfficialId === "string" ? record.teamOfficialId : null;
  const teamOfficial =
    record.teamOfficial
    ?? (teamOfficialId ? teamsById.get(teamOfficialId) : undefined);
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
const isBestEffortStaffingPriority = (graphEvent: Record<string, unknown>): boolean => {
  const staffingPriority = typeof graphEvent.staffingPriority === "string"
    ? graphEvent.staffingPriority.trim().toUpperCase()
    : "";
  return staffingPriority === "BEST_AVAILABLE_COVERAGE";
};

const isUnassignedOfficialIssue = (message: string): boolean => (
  message.endsWith(" has an unassigned officiating slot.")
);

type ProposalScheduleMatch =
  EventEditorCreateProposal["scheduleOutcome"]["matches"][number];


const proposalGraphMatchForScheduleMatch = (
  graphMatches: Array<Record<string, unknown>>,
  match: ProposalScheduleMatch,
): Record<string, unknown> | undefined => {
  const matchKeys = proposalMatchKey(match as unknown as Record<string, unknown>);
  return graphMatches.find((candidate) =>
    proposalMatchKey(candidate).some((key) => matchKeys.includes(key)),
  );
};

const proposalAssignmentHolderId = (
  value: Record<string, unknown> | null,
): string | null => {
  if (typeof value?.userId === "string" && value.userId.trim()) {
    return value.userId;
  }
  if (
    typeof value?.eventOfficialId === "string"
    && value.eventOfficialId.trim()
  ) {
    return value.eventOfficialId;
  }
  return null;
};

const hasMissingProposalTime = (
  match: ProposalScheduleMatch,
  graphStart: string | null,
  graphEnd: string | null,
): boolean => [
  match.start,
  match.end,
  graphStart,
  graphEnd,
].some((value) => !value);
const addProposalTimeIssues = (
  match: ProposalScheduleMatch,
  graphMatch: Record<string, unknown>,
  label: string,
  isPartialUnplaced: boolean,
  errors: string[],
): void => {
  const graphStart =
    typeof graphMatch.start === "string" ? graphMatch.start : null;
  const graphEnd =
    typeof graphMatch.end === "string" ? graphMatch.end : null;
  if (!isPartialUnplaced && hasMissingProposalTime(match, graphStart, graphEnd)) {
    errors.push(`${label} has no proposed time.`);
  }
  const placementState = String(graphMatch.placementState ?? "")
    .trim()
    .toUpperCase();
  if (!isPartialUnplaced && placementState !== "PLACED") {
    errors.push(`${label} is not placed.`);
  }
};

const addProposalTeamLabelIssues = (
  match: ProposalScheduleMatch,
  label: string,
  teams: Map<string, Record<string, unknown>>,
  errors: string[],
): void => {
  for (const teamId of [match.team1Id, match.team2Id]) {
    if (teamId && !proposalRecordLabelValue(teams.get(teamId))) {
      errors.push(`${label} has an unavailable team label.`);
    }
  }
};

const addProposalResourceIssues = (
  match: ProposalScheduleMatch,
  graphMatch: Record<string, unknown>,
  label: string,
  isPartialUnplaced: boolean,
  fields: Array<Record<string, unknown>>,
  errors: string[],
): void => {
  if (isPartialUnplaced) {
    return;
  }
  const graphFieldId =
    typeof graphMatch.fieldId === "string" ? graphMatch.fieldId : null;
  const fieldId = match.fieldId ?? graphFieldId;
  if (!match.fieldId || !graphFieldId) {
    errors.push(`${label} has no resource assignment.`);
    return;
  }
  const field = fields.find(
    (candidate) => String(candidate.id ?? candidate.$id ?? "") === fieldId,
  );
  if (!proposalRecordLabelValue(field)) {
    errors.push(`${label} has an unavailable resource label.`);
  }
};
const addProposalPlacementIssues = (
  match: ProposalScheduleMatch,
  graphMatch: Record<string, unknown>,
  label: string,
  isPartialUnplaced: boolean,
  fields: Array<Record<string, unknown>>,
  teams: Map<string, Record<string, unknown>>,
  errors: string[],
): void => {
  addProposalTimeIssues(match, graphMatch, label, isPartialUnplaced, errors);
  addProposalTeamLabelIssues(match, label, teams, errors);
  addProposalResourceIssues(
    match,
    graphMatch,
    label,
    isPartialUnplaced,
    fields,
    errors,
  );
};

const addProposalPartialGraphLinkIssues = (
  graphMatch: Record<string, unknown>,
  label: string,
  matchByKey: Map<string, string>,
  errors: string[],
): void => {
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
};

const addProposalAssignmentIssues = (
  assignments: unknown[],
  label: string,
  positions: Map<string, Record<string, unknown>>,
  resolveOfficial: (candidate: unknown) => unknown,
  addOfficialAssignmentIssue: (message: string) => void,
  errors: string[],
): void => {
  assignments.forEach((assignment) => {
    if (!isProposalRecord(assignment)) {
      errors.push(`${label} has an invalid officiating assignment.`);
      return;
    }
    const positionId =
      typeof assignment.positionId === "string" ? assignment.positionId : null;
    if (!positionId || !proposalRecordLabelValue(positions.get(positionId))) {
      errors.push(`${label} has an unavailable officiating position.`);
    }
    const holderId = proposalAssignmentHolderId(assignment);
    const holder = resolveOfficial(holderId);
    if (!holderId) {
      addOfficialAssignmentIssue(`${label} has an unassigned officiating slot.`);
    } else if (!proposalRecordLabelValue(holder)) {
      errors.push(`${label} has an unavailable official label.`);
    }
  });
};

const addProposalConfiguredSlotIssues = (
  assignments: unknown[],
  configuredPositions: Record<string, unknown>[],
  label: string,
  addOfficialAssignmentIssue: (message: string) => void,
): void => {
  configuredPositions.forEach((position) => {
    const positionId = typeof position.id === "string" ? position.id : null;
    const count =
      typeof position.count === "number" && Number.isInteger(position.count)
        ? position.count
        : 0;
    for (let slotIndex = 0; slotIndex < count; slotIndex += 1) {
      const assignment = assignments.find(
        (candidate) =>
          isProposalRecord(candidate)
          && candidate.positionId === positionId
          && candidate.slotIndex === slotIndex,
      );
      const holderId = proposalAssignmentHolderId(
        isProposalRecord(assignment) ? assignment : null,
      );
      if (!holderId) {
        addOfficialAssignmentIssue(`${label} has an unassigned officiating slot.`);
      }
    }
  });
};

const addProposalTeamDutyIssues = (
  graphEvent: Record<string, unknown>,
  graphMatch: Record<string, unknown>,
  phaseSettings: Record<string, unknown> | null,
  label: string,
  teams: Map<string, Record<string, unknown>>,
  errors: string[],
): void => {
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
};

const addProposalOfficialLabelIssue = (
  graphMatch: Record<string, unknown>,
  label: string,
  resolveOfficial: (candidate: unknown) => unknown,
  errors: string[],
): void => {
  const officialId =
    typeof graphMatch.officialId === "string" ? graphMatch.officialId : null;
  if (officialId && !proposalRecordLabelValue(resolveOfficial(officialId))) {
    errors.push(`${label} has an unavailable official label.`);
  }
};
const addProposalDutyAndLinkIssues = (
  graphEvent: Record<string, unknown>,
  graphMatch: Record<string, unknown>,
  phaseSettings: Record<string, unknown> | null,
  label: string,
  teams: Map<string, Record<string, unknown>>,
  resolveOfficial: (candidate: unknown) => unknown,
  matchByKey: Map<string, string>,
  errors: string[],
): void => {
  addProposalTeamDutyIssues(
    graphEvent,
    graphMatch,
    phaseSettings,
    label,
    teams,
    errors,
  );
  addProposalOfficialLabelIssue(graphMatch, label, resolveOfficial, errors);
  addProposalPartialGraphLinkIssues(graphMatch, label, matchByKey, errors);
};
export const proposalDisplayIssues = (
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
  const fields = proposalRecordArray(graphEvent.fields);
  const teams = proposalRecordsById(graphEvent.teams);
  const resolveOfficial = proposalOfficialResolver(graphEvent);
  const bestEffortStaffing = isBestEffortStaffingPriority(graphEvent);
  const addOfficialAssignmentIssue = (message: string) => {
    (bestEffortStaffing ? warnings : errors).push(message);
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
    const graphMatch = proposalGraphMatchForScheduleMatch(graphMatches, match);
    if (!graphMatch) {
      errors.push(`${label} is missing from the Match Graph.`);
      return;
    }
    const placementState = String(graphMatch.placementState ?? "")
      .trim()
      .toUpperCase();
    const isPartialUnplaced =
      proposal.scheduleOutcome.status === "PARTIAL"
      && placementState === "UNPLACED";
    const assignments = proposalAssignmentValues(graphMatch);
    const phaseSettings = proposalPhaseSettingsForMatch(graphEvent, graphMatch);
    const configuredPositions = proposalRecordArray(
      proposalOfficialPositionsForMatch(graphEvent, graphMatch),
    );
    const positions = proposalRecordsById(configuredPositions);
    addProposalPlacementIssues(
      match,
      graphMatch,
      label,
      isPartialUnplaced,
      fields,
      teams,
      errors,
    );
    if (isPartialUnplaced) {
      addProposalPartialGraphLinkIssues(graphMatch, label, matchByKey, errors);
      return;
    }
    addProposalAssignmentIssues(
      assignments,
      label,
      positions,
      resolveOfficial,
      addOfficialAssignmentIssue,
      errors,
    );
    addProposalConfiguredSlotIssues(
      assignments,
      configuredPositions,
      label,
      addOfficialAssignmentIssue,
    );
    addProposalDutyAndLinkIssues(
      graphEvent,
      graphMatch,
      phaseSettings,
      label,
      teams,
      resolveOfficial,
      matchByKey,
      errors,
    );
  });
  const normalizedErrors = [...new Set(errors)];
  const normalizedWarnings = [...new Set(warnings)];
  if (bestEffortStaffing) {
    const unassignedOfficialWarnings = normalizedErrors.filter(
      isUnassignedOfficialIssue,
    );
    return {
      errors: normalizedErrors.filter(
        (message) => !isUnassignedOfficialIssue(message),
      ),
      warnings: [
        ...new Set([...normalizedWarnings, ...unassignedOfficialWarnings]),
      ],
    };
  }
  return { errors: normalizedErrors, warnings: normalizedWarnings };
};
