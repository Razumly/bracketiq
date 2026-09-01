import { execFileSync } from 'node:child_process';

export type AffiliateDatasetEnvironment = 'local' | 'live';

export const configureAffiliateLiveDatabaseEnvironment = (
  liveDatabaseUrl: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string => {
  const normalizedUrl = liveDatabaseUrl?.trim();
  if (!normalizedUrl) {
    throw new Error('DATABASE_URL_LIVE is required with --live.');
  }
  env.DATABASE_URL = normalizedUrl;
  try {
    const sslMode = new URL(normalizedUrl).searchParams.get('sslmode')?.toLowerCase();
    if (sslMode === 'disable') {
      delete env.PG_SSL_REJECT_UNAUTHORIZED;
    } else {
      env.PG_SSL_REJECT_UNAUTHORIZED = 'false';
    }
  } catch {
    env.PG_SSL_REJECT_UNAUTHORIZED = 'false';
  }
  return normalizedUrl;
};

export const assertAffiliateLegacyLocalDatabase = (
  env: NodeJS.ProcessEnv = process.env,
): string => {
  if (env.AFFILIATE_LEGACY_LOCAL_ONLY?.trim() !== '1') {
    throw new Error(
      'AFFILIATE_LEGACY_LOCAL_ONLY=1 is required before a legacy affiliate launcher can write.',
    );
  }

  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required and must identify a verified local database.',
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error(
      'DATABASE_URL must be a valid PostgreSQL URL for a verified local database.',
    );
  }

  if (!['postgres:', 'postgresql:'].includes(parsedUrl.protocol)) {
    throw new Error(
      'DATABASE_URL must use the PostgreSQL protocol for a verified local database.',
    );
  }

  const hostname = parsedUrl.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!['localhost', '127.0.0.1', '::1'].includes(hostname)) {
    throw new Error(
      'Legacy affiliate launchers require a verified local database; operator or production DATABASE_URL is rejected.',
    );
  }
  const databaseName = decodeURIComponent(
    parsedUrl.pathname.replace(/^\/+/, ''),
  ).trim().toLowerCase();
  if (!databaseName) {
    throw new Error(
      'DATABASE_URL must identify a named verified local database.',
    );
  }
  if (['bracketiq', 'production'].includes(databaseName)) {
    throw new Error(
      `Legacy affiliate launchers reject the production database "${databaseName}".`,
    );
  }

  return databaseUrl;
};

export const resolveAffiliateDatasetEnvironment = (input: {
  explicitEnvironment?: string;
  useLiveDatabase: boolean;
}): AffiliateDatasetEnvironment => {
  const explicitEnvironment = input.explicitEnvironment?.trim();
  if (
    explicitEnvironment
    && explicitEnvironment !== 'local'
    && explicitEnvironment !== 'live'
  ) {
    throw new Error('Dataset environment must be "local" or "live".');
  }
  return explicitEnvironment
    ? explicitEnvironment as AffiliateDatasetEnvironment
    : input.useLiveDatabase
      ? 'live'
      : 'local';
};

export const resolveAffiliateRepositoryCommit = (input: {
  explicitCommit?: string;
  repositoryRoot?: string;
  readGitCommit?: () => string;
} = {}): string => {
  const explicitCommit = input.explicitCommit?.trim();
  if (explicitCommit) return explicitCommit;

  const repositoryCommit = (
    input.readGitCommit
      ?? (() => execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: input.repositoryRoot ?? process.cwd(),
        encoding: 'utf8',
      }))
  )().trim();
  if (!repositoryCommit) {
    throw new Error('Repository commit could not be resolved.');
  }
  return repositoryCommit;
};
