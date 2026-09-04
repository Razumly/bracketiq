/** @jest-environment node */
import {
  AFFILIATE_DOWNSTREAM_WORKERS,
  isAffiliateDownstreamFleetReady,
} from "../affiliateFleetReadiness";

const NOW = new Date("2026-08-25T12:00:00.000Z");

const healthyWorkers = () => AFFILIATE_DOWNSTREAM_WORKERS.map((worker) => ({
  ...worker,
  status: "HEALTHY",
  leaseExpiresAt: new Date("2026-08-25T12:05:00.000Z"),
}));

describe("isAffiliateDownstreamFleetReady", () => {
  it("requires every expected worker and role to have an unexpired healthy lease", () => {
    expect(isAffiliateDownstreamFleetReady(healthyWorkers(), NOW)).toBe(true);
  });

  it("stays unavailable when a required worker is missing or expired", () => {
    const workers = healthyWorkers().filter((worker) => worker.workerId !== "supply-reviewer-2");
    expect(isAffiliateDownstreamFleetReady(workers, NOW)).toBe(false);

    const expiredWorkers = healthyWorkers().map((worker) =>
      worker.workerId === "mapping-producer-1"
        ? { ...worker, leaseExpiresAt: NOW }
        : worker,
    );
    expect(isAffiliateDownstreamFleetReady(expiredWorkers, NOW)).toBe(false);
  });

  it("does not accept a healthy worker under the wrong role", () => {
    const workers = healthyWorkers().map((worker) =>
      worker.workerId === "mapping-producer-1"
        ? { ...worker, role: "SUPPLY_REVIEWER" }
        : worker,
    );
    expect(isAffiliateDownstreamFleetReady(workers, NOW)).toBe(false);
  });
  it("rejects an unexpected healthy worker identity", () => {
    const workers = [
      ...healthyWorkers(),
      {
        workerId: "coverage-planner-1",
        role: "COVERAGE_PLANNER",
        status: "HEALTHY",
        leaseExpiresAt: new Date("2026-08-25T12:05:00.000Z"),
      },
    ];
    expect(isAffiliateDownstreamFleetReady(workers, NOW)).toBe(false);
  });

  it("rejects a duplicate healthy worker identity", () => {
    const workers = [...healthyWorkers(), healthyWorkers()[0]];
    expect(isAffiliateDownstreamFleetReady(workers, NOW)).toBe(false);
  });
});
