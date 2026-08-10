export type AffiliateCoverageProfileKey =
  | 'clubs-programs'
  | 'tryouts-evaluations'
  | 'events-registration'
  | 'league-operators'
  | 'tournament-operators'
  | 'camps-clinics-open-play'
  | 'facilities-rentals';

export type AffiliateCoverageProfile = {
  key: AffiliateCoverageProfileKey;
  sourceTypes: readonly string[];
  queryTerms: string;
  weight: number;
};

export const AFFILIATE_COVERAGE_PROFILES: readonly AffiliateCoverageProfile[] = [
  { key: 'clubs-programs', sourceTypes: ['CLUB'], queryTerms: 'clubs academies competitive programs', weight: 0.9 },
  { key: 'tryouts-evaluations', sourceTypes: ['TRYOUT'], queryTerms: 'tryouts evaluations', weight: 0.75 },
  { key: 'events-registration', sourceTypes: ['EVENT'], queryTerms: 'events registration organizer', weight: 0.85 },
  { key: 'league-operators', sourceTypes: ['LEAGUE'], queryTerms: 'league operator leagues registration association', weight: 1 },
  { key: 'tournament-operators', sourceTypes: ['TOURNAMENT'], queryTerms: 'tournament organizer tournaments cups championships series', weight: 1 },
  { key: 'camps-clinics-open-play', sourceTypes: ['CAMP', 'CLINIC', 'OPEN_PLAY'], queryTerms: 'camps clinics open play pickup', weight: 0.75 },
  { key: 'facilities-rentals', sourceTypes: ['RENTAL'], queryTerms: 'field court facility rentals reservations', weight: 0.9 },
] as const;

export const AFFILIATE_COVERAGE_PROFILE_BY_KEY: Record<AffiliateCoverageProfileKey, AffiliateCoverageProfile> = Object.fromEntries(
  AFFILIATE_COVERAGE_PROFILES.map((profile) => [profile.key, profile]),
) as Record<AffiliateCoverageProfileKey, AffiliateCoverageProfile>;

export const getAffiliateCoverageProfile = (profileKey: string): AffiliateCoverageProfile | null => (
  AFFILIATE_COVERAGE_PROFILES.find((profile) => profile.key === profileKey) ?? null
);
