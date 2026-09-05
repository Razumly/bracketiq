// Run mobile commands through the site parser and compare the site editor and scheduler results.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { eventEditorDraftSchema, parseSaveEventEditorCommand, type EventEditorDraft } from '../src/contracts/eventEditor';
import { editorSnapshotToFormValues, emptyEditorSnapshot, eventFormValuesToEditorDraft } from '../src/app/events/[id]/schedule/components/eventForm/editorContractAdapters';
import { STAFFING_PRIORITIES } from '../src/server/officials/config';
import { scheduleEvent, ScheduleError } from '../src/server/scheduler/scheduleEvent';
import { Division, PlayingField, Team, Tournament, UserData } from '../src/server/scheduler/types';

const fixture = eventEditorDraftSchema.parse(JSON.parse(readFileSync(
  resolve('../../test-fixtures/event-editor/staffing-priority-draft.json'), 'utf8',
)));

function scheduleStaffing(draft: EventEditorDraft) {
  const division = new Division('OPEN', 'Open');
  const fields = Object.fromEntries([1, 2].map(index => {
    const field = new PlayingField({ id: `field-${index}`, name: `Court ${index}`, divisions: [division] });
    return [field.id, field];
  }));
  const teams = Object.fromEntries([1, 2, 3, 4].map(index => {
    const team = new Team({ id: `team-${index}`, name: `Team ${index}`, captainId: `captain-${index}`, division });
    return [team.id, team];
  }));
  const event = new Tournament({
    id: 'staffing-parity', name: 'Staffing parity', eventType: 'TOURNAMENT',
    start: new Date('2026-09-01T09:00:00Z'), end: new Date('2026-09-01T13:00:00Z'),
    noFixedEndDateTime: false,
    maxParticipants: 4, teamSignup: true, teams, divisions: [division], fields,
    officials: draft.staff.eventOfficials.map(official => new UserData({ id: official.userId, divisions: [division] })),
    staffingPriority: draft.staff.staffingPriority,
    doTeamsOfficiate: draft.staff.doTeamsOfficiate ?? false,
    teamOfficialsMaySwap: draft.staff.teamOfficialsMaySwap,
    officialPositions: draft.staff.officialPositions,
    eventOfficials: draft.staff.eventOfficials.map(official => {
      assert.ok(official.id, 'The staffing fixture must identify each Event Official.');
      return { ...official, id: official.id };
    }),
    doubleElimination: false, usesSets: false, matchDurationMinutes: 60, restTimeMinutes: 0,
  });
  try {
    const result = scheduleEvent({ event }, { log: () => {}, error: () => {} });
    const matchNumbers = new Map(result.matches.map(match => [match.id, match.matchId]));
    return {
      status: 'COMPLETE', restrictingFactor: null,
      warnings: result.warnings.map(warning => ({
        ...warning,
        matchIds: warning.matchIds.map(id => {
          const number = matchNumbers.get(id);
          assert.ok(number != null, 'Each warning must refer to a scheduled Match.');
          return number;
        }).sort((left, right) => left - right),
      })),
      matches: result.matches.map(match => ({
        matchId: match.matchId, start: match.start.toISOString(), end: match.end.toISOString(),
        fieldId: match.field?.id ?? null, team1Id: match.team1?.id ?? null, team2Id: match.team2?.id ?? null,
        teamOfficialId: match.teamOfficial?.id ?? null, officialAssignments: match.officialAssignments,
      })),
    };
  } catch (error) {
    if (!(error instanceof ScheduleError)) throw error;
    return { status: 'RESTRICTED', restrictingFactor: error.restrictingFactor, warnings: [], matches: [] };
  }
}

async function main() {
  let body = '';
  for await (const chunk of process.stdin) body += chunk;
  const input = JSON.parse(body);
  const command = parseSaveEventEditorCommand(input.command);
  assert.ok(Number.isInteger(input.caseIndex) && input.caseIndex >= 0 && input.caseIndex < 20);
  const priority = STAFFING_PRIORITIES[Math.floor(input.caseIndex / 4)]!;
  const hasTeamDuties = input.caseIndex % 4 >= 2;
  const hasPositions = input.caseIndex % 2 === 1;
  const expectedDraft: EventEditorDraft = {
    ...fixture,
    staff: {
      ...fixture.staff, staffingPriority: priority, doTeamsOfficiate: hasTeamDuties,
      teamOfficialsMaySwap: hasTeamDuties,
      officialPositions: hasPositions ? fixture.staff.officialPositions : [],
      eventOfficials: hasPositions ? fixture.staff.eventOfficials : [],
      officialIds: hasPositions ? fixture.staff.officialIds : [],
    },
  };
  const webDraft = eventFormValuesToEditorDraft(editorSnapshotToFormValues(emptyEditorSnapshot(expectedDraft)));
  assert.deepEqual(command.draft.staff, webDraft.staff);
  const mobileResult = scheduleStaffing(command.draft);
  assert.deepEqual(mobileResult, scheduleStaffing(webDraft));
  // Each group uses: no coverage, positions only, Team duties only, both.
  const expectedFactors = [
    'TEAM_DUTY', 'NAMED_OFFICIAL_POSITION', null, 'NAMED_OFFICIAL_POSITION',
    'TEAM_DUTY', 'TEAM_DUTY', null, null,
    null, 'NAMED_OFFICIAL_POSITION', null, 'NAMED_OFFICIAL_POSITION',
    null, null, null, null,
    'TEAM_DUTY', 'NAMED_OFFICIAL_POSITION', null, 'NAMED_OFFICIAL_POSITION',
  ];
  const expectedFactor = expectedFactors[input.caseIndex];
  assert.equal(mobileResult.restrictingFactor, expectedFactor);
  assert.equal(mobileResult.status, expectedFactor === null ? 'COMPLETE' : 'RESTRICTED');
  assert.equal(mobileResult.matches.length, expectedFactor === null ? 3 : 0);
  const expectedWarnings: string[] = [];
  if (priority === 'BEST_AVAILABLE_COVERAGE') expectedWarnings.push('UNRESOLVED_TEAM_DUTY');
  if (hasPositions && (priority === 'BEST_AVAILABLE_COVERAGE'
    || (priority === 'TEAM_COVERAGE_REQUIRED' && hasTeamDuties))) {
    expectedWarnings.push('UNRESOLVED_NAMED_OFFICIAL_POSITION');
  }
  assert.deepEqual(mobileResult.warnings.map(warning => warning.code), expectedWarnings);
  process.stdout.write(JSON.stringify({ draft: command.draft, ...mobileResult }));
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
