export type ScheduleFailureFactor =
  | 'RESOURCE'
  | 'PLAYING_TEAM'
  | 'TEAM_DUTY'
  | 'NAMED_OFFICIAL_POSITION'
  | 'UNKNOWN';

export class ScheduleError extends Error {
  readonly restrictingFactor: ScheduleFailureFactor;

  constructor(
    message: string,
    restrictingFactor: ScheduleFailureFactor = 'UNKNOWN',
  ) {
    super(message);
    this.name = 'ScheduleError';
    this.restrictingFactor = restrictingFactor;
  }
}
