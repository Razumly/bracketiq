const LEGACY_RETIREMENT_MESSAGE =
  'Legacy affiliate launcher is paused pending governed cohort proof; use governed gateway admission.';

console.error(LEGACY_RETIREMENT_MESSAGE);
process.exit(78);

export type CodexAffiliateIngestionResult = {
  schemaVersion: number;
  [key: string]: unknown;
};
export type CodexAffiliateIngestionResultV1 = CodexAffiliateIngestionResult;
export type CodexAffiliateIngestionResultV2 = CodexAffiliateIngestionResult;

export declare const codexAffiliateIngestionResultSchema: {
  parse(input: unknown): CodexAffiliateIngestionResult;
};
