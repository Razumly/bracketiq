import {
  affiliateCoverageClaimGenerationSchema,
  type AffiliateCoverageClaimGeneration,
} from './coverageAgentContracts';

export type AffiliateCoverageQueueStatus = {
  totalJobs: number;
  claimableJobs: number;
  activeLeases: number;
  claimedWithoutLease: number;
  statusCounts: Record<string, number>;
  typeCounts: Record<string, number>;
};

export type AffiliateCoverageGoalLaunch = {
  claimGeneration?: AffiliateCoverageClaimGeneration;
};

type AffiliateCoverageLoopDependencies = {
  reconcile: () => Promise<unknown>;
  getStatus: () => Promise<AffiliateCoverageQueueStatus>;
  launchGoal: () => Promise<AffiliateCoverageGoalLaunch | void>;
};

export type AffiliateCoverageLoopCycle = {
  reconciliation: unknown;
  launchedGoal: boolean;
  claimGeneration: AffiliateCoverageClaimGeneration | null;
  queueBeforeLaunch: AffiliateCoverageQueueStatus;
  queueAfterLaunch: AffiliateCoverageQueueStatus;
};

export const runAffiliateCoverageLoopCycle = async (
  dependencies: AffiliateCoverageLoopDependencies,
): Promise<AffiliateCoverageLoopCycle> => {
  const reconciliation = await dependencies.reconcile();
  const queueBeforeLaunch = await dependencies.getStatus();
  if (queueBeforeLaunch.claimableJobs === 0) {
    return {
      reconciliation,
      launchedGoal: false,
      claimGeneration: null,
      queueBeforeLaunch,
      queueAfterLaunch: queueBeforeLaunch,
    };
  }

  // The caller keeps its advisory lock while this goal runs. Do not inspect or
  // launch another goal until the active goal exits.
  const launch = await dependencies.launchGoal();
  const claimGeneration = launch?.claimGeneration
    ? affiliateCoverageClaimGenerationSchema.parse(launch.claimGeneration)
    : null;
  await dependencies.reconcile();
  const queueAfterLaunch = await dependencies.getStatus();
  return {
    reconciliation,
    launchedGoal: true,
    claimGeneration,
    queueBeforeLaunch,
    queueAfterLaunch,
  };
};
