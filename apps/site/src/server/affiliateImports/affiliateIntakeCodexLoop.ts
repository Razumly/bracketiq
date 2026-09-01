const LEGACY_RETIREMENT_MESSAGE =
  'Legacy affiliate launcher is paused pending governed cohort proof; use governed gateway admission.';

console.error(LEGACY_RETIREMENT_MESSAGE);
process.exit(78);

export type AffiliateMappingClaim = {
  claimed: boolean;
  jobId?: string;
  intakeId?: string;
  sourceKey?: string;
  workerId?: string;
  resumed?: boolean;
};

export declare function parseAffiliateMapperLoopIntervalSeconds(
  value: string | undefined,
  fallback?: number,
): number;
export declare function parseAffiliateMappingClaimOutput(
  output: string,
): AffiliateMappingClaim;
export declare function runAffiliateIntakeCodexLoop(
  options: {
    intervalSeconds?: number;
    maxCycles?: number;
  },
  dependencies: {
    claim: () => Promise<AffiliateMappingClaim>;
    reconcile?: () => Promise<unknown>;
    runGoal: (claim: AffiliateMappingClaim) => Promise<void>;
    sleep?: (milliseconds: number) => Promise<void>;
    onIdle?: (intervalSeconds: number) => void;
    onPendingWork?: (intervalSeconds: number) => void;
  },
): Promise<{ cycles: number; goalsStarted: number }>;
