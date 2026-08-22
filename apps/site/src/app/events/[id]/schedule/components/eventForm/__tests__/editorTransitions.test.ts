import { legacyEventToEditorDraft } from '../editorContractAdapters';
import {
  changeDivisionMode,
  changeEventType,
  changeStaffingPriority,
  changePoolPlay,
  changeRegistrationPaymentMode,
  changeScheduleMode,
  changeSport,
  disableRegistrationQuestions,
} from '../editorTransitions';
import { eventEditorFixtures } from '@/test/eventEditor/fixtures';

describe('editor transitions', () => {
  const source = eventEditorFixtures.find(({ name }) => name === 'questions and required documents')!.event;
  const draft = legacyEventToEditorDraft(source);

  it('changes one direct field without rehydrating the draft', () => {
    const next = changeEventType(draft, 'LEAGUE').draft;
    expect(next.basics.eventType).toBe('LEAGUE');
    expect(next.registration.questions).toEqual(draft.registration.questions);
    expect(next.resources.timeSlots).toEqual(draft.resources.timeSlots);
  });

  it('keeps catalog changes from clearing persisted values', () => {
    const next = changeSport(
      changeRegistrationPaymentMode(draft, 'ONLINE').draft,
      ['sport_volleyball'],
    ).draft;
    expect(next.basics.sportIds).toEqual(['sport_volleyball']);
    expect(next.registration.payment.mode).toBe('ONLINE');
    expect(next.registration.payment.priceCents).toBe(draft.registration.payment.priceCents);
    expect(next.registration.questions).toHaveLength(2);
  });

  it('requires an explicit end before entering fixed-end mode', () => {
    const generated = {
      ...draft,
      schedule: {
        mode: 'GENERATED_END' as const,
        endConstraint: null,
        generatedScheduleEnd: null,
        automatedScheduling: draft.schedule.automatedScheduling,
      },
    };
    const blocked = changeScheduleMode(generated, 'FIXED_END');
    expect(blocked.draft).toBe(generated);
    expect(blocked.confirmationFields).toEqual(['schedule.endConstraint']);

    const fixed = changeScheduleMode(generated, 'FIXED_END', '2026-09-10T20:00:00.000Z');
    expect(fixed.draft.schedule).toEqual({
      mode: 'FIXED_END',
      endConstraint: '2026-09-10T20:00:00.000Z',
      automatedScheduling: draft.schedule.automatedScheduling,
    });
  });

  it('changes pool rules on the selected league phase only', () => {
    const poolDraft = legacyEventToEditorDraft(
      eventEditorFixtures.find(({ name }) => name === 'multi-division league')!.event,
    );
    const target = poolDraft.competition.divisionDetails.find((division) => division.id === 'division_advanced')!;
    const next = changePoolPlay(poolDraft, target.id, false).draft;
    expect(next.competition.divisionDetails.find((division) => division.id === target.id)?.poolPlay).toBe(false);
    expect(next.competition.divisionDetails.find((division) => division.id === 'division_open')?.poolPlay)
      .toBe(poolDraft.competition.divisionDetails.find((division) => division.id === 'division_open')?.poolPlay);
    expect(next.competition.playoffDivisionDetails).toEqual(poolDraft.competition.playoffDivisionDetails);
  });

  it('reports explicit destructive transitions and keeps compatibility projections out of the draft', () => {
    const disabled = disableRegistrationQuestions(draft);
    expect(disabled.draft.registration.questions).toEqual([]);
    expect(disabled.confirmationFields).toEqual(['registration.questions']);

    const teamCoverage = changeStaffingPriority(draft, 'TEAM_COVERAGE_REQUIRED').draft;
    expect(teamCoverage.staff.staffingPriority).toBe('TEAM_COVERAGE_REQUIRED');
    expect(teamCoverage.staff.doTeamsOfficiate).toBe(draft.staff.doTeamsOfficiate);

    const multiple = changeDivisionMode(draft, false).draft;
    expect(multiple.participation.singleDivision).toBe(false);
  });
});
