export const isOutboundProvidersDisabled = (): boolean => (
  ['1', 'true', 'yes'].includes(
    process.env.MVP_TEST_DISABLE_OUTBOUND_PROVIDERS?.trim().toLowerCase() ?? '',
  )
);
