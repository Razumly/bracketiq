import type { ScheduleDiagnosticEvidence } from "./scheduleDiagnostics";

export type ScheduleFailureFactor =
  | 'RESOURCE'
  | 'PLAYING_TEAM'
  | 'TEAM_DUTY'
  | 'NAMED_OFFICIAL_POSITION'
  | 'DIVISION_ORDER'
  | 'UNKNOWN';

export class ScheduleError extends Error {
  readonly restrictingFactor: ScheduleFailureFactor;
  readonly diagnosticEvidence: ScheduleDiagnosticEvidence[];
  readonly candidateCount: number;
  readonly searchExhaustive: boolean;

  constructor(
    message: string,
    restrictingFactor: ScheduleFailureFactor = 'UNKNOWN',
    options: {
      diagnosticEvidence?: ScheduleDiagnosticEvidence[];
      candidateCount?: number;
      searchExhaustive?: boolean;
    } = {},
  ) {
    super(message);
    this.name = 'ScheduleError';
    this.restrictingFactor = restrictingFactor;
    this.diagnosticEvidence = options.diagnosticEvidence ?? [];
    this.candidateCount = options.candidateCount ?? 0;
    this.searchExhaustive = options.searchExhaustive ?? false;
  }
}
