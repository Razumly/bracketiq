import {
  buildBracketDivisionOptions,
  getBracketMatchDivisionId,
  getBracketMatchSourceDivisionId,
} from '../bracketViewCore';

describe('bracket view division identity', () => {
  it('builds one option for each phase division when roots share one source division', () => {
    const sourceDivisionId = 'event_1__division__open';
    const goldPhaseDivisionId = 'event_1__division__playoff_gold';
    const silverPhaseDivisionId = 'event_1__division__playoff_silver';
    const matches = {
      goldFinal: {
        id: 'gold_final',
        matchId: 9,
        division: sourceDivisionId,
        sourceDivisionId,
        phaseDivisionId: goldPhaseDivisionId,
      },
      silverFinal: {
        id: 'silver_final',
        matchId: 10,
        division: sourceDivisionId,
        sourceDivisionId,
        phaseDivisionId: silverPhaseDivisionId,
      },
    };

    expect(getBracketMatchSourceDivisionId(matches.goldFinal)).toBe(sourceDivisionId);
    expect(getBracketMatchDivisionId(matches.goldFinal)).toBe(goldPhaseDivisionId);
    expect(buildBracketDivisionOptions(matches, {
      labelByDivisionKey: new Map([
        [goldPhaseDivisionId, 'Gold'],
        [silverPhaseDivisionId, 'Silver'],
      ]),
    })).toEqual([
      { value: goldPhaseDivisionId, label: 'Gold' },
      { value: silverPhaseDivisionId, label: 'Silver' },
    ]);
  });
});
