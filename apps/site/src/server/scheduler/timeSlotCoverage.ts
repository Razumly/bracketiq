import {
  Division,
  League,
  PlayingField,
  TimeSlot,
  Tournament,
  getPlayingFieldExplicitDivisionIds,
  getTimeSlotExplicitDivisionIds,
} from './types';

type SchedulerEvent = League | Tournament;
const normalizeDivisionId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
};

const normalizeDivisionRefId = (value: unknown): string | null => {
  if (typeof value === 'string') {
    return normalizeDivisionId(value);
  }
  if (!value || typeof value !== 'object' || !('id' in value)) {
    return null;
  }
  const id = value.id;
  return normalizeDivisionId(id);
};

const readDivisions = (value: unknown): unknown => {
  if (!value || typeof value !== 'object' || !('divisions' in value)) {
    return null;
  }
  return value.divisions;
};

const isSplitPlayoffEvent = (event: SchedulerEvent): boolean => {
  if (event instanceof League || event.eventType === 'LEAGUE') {
    return Boolean(event.splitLeaguePlayoffDivisions)
      && Array.isArray(event.playoffDivisions)
      && event.playoffDivisions.length > 0;
  }
  return String(event.eventType ?? '').toUpperCase() === 'TOURNAMENT'
    && event.includePlayoffs === true
    && Array.isArray(event.playoffDivisions)
    && event.playoffDivisions.length > 0;
};

const rawScopeIds = (
  value: unknown,
  readMetadata: (value: unknown) => string[] | null,
  readCurrent: (value: unknown) => unknown,
): string[] | null => {
  const metadata = readMetadata(value);
  if (metadata) {
    return metadata
      .map((entry) => normalizeDivisionId(entry))
      .filter((entry): entry is string => Boolean(entry));
  }
  const current = readCurrent(value);
  if (!Array.isArray(current)) {
    return null;
  }
  return current
    .map((entry) => normalizeDivisionRefId(entry))
    .filter((entry): entry is string => Boolean(entry));
};

const rawSlotScopeIds = (slot: TimeSlot): string[] | null => rawScopeIds(
  slot,
  getTimeSlotExplicitDivisionIds,
  readDivisions,
);

const rawFieldScopeIds = (field: PlayingField): string[] | null => rawScopeIds(
  field,
  getPlayingFieldExplicitDivisionIds,
  readDivisions,
);

const addAlias = (
  aliases: Map<string, Set<string>>,
  alias: unknown,
  divisionId: string,
): void => {
  const normalizedAlias = normalizeDivisionId(alias);
  const normalizedDivisionId = normalizeDivisionId(divisionId);
  if (!normalizedAlias || !normalizedDivisionId) {
    return;
  }
  const values = aliases.get(normalizedAlias) ?? new Set<string>();
  values.add(normalizedDivisionId);
  aliases.set(normalizedAlias, values);
};

const buildDivisionAliases = (divisions: Division[]): Map<string, Set<string>> => {
  const aliases = new Map<string, Set<string>>();
  for (const division of divisions) {
    addAlias(aliases, division.id, division.id);
    const phase = String(division.phase ?? '').toUpperCase();
    if ((phase === 'LEAGUE' || phase === 'POOL') && division.sourceDivisionId) {
      addAlias(aliases, division.sourceDivisionId, division.id);
    }
  }
  return aliases;
};

const resolveScopedDivisionId = (
  rawId: string,
  aliases: Map<string, Set<string>>,
): string => {
  const normalizedRawId = normalizeDivisionId(rawId) ?? rawId;
  const candidates = aliases.get(normalizedRawId);
  if (candidates?.size === 1) {
    return Array.from(candidates)[0];
  }
  return normalizedRawId;
};

const extendFieldEligibility = (
  event: SchedulerEvent,
  slot: TimeSlot,
  inheritedDivisions: Division[],
): void => {
  if (!inheritedDivisions.length) {
    return;
  }
  const slotResourceIds = slot.fieldIds.length
    ? slot.fieldIds
    : (slot.field ? [slot.field] : Object.keys(event.fields));
  for (const resourceId of slotResourceIds) {
    const resource = event.fields[resourceId];
    if (!resource) {
      continue;
    }
    const eligibleDivisionIds = new Set(
      resource.divisions
        .map((division) => normalizeDivisionId(division.id))
        .filter((entry): entry is string => Boolean(entry)),
    );
    for (const division of inheritedDivisions) {
      const normalizedDivisionId = normalizeDivisionId(division.id);
      if (!normalizedDivisionId || eligibleDivisionIds.has(normalizedDivisionId)) {
        continue;
      }
      resource.divisions.push(division);
      eligibleDivisionIds.add(normalizedDivisionId);
    }
  }
};

const narrowExpandedTargetScope = ({
  event,
  explicitPlayoffIds,
  mappedSourceDivisionIds,
  divisionAliases,
}: {
  event: SchedulerEvent;
  explicitPlayoffIds: Set<string>;
  mappedSourceDivisionIds: Set<string>;
  divisionAliases: Map<string, Set<string>>;
}): void => {
  if (!explicitPlayoffIds.size) {
    return;
  }
  const shouldKeepScopedDivision = (
    normalizedDivisionId: string | null,
    scopedIds: Set<string>,
  ): boolean => {
    if (
      !normalizedDivisionId
      || (
        !explicitPlayoffIds.has(normalizedDivisionId)
        && !mappedSourceDivisionIds.has(normalizedDivisionId)
      )
    ) {
      return true;
    }
    return scopedIds.has(normalizedDivisionId);
  };
  for (const slot of event.timeSlots) {
    const rawIds = rawSlotScopeIds(slot);
    if (!rawIds?.length) {
      continue;
    }
    const scopedIds = new Set(
      rawIds.map((rawId) => resolveScopedDivisionId(rawId, divisionAliases)),
    );
    const currentDivisions = Array.isArray(slot.divisions) ? slot.divisions : [];
    slot.divisions = currentDivisions.filter((division) =>
      shouldKeepScopedDivision(normalizeDivisionId(division.id), scopedIds));
  }
  for (const field of Object.values(event.fields)) {
    const rawIds = rawFieldScopeIds(field);
    if (!rawIds?.length) {
      continue;
    }
    const scopedIds = new Set(
      rawIds.map((rawId) => resolveScopedDivisionId(rawId, divisionAliases)),
    );
    field.divisions = field.divisions.filter((division) =>
      shouldKeepScopedDivision(normalizeDivisionId(division.id), scopedIds));
  }
};

export const ensureSplitPlayoffTimeSlotCoverage = (event: SchedulerEvent): void => {
  if (!isSplitPlayoffEvent(event) || !event.timeSlots.length) {
    return;
  }

  const playoffDivisionById = new Map<string, Division>();
  for (const playoffDivision of event.playoffDivisions ?? []) {
    const normalizedId = normalizeDivisionId(playoffDivision.id);
    if (normalizedId) {
      playoffDivisionById.set(normalizedId, playoffDivision);
    }
  }
  if (!playoffDivisionById.size) {
    return;
  }

  const allDivisions = [...event.divisions, ...Array.from(playoffDivisionById.values())];
  const divisionAliases = buildDivisionAliases(allDivisions);
  const explicitlyScopedPlayoffIds = new Set<string>();
  for (const slot of event.timeSlots) {
    const rawIds = rawSlotScopeIds(slot);
    if (!rawIds?.length) {
      continue;
    }
    for (const rawId of rawIds) {
      const scopedId = resolveScopedDivisionId(rawId, divisionAliases);
      if (playoffDivisionById.has(scopedId)) {
        explicitlyScopedPlayoffIds.add(scopedId);
      }
    }
  }

  const isTournamentPoolPlay = !(event instanceof League || event.eventType === 'LEAGUE');
  if (isTournamentPoolPlay) {
    const poolDivisionsByPlayoffId = new Map<string, Division[]>();
    const mappedSourceDivisionIds = new Set<string>();
    for (const poolDivision of event.divisions) {
      const poolDivisionId = normalizeDivisionId(poolDivision.id);
      if (!poolDivisionId) {
        continue;
      }
      for (const mappedPlayoffDivisionIdRaw of poolDivision.playoffPlacementDivisionIds ?? []) {
        const mappedPlayoffDivisionId = resolveScopedDivisionId(
          String(mappedPlayoffDivisionIdRaw),
          divisionAliases,
        );
        if (!playoffDivisionById.has(mappedPlayoffDivisionId)) {
          continue;
        }
        mappedSourceDivisionIds.add(poolDivisionId);
        const poolDivisions = poolDivisionsByPlayoffId.get(mappedPlayoffDivisionId) ?? [];
        if (!poolDivisions.some((division) => division.id === poolDivision.id)) {
          poolDivisions.push(poolDivision);
        }
        poolDivisionsByPlayoffId.set(mappedPlayoffDivisionId, poolDivisions);
      }
    }
    if (!poolDivisionsByPlayoffId.size) {
      return;
    }

    narrowExpandedTargetScope({
      event,
      explicitPlayoffIds: explicitlyScopedPlayoffIds,
      mappedSourceDivisionIds,
      divisionAliases,
    });
    for (const slot of event.timeSlots) {
      const rawIds = rawSlotScopeIds(slot);
      if (!rawIds?.length) {
        continue;
      }
      const scopedIds = rawIds.map((rawId) => resolveScopedDivisionId(rawId, divisionAliases));
      const currentDivisionIds = new Set(
        slot.divisions
          .map((division) => normalizeDivisionId(division.id))
          .filter((entry): entry is string => Boolean(entry)),
      );
      const inheritedDivisions: Division[] = [];
      for (const scopedId of scopedIds) {
        const poolDivisions = poolDivisionsByPlayoffId.get(scopedId);
        if (!poolDivisions) {
          continue;
        }
        for (const poolDivision of poolDivisions) {
          const poolDivisionId = normalizeDivisionId(poolDivision.id);
          if (!poolDivisionId || currentDivisionIds.has(poolDivisionId)) {
            continue;
          }
          slot.divisions.push(poolDivision);
          currentDivisionIds.add(poolDivisionId);
          inheritedDivisions.push(poolDivision);
        }
      }
      extendFieldEligibility(event, slot, inheritedDivisions);
    }
    return;
  }

  const mappedPlayoffIdsByDivisionId = new Map<string, Set<string>>();
  const mappedSourceDivisionIds = new Set<string>();
  for (const division of event.divisions) {
    const sourceDivisionId = normalizeDivisionId(division.id);
    if (!sourceDivisionId) {
      continue;
    }
    for (const mappedPlayoffDivisionIdRaw of division.playoffPlacementDivisionIds ?? []) {
      const mappedPlayoffDivisionId = resolveScopedDivisionId(
        String(mappedPlayoffDivisionIdRaw),
        divisionAliases,
      );
      if (!playoffDivisionById.has(mappedPlayoffDivisionId)) {
        continue;
      }
      mappedSourceDivisionIds.add(sourceDivisionId);
      const mappedPlayoffIds = mappedPlayoffIdsByDivisionId.get(sourceDivisionId) ?? new Set<string>();
      mappedPlayoffIds.add(mappedPlayoffDivisionId);
      mappedPlayoffIdsByDivisionId.set(sourceDivisionId, mappedPlayoffIds);
    }
  }
  if (!mappedPlayoffIdsByDivisionId.size) {
    return;
  }

  narrowExpandedTargetScope({
    event,
    explicitPlayoffIds: explicitlyScopedPlayoffIds,
    mappedSourceDivisionIds,
    divisionAliases,
  });
  for (const slot of event.timeSlots) {
    const rawIds = rawSlotScopeIds(slot);
    if (!rawIds?.length) {
      continue;
    }
    const scopedIds = rawIds.map((rawId) => resolveScopedDivisionId(rawId, divisionAliases));
    const currentDivisionIds = new Set(
      slot.divisions
        .map((division) => normalizeDivisionId(division.id))
        .filter((entry): entry is string => Boolean(entry)),
    );
    const inheritedDivisions: Division[] = [];
    for (const sourceDivisionId of scopedIds) {
      const mappedPlayoffIds = mappedPlayoffIdsByDivisionId.get(sourceDivisionId);
      if (!mappedPlayoffIds) {
        continue;
      }
      for (const playoffDivisionId of mappedPlayoffIds) {
        if (explicitlyScopedPlayoffIds.has(playoffDivisionId)) {
          continue;
        }
        const playoffDivision = playoffDivisionById.get(playoffDivisionId);
        if (!playoffDivision) {
          continue;
        }
        if (!currentDivisionIds.has(playoffDivisionId)) {
          slot.divisions.push(playoffDivision);
          currentDivisionIds.add(playoffDivisionId);
        }
        inheritedDivisions.push(playoffDivision);
      }
    }
    extendFieldEligibility(event, slot, inheritedDivisions);
  }
};
