export const AFFILIATE_DOWNSTREAM_WORKERS = [
  { workerId: "mapping-producer-1", role: "MAPPING_PRODUCER" },
  { workerId: "mapping-producer-2", role: "MAPPING_PRODUCER" },
  { workerId: "supply-reviewer-1", role: "SUPPLY_REVIEWER" },
  { workerId: "supply-reviewer-2", role: "SUPPLY_REVIEWER" },
] as const;

type AffiliateDownstreamWorkerHealth = Readonly<{
  workerId: string;
  role: string;
  status: string;
  leaseExpiresAt: Date | null;
}>;

export const isAffiliateDownstreamFleetReady = (
  workers: readonly AffiliateDownstreamWorkerHealth[],
  now: Date,
): boolean => {
  const healthyWorkerKeys = workers
    .filter((worker) =>
      worker.status === "HEALTHY" &&
      worker.leaseExpiresAt !== null &&
      worker.leaseExpiresAt > now,
    )
    .map((worker) => `${worker.workerId}:${worker.role}`);
  const uniqueHealthyWorkerKeys = new Set(healthyWorkerKeys);

  return healthyWorkerKeys.length === AFFILIATE_DOWNSTREAM_WORKERS.length
    && uniqueHealthyWorkerKeys.size === healthyWorkerKeys.length
    && AFFILIATE_DOWNSTREAM_WORKERS.every(({ workerId, role }) =>
      uniqueHealthyWorkerKeys.has(`${workerId}:${role}`),
    );
};
