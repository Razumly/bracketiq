/** @jest-environment node */

import { createAffiliateGatewayHealthChecks } from "../affiliateGatewayHealth";

describe("affiliate gateway health checks", () => {
  it("runs startup checks once before recurring health checks", async () => {
    const assertStartup = jest.fn(async () => undefined);
    const checkLive = jest.fn(async () => undefined);
    const health = createAffiliateGatewayHealthChecks({ assertStartup, checkLive });

    await expect(health.check()).rejects.toThrow("startup health has not completed");
    await health.startup();
    await health.startup();
    await health.check();

    expect(assertStartup).toHaveBeenCalledTimes(1);
    expect(checkLive).toHaveBeenCalledTimes(2);
  });

  it("does not mark startup complete when a startup check fails", async () => {
    const assertStartup = jest
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("preflight failed"))
      .mockResolvedValueOnce(undefined);
    const checkLive = jest.fn(async () => undefined);
    const health = createAffiliateGatewayHealthChecks({ assertStartup, checkLive });

    await expect(health.startup()).rejects.toThrow("preflight failed");
    await health.startup();

    expect(assertStartup).toHaveBeenCalledTimes(2);
    expect(checkLive).toHaveBeenCalledTimes(1);
  });
  it("does not reapply startup freshness to recurring health", async () => {
    const assertStartup = jest
      .fn<() => Promise<void>>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(new Error("preflight expired"));
    const checkLive = jest.fn(async () => undefined);
    const health = createAffiliateGatewayHealthChecks({ assertStartup, checkLive });

    await health.startup();
    await expect(health.check()).resolves.toBeUndefined();

    expect(assertStartup).toHaveBeenCalledTimes(1);
    expect(checkLive).toHaveBeenCalledTimes(2);
  });
});
