import {
  isBracketTeamCountEnabled,
  normalizeBracketTeamCount,
} from '@/lib/divisionTypes';
import { isGeneratedTournamentPoolRecord } from '@/server/events/tournamentPools';

import {
  LEGACY_OFFICIAL_SCHEDULING_MODE_BY_PRIORITY,
  normalizeOfficialSchedulingMode,
  normalizeStaffingPriority,
  type StaffingPriority,
} from '@/server/officials/config';


type EventResponseRecord = Record<string, unknown>;
export const normalizeEventBracketCountsResponse = <T extends EventResponseRecord>(
  response: T,
): T => {
  const record = response as EventResponseRecord;
  const eventType = String(record.eventType ?? '').trim().toUpperCase();
  const isBracketCountNormalizationEnabled = isBracketTeamCountEnabled(
    eventType,
    record.includePlayoffsOrPools ?? record.includePlayoffs,
  );
  if (eventType === 'TOURNAMENT') {
    record.maxParticipants = normalizeBracketTeamCount(record.maxParticipants);
  }
  if (isBracketCountNormalizationEnabled) {
    record.playoffTeamCount = normalizeBracketTeamCount(record.playoffTeamCount);
  }

  const normalizeDetails = (value: unknown): unknown => {
    if (!Array.isArray(value)) return value;
    return value.map((entry) => {
      if (!entry || typeof entry !== 'object') return entry;
      const detail = entry as EventResponseRecord;
      const isPlayoff = String(detail.kind ?? '').trim().toUpperCase() === 'PLAYOFF';
      const isGeneratedTournamentPool = isGeneratedTournamentPoolRecord({
        eventType,
        isPoolPlayEnabled: isBracketCountNormalizationEnabled,
        kind: detail.kind,
        isSystemGenerated: detail.isSystemGenerated,
        poolCount: detail.poolCount,
        playoffPlacementDivisionIds: detail.playoffPlacementDivisionIds,
      });
      if (isGeneratedTournamentPool) return entry;
      const normalized = { ...detail };
      if (isPlayoff || eventType === 'TOURNAMENT') {
        normalized.maxParticipants = normalizeBracketTeamCount(detail.maxParticipants);
      }
      if (isBracketCountNormalizationEnabled) {
        normalized.playoffTeamCount = normalizeBracketTeamCount(detail.playoffTeamCount);
      }
      return normalized;
    });
  };

  if (Array.isArray(record.divisionDetails)) {
    record.divisionDetails = normalizeDetails(record.divisionDetails);
  }
  if (Array.isArray(record.playoffDivisionDetails)) {
    record.playoffDivisionDetails = normalizeDetails(record.playoffDivisionDetails);
  }
  return response;
};


export const normalizeEventStaffingResponse = <T extends EventResponseRecord>(
  response: T,
): T => {
  normalizeEventBracketCountsResponse(response);
  const record = response as EventResponseRecord;
  const eventType = String(record.eventType ?? '').trim().toUpperCase();
  const legacyMode = normalizeOfficialSchedulingMode(record.officialSchedulingMode);
  const staffingPriority: StaffingPriority = eventType === 'TRYOUT'
    ? 'FULL_COVERAGE_WITH_CONFLICTS_ALLOWED'
    : normalizeStaffingPriority(
      record.staffingPriority,
      legacyMode,
    );
  record.staffingPriority = staffingPriority;
  record.officialSchedulingMode = LEGACY_OFFICIAL_SCHEDULING_MODE_BY_PRIORITY[staffingPriority];
  if (eventType === 'TRYOUT') {
    const sanitizeStaffInvites = (value: unknown): unknown => {
      if (!Array.isArray(value)) {
        return value;
      }
      return value.flatMap((entry) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          return [];
        }
        const invite = entry as EventResponseRecord;
        const normalized = { ...invite };
        let hasKnownRole = false;
        if (Array.isArray(invite.roles)) {
          const roles = invite.roles
            .map((role: unknown) => String(role).trim().toUpperCase())
            .filter((role) => role === 'ASSISTANT_HOST');
          normalized.roles = roles;
          hasKnownRole = roles.length > 0;
        }
        if (Array.isArray(invite.staffTypes)) {
          const staffTypes = invite.staffTypes
            .map((staffType: unknown) => String(staffType).trim().toUpperCase())
            .filter((staffType) => staffType === 'HOST');
          normalized.staffTypes = staffTypes;
          hasKnownRole = hasKnownRole || staffTypes.length > 0;
        }
        return hasKnownRole || 'roles' in invite || 'staffTypes' in invite
          ? [normalized]
          : [];
      });
    };
    record.officialPositions = [];
    record.officialIds = [];
    record.eventOfficials = [];
    record.staffInvites = sanitizeStaffInvites(record.staffInvites);
    record.pendingStaffInvites = sanitizeStaffInvites(record.pendingStaffInvites);
    record.doTeamsOfficiate = false;
    record.teamOfficialsMaySwap = false;
    record.teamCheckInMode = 'OFF';
    record.teamCheckInOpenMinutesBefore = 60;
    record.allowMatchRosterEdits = false;
    record.allowTemporaryMatchPlayers = false;
    record.autoCreatePointMatchIncidents = false;
  } else if (typeof record.doTeamsOfficiate !== 'boolean') {
    record.doTeamsOfficiate = legacyMode === 'TEAM_STAFFING';
  }
  return response;
};
