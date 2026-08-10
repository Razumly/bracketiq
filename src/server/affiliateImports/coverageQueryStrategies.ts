import type { AffiliateSourceDiscoveryQuery } from './sourceDiscoveryTypes';
import { getAffiliateCoverageProfile, type AffiliateCoverageProfileKey } from './coverageProfiles';

export const AFFILIATE_COVERAGE_QUERY_STRATEGY_VERSION = 1;

export type AffiliateCoverageQueryStrategy = {
  key: string;
  familyKey: string;
  label: string;
  queryTerms: string;
  allowedProfiles: readonly AffiliateCoverageProfileKey[];
};

export type AffiliateCoverageQueryTarget = {
  cityGeoid: string;
  city: string;
  state: string;
  sportId: string | null;
  sportName: string | null;
  profileKey: AffiliateCoverageProfileKey;
  sourceType: string;
};

export const AFFILIATE_COVERAGE_QUERY_STRATEGIES: readonly AffiliateCoverageQueryStrategy[] = [
  {
    key: 'operator-web-v1',
    familyKey: 'operator-web',
    label: 'Operator-focused web search',
    queryTerms: 'official organization operator',
    allowedProfiles: ['clubs-programs', 'tryouts-evaluations', 'events-registration', 'league-operators', 'tournament-operators', 'camps-clinics-open-play', 'facilities-rentals'],
  },
  {
    key: 'governing-association-directory-v1',
    familyKey: 'governing-association-directory',
    label: 'Governing-association directory search',
    queryTerms: 'governing association member directory sanctioned clubs',
    allowedProfiles: ['clubs-programs', 'events-registration', 'league-operators', 'tournament-operators'],
  },
  {
    key: 'public-recreation-v1',
    familyKey: 'public-recreation',
    label: 'Public-recreation search',
    queryTerms: 'parks recreation department community programs',
    allowedProfiles: ['clubs-programs', 'tryouts-evaluations', 'events-registration', 'camps-clinics-open-play', 'facilities-rentals'],
  },
  {
    key: 'registration-platform-v1',
    familyKey: 'registration-platform',
    label: 'Registration-platform search',
    queryTerms: 'registration signup schedule program',
    allowedProfiles: ['tryouts-evaluations', 'events-registration', 'league-operators', 'tournament-operators', 'camps-clinics-open-play'],
  },
  {
    key: 'facility-booking-v1',
    familyKey: 'facility-booking',
    label: 'Facility-booking search',
    queryTerms: 'facility booking reservation availability',
    allowedProfiles: ['events-registration', 'camps-clinics-open-play', 'facilities-rentals'],
  },
] as const;

const STRATEGY_BY_KEY: Record<string, AffiliateCoverageQueryStrategy> = Object.fromEntries(
  AFFILIATE_COVERAGE_QUERY_STRATEGIES.map((strategy) => [strategy.key, strategy]),
);

export const getAffiliateCoverageQueryStrategy = (strategyKey: string): AffiliateCoverageQueryStrategy | null => (
  STRATEGY_BY_KEY[strategyKey] ?? null
);

export const allowedStrategiesForProfile = (profileKey: string): readonly AffiliateCoverageQueryStrategy[] => (
  AFFILIATE_COVERAGE_QUERY_STRATEGIES.filter((strategy) => strategy.allowedProfiles.includes(profileKey as AffiliateCoverageProfileKey))
);

export const renderAffiliateCoverageQuery = (
  target: AffiliateCoverageQueryTarget,
  strategy: AffiliateCoverageQueryStrategy,
): AffiliateSourceDiscoveryQuery => {
  const registeredStrategy = getAffiliateCoverageQueryStrategy(strategy.key);
  if (
    !registeredStrategy
    || registeredStrategy.familyKey !== strategy.familyKey
    || registeredStrategy.queryTerms !== strategy.queryTerms
  ) {
    throw new Error(`Strategy ${strategy.key} is not a registered governed strategy.`);
  }
  const profile = getAffiliateCoverageProfile(target.profileKey);
  if (!profile) throw new Error(`Unknown coverage query profile ${target.profileKey}.`);
  if (!registeredStrategy.allowedProfiles.includes(target.profileKey)) {
    throw new Error(`Strategy ${strategy.key} is not allowed for profile ${target.profileKey}.`);
  }
  const sport = target.sportName?.trim() ?? '';
  const location = `${target.city.trim()}, ${target.state.trim()}`;
  return {
    query: `${location} ${sport} ${profile.queryTerms} ${strategy.queryTerms}`.replace(/\s+/g, ' ').trim(),
    sportId: target.sportId,
    sportName: target.sportName,
    sourceType: target.sourceType,
    profileSourceTypes: [...profile.sourceTypes],
    templateKey: `PROFILE:${profile.key}`,
    targetCity: target.city,
    targetState: target.state,
    cityGeoid: target.cityGeoid,
    profileKey: profile.key,
    strategyKey: strategy.key,
    strategyFamilyKey: strategy.familyKey,
  };
};
