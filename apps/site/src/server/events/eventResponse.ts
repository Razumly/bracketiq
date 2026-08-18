import {
  LEGACY_OFFICIAL_SCHEDULING_MODE_BY_PRIORITY,
  normalizeOfficialSchedulingMode,
  normalizeStaffingPriority,
  type StaffingPriority,
} from '@/server/officials/config';


type EventResponseRecord = Record<string, unknown>;

export const normalizeEventStaffingResponse = <T extends EventResponseRecord>(
  response: T,
): T => {
  const record = response as EventResponseRecord;
  const legacyMode = normalizeOfficialSchedulingMode(record.officialSchedulingMode);
  const staffingPriority: StaffingPriority = normalizeStaffingPriority(
    record.staffingPriority,
    legacyMode,
  );
  record.staffingPriority = staffingPriority;
  record.officialSchedulingMode = LEGACY_OFFICIAL_SCHEDULING_MODE_BY_PRIORITY[staffingPriority];
  if (typeof record.doTeamsOfficiate !== 'boolean') {
    record.doTeamsOfficiate = legacyMode === 'TEAM_STAFFING';
  }
  return response;
};
