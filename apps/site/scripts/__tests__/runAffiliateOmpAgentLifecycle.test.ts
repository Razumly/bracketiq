/** @jest-environment node */

import {
  affiliateAgentInvocationDiagnosticFor,
  type AffiliateAgentInvocationDiagnostic,
} from "../../src/server/affiliateImports/affiliateAgentInvocationDiagnostics";
import { settleAffiliateOmpAgentLifecycle } from "../run-affiliate-omp-agent";

const preDisposalDiagnosticFor = (
  driverCode: string,
  terminalFrameObserved = false,
): AffiliateAgentInvocationDiagnostic => affiliateAgentInvocationDiagnosticFor({
  driverCode,
  promptOutcome: "RETURNED",
  assistantObserved: true,
  assistantStopReason: "stop",
  terminalFrameObserved,
});

describe("affiliate OMP agent lifecycle settlement", () => {
  it("emits one final diagnostic for a cleanup-only failure after cleanup settles", async () => {
    const cleanupError = new Error("cleanup detail must not be retained");
    const preDisposalDiagnostic = preDisposalDiagnosticFor("OMP_DRIVER_FAILED");
    let cleanupSettled = false;
    const emitDiagnostic = jest.fn(async (diagnostic: AffiliateAgentInvocationDiagnostic) => {
      expect(cleanupSettled).toBe(true);
      expect(diagnostic.driverCode).toBe("OMP_DRIVER_FAILED");
    });

    const settlement = await settleAffiliateOmpAgentLifecycle({
      primaryFailure: null,
      failureCode: null,
      preDisposalDiagnostic,
      snapshotDiagnostic: jest.fn(() => preDisposalDiagnostic),
      cleanup: async () => {
        cleanupSettled = true;
        throw cleanupError;
      },
      emitDiagnostic,
    });

    expect(settlement.error).toBe(cleanupError);
    expect(settlement.failureCode).toBe("OMP_DRIVER_FAILED");
    expect(settlement.diagnostic).toEqual(preDisposalDiagnostic);
    expect(emitDiagnostic).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(settlement.diagnostic)).not.toContain("cleanup detail");
  });

  it("keeps the primary failure when cleanup also fails and emits exactly once", async () => {
    const primaryError = new Error("primary failure");
    const cleanupError = new Error("cleanup failure");
    const preDisposalDiagnostic = preDisposalDiagnosticFor("OMP_SESSION_FAILED");
    const emitDiagnostic = jest.fn(async () => undefined);

    const settlement = await settleAffiliateOmpAgentLifecycle({
      primaryFailure: { error: primaryError },
      failureCode: "OMP_SESSION_FAILED",
      preDisposalDiagnostic,
      snapshotDiagnostic: jest.fn(() => preDisposalDiagnostic),
      cleanup: async () => {
        throw cleanupError;
      },
      emitDiagnostic,
    });

    expect(settlement.error).toBe(primaryError);
    expect(settlement.failureCode).toBe("OMP_SESSION_FAILED");
    expect(settlement.diagnostic).toEqual(preDisposalDiagnostic);
    expect(emitDiagnostic).toHaveBeenCalledTimes(1);
  });

  it("keeps an accepted terminal result unchanged when cleanup succeeds", async () => {
    const preDisposalDiagnostic = preDisposalDiagnosticFor("OMP_DRIVER_FAILED", true);
    const emitDiagnostic = jest.fn(async () => undefined);

    const settlement = await settleAffiliateOmpAgentLifecycle({
      primaryFailure: null,
      failureCode: null,
      preDisposalDiagnostic,
      snapshotDiagnostic: jest.fn(() => preDisposalDiagnostic),
      cleanup: async () => undefined,
      emitDiagnostic,
    });

    expect(settlement.error).toBeNull();
    expect(settlement.failureCode).toBeNull();
    expect(settlement.diagnostic).toBeNull();
    expect(emitDiagnostic).not.toHaveBeenCalled();
  });
});
