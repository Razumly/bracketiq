export type AffiliateGatewayHealthChecks = Readonly<{
  startup: () => Promise<void>;
  check: () => Promise<void>;
}>;

export const createAffiliateGatewayHealthChecks = (input: Readonly<{
  assertStartup: () => Promise<void>;
  checkLive: () => Promise<void>;
}>): AffiliateGatewayHealthChecks => {
  let startupComplete = false;

  return {
    startup: async () => {
      if (startupComplete) return;
      await input.assertStartup();
      await input.checkLive();
      startupComplete = true;
    },
    check: async () => {
      if (!startupComplete) {
        throw new Error('Affiliate gateway startup health has not completed.');
      }
      await input.checkLive();
    },
  };
};
