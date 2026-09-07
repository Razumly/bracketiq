import fixtures from '../../../../../test-fixtures/event-editor/complete-wire-fixtures.json';
import { createEventEditorCommandSchema } from '@/contracts/eventEditor';
import { mergeFixturePatch, feasiblePairs, rowPairs } from '@/test/eventEditor/pairwise';
import { webDraftRoundTrip } from '@/test/eventEditor/webRoundTrip';

describe('Event Editor pairwise wire coverage', () => {
  it('covers every feasible pair in the declared factors', () => {
    const covered = new Set(fixtures.pairwise.rows.flatMap(({ factors }) => rowPairs(factors)));
    expect(feasiblePairs(fixtures.pairwise.factors).filter((pair) => !covered.has(pair))).toEqual([]);
  });

  it.each(fixtures.pairwise.rows)('preserves $name through the site parser', ({ draftCase, patch }) => {
    const base = fixtures.cases[draftCase].command;
    const expected = { ...base, draft: mergeFixturePatch(base.draft, patch) };
    expect(createEventEditorCommandSchema.parse(expected)).toEqual(expected);
    expect(webDraftRoundTrip(createEventEditorCommandSchema.parse(expected).draft)).toEqual(expected.draft);
  });

  it.each(fixtures.boundaries)('checks the $name boundary', ({ draftCase, patch, isValid }) => {
    const base = fixtures.cases[draftCase].command;
    const command = { ...base, draft: mergeFixturePatch(base.draft, patch) };
    const result = createEventEditorCommandSchema.safeParse(command);
    expect(result.success).toBe(isValid);
    if (result.success) expect(result.data).toEqual(command);
  });

  it('preserves a fractional timed Match duration through the web editor', () => {
    const boundary = fixtures.boundaries.find(({ name }) => name === 'fractional-phase-values')!;
    const base = fixtures.cases[boundary.draftCase].command;
    const draft = createEventEditorCommandSchema.parse({ ...base, draft: mergeFixturePatch(base.draft, boundary.patch) }).draft;
    const actual = webDraftRoundTrip(draft);
    expect(actual.competition.matchDurationMinutes).toBe(42.5);
  });
});
