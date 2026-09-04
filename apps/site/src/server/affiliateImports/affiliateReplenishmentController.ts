import {
  affiliateSupplyDatabase,
  loadActiveAffiliateSupplyContracts,
  reconcileAffiliateReplenishment,
  type AffiliateReplenishmentReconciliationResult,
  type AffiliateSupplyDatabase,
} from './affiliateSupplyPersistence';
import type { AffiliateSupplyContractPolicy } from './affiliateSupplyLifecycle';

export type AffiliateGovernedReplenishmentControllerInput = Readonly<{
  db?: AffiliateSupplyDatabase;
  contract?: AffiliateSupplyContractPolicy;
  rolloutCohort?: string;
  isContractSafe?: boolean;
  now?: Date;
  enabled?: boolean;
}>;

export type AffiliateGovernedReplenishmentControllerResult = Readonly<{
  status: 'DISABLED' | 'HALTED' | 'RECONCILED';
  reason?: 'DISABLED_BY_CONFIGURATION' | 'NO_ACTIVE_SUPPLY_CONTRACT';
  rolloutCohorts: readonly string[];
  reconciliations: readonly AffiliateReplenishmentReconciliationResult[];
}>;

const configuredBoolean = (value: string | undefined, fallback: boolean): boolean => {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return fallback;
};

export const isAffiliateGovernedReplenishmentEnabled = (): boolean => configuredBoolean(
  process.env.AFFILIATE_GOVERNED_REPLENISHMENT_ENABLED,
  false,
);

const activePoliciesFor = async (
  input: AffiliateGovernedReplenishmentControllerInput,
  database: AffiliateSupplyDatabase,
): Promise<readonly AffiliateSupplyContractPolicy[]> => {
  if (input.contract) return [input.contract];
  const activeContracts = await loadActiveAffiliateSupplyContracts({ db: database });
  return activeContracts
    .map((activeContract) => activeContract.policy)
    .filter((policy) => !input.rolloutCohort || policy.rolloutCohort === input.rolloutCohort);
};

export const runAffiliateGovernedReplenishment = async (
  input: AffiliateGovernedReplenishmentControllerInput = {},
): Promise<AffiliateGovernedReplenishmentControllerResult> => {
  const enabled = input.enabled
    ?? isAffiliateGovernedReplenishmentEnabled();
  if (!enabled) {
    return {
      status: 'DISABLED',
      reason: 'DISABLED_BY_CONFIGURATION',
      rolloutCohorts: [],
      reconciliations: [],
    };
  }
  const database = input.db ?? affiliateSupplyDatabase();
  const policies = await activePoliciesFor(input, database);
  if (policies.length === 0) {
    return {
      status: 'HALTED',
      reason: 'NO_ACTIVE_SUPPLY_CONTRACT',
      rolloutCohorts: [],
      reconciliations: [],
    };
  }
  const isContractSafe = input.isContractSafe
    ?? configuredBoolean(process.env.AFFILIATE_SUPPLY_CONTRACT_SAFE, true);
  const reconciliations = await Promise.all(policies.map((contract) => (
    reconcileAffiliateReplenishment({
      contract,
      rolloutCohort: contract.rolloutCohort,
      isContractSafe,
      db: database,
      now: input.now,
    })
  )));
  return {
    status: 'RECONCILED',
    rolloutCohorts: policies.map((policy) => policy.rolloutCohort),
    reconciliations,
  };
};
