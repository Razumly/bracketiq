/** @jest-environment node */

import {
  calculateMatchDurationMinutes,
  resolveMatchTimingPolicy,
} from '../matchTimingPolicy';

describe('resolveMatchTimingPolicy', () => {
  it('derives a set match duration and total occupied minutes from one timing policy', () => {
    expect(resolveMatchTimingPolicy({
      usesSets: true,
      setsPerMatch: 3,
      setDurationMinutes: 10,
      restTimeMinutes: 5,
      matchDurationMinutes: 999,
    })).toEqual({
      durationMinutes: 30,
      breakMinutes: 5,
      totalMinutes: 35,
      source: 'SEGMENTS',
    });
  });

  it('uses the non-set match duration when segments are disabled', () => {
    expect(calculateMatchDurationMinutes({
      usesSets: false,
      matchDurationMinutes: 35,
      restTimeMinutes: 5,
    })).toBe(35);
  });

  it('derives timing from an explicit segment override even when legacy sets are disabled', () => {
    expect(calculateMatchDurationMinutes({
      usesSets: false,
      segmentCount: 2,
      segmentLengthMinutes: 15,
      segmentBreakMinutes: 5,
      matchDurationMinutes: 35,
    })).toBe(35);
  });

  it('falls back deterministically when no duration is configured', () => {
    expect(resolveMatchTimingPolicy({})).toEqual({
      durationMinutes: 60,
      breakMinutes: 0,
      totalMinutes: 60,
      source: 'DEFAULT',
    });
  });
});
