export type AffiliateProviderName = 'SCRAPINGDOG' | 'FIRECRAWL';

export type AffiliateSourceSearchStrategy = Readonly<{
  strategyKey: string;
  strategyFamilyKey?: string;
  profileKey?: string;
  queryTerms?: string;
}>;

export type AffiliateSourceCaptureProfile = Readonly<{
  profileKey?: string;
  renderMode?: 'AUTO' | 'STATIC' | 'JAVASCRIPT';
  waitMs?: number;
  timeoutMs?: number;
}>;

export type AffiliateSourceCaptureOptions = Readonly<{
  profile?: AffiliateSourceCaptureProfile;
  captureScreenshot?: boolean;
  /**
   * Internal orchestration deadline shared by URL validation, provider
   * fallback, and screenshot capture.
   */
  deadlineAt?: number;
}>;

export const affiliateSourceCaptureTimeoutMs = (
  profile: AffiliateSourceCaptureProfile | undefined,
): number => {
  const timeoutMs = profile?.timeoutMs;
  return typeof timeoutMs === 'number'
    && Number.isInteger(timeoutMs)
    && timeoutMs >= 30_000
    && timeoutMs <= 180_000
    ? timeoutMs
    : 180_000;
};

export const affiliateSourceCaptureDeadlineAt = (
  options: AffiliateSourceCaptureOptions,
  now = Date.now(),
): number => {
  const timeoutDeadline = now + affiliateSourceCaptureTimeoutMs(options.profile);
  return Number.isFinite(options.deadlineAt)
    ? Math.min(options.deadlineAt as number, timeoutDeadline)
    : timeoutDeadline;
};

export const affiliateSourceCaptureTimeoutError = (
  timeoutMs: number,
): Error => {
  const error = new Error(`Affiliate source capture timed out after ${timeoutMs}ms.`);
  error.name = 'AffiliateSourceCaptureTimeout';
  return error;
};

export const isAffiliateSourceCaptureTimeout = (error: unknown): boolean => (
  error instanceof Error && error.name === 'AffiliateSourceCaptureTimeout'
);

export const withAffiliateSourceCaptureDeadline = async <T>(
  operation: () => Promise<T>,
  deadlineAt: number,
  timeoutMs: number,
): Promise<T> => {
  const remainingMs = deadlineAt - Date.now();
  if (remainingMs <= 0) throw affiliateSourceCaptureTimeoutError(timeoutMs);
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(affiliateSourceCaptureTimeoutError(timeoutMs));
    }, remainingMs);
    const succeed = (value: T): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (Date.now() >= deadlineAt) {
        reject(affiliateSourceCaptureTimeoutError(timeoutMs));
      } else {
        resolve(value);
      }
    };
    const fail = (error: unknown): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (Date.now() >= deadlineAt) {
        reject(affiliateSourceCaptureTimeoutError(timeoutMs));
      } else {
        reject(error);
      }
    };
    try {
      operation().then(succeed, fail);
    } catch (error) {
      fail(error);
    }
  });
};
export type AffiliateSourceSearchOptions = {
  limit?: number;
  location?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
  strategy?: AffiliateSourceSearchStrategy;
};

export type AffiliateSourceSearchRow = {
  url: string;
  title: string | null;
  description: string | null;
  category: string | null;
};

export type AffiliateSourceSearchResult = {
  provider: AffiliateProviderName;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  rows: AffiliateSourceSearchRow[];
  providerJobId: string | null;
  estimatedCredits: number | null;
};
export type AffiliateSourcePageScreenshotEvidence = Readonly<{
  data: Buffer;
  mimeType: string;
  /** URL passed to the bounded screenshot downloader. */
  sourceUrl: string;
  /** URL reached by the bounded screenshot downloader after redirects. */
  finalUrl: string;
  statusCode: number;
}>;


export type AffiliateSourceProviderArtifacts = {
  markdown: string | null;
  links: string[];
  images: string[];
  branding: Record<string, unknown> | null;
  screenshotUrl: string | null;
  screenshotEvidence?: AffiliateSourcePageScreenshotEvidence | null;
  metadata: Record<string, unknown>;
};

export type AffiliateSourcePageCapture = {
  provider: AffiliateProviderName;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  requestedUrl: string;
  /**
   * The URL reached by the provider transport. This must not be populated
   * from an HTML canonical link; that value belongs in inferredCanonicalUrl.
   */
  finalUrl: string;
  /**
   * True only when the provider transport observed a network redirect while
   * resolving requestedUrl to finalUrl.
   */
  isRedirectVerified: boolean;
  /** Canonical URL suggested by captured HTML, retained as untrusted evidence. */
  inferredCanonicalUrl?: string | null;
  providerStatusCode: number;
  targetStatusCode: number | null;
  rawHtml: string;
  renderMode: 'STATIC' | 'JAVASCRIPT';
  elapsedMs: number;
  estimatedCredits: number | null;
  warnings: string[];
  providerJobId?: string | null;
  providerArtifacts?: AffiliateSourceProviderArtifacts;
  attempts?: AffiliateSourceCaptureAttempt[];
};

export type AffiliateSourceCaptureAttempt = {
  renderMode: 'STATIC' | 'JAVASCRIPT';
  providerStatusCode: number;
  elapsedMs: number;
  estimatedCredits: number | null;
  accepted: boolean;
  quality?: Record<string, unknown>;
  error?: string;
};

export type AffiliateSourceScreenshot = {
  provider: AffiliateProviderName;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  /** URL passed to the provider screenshot downloader. */
  sourceUrl: string;
  /** URL reached by the provider screenshot downloader after redirects. */
  finalUrl: string;
  data: Buffer;
  mimeType: string;
  providerStatusCode: number;
  elapsedMs: number;
  estimatedCredits: number | null;
};

export interface AffiliateSourceSearchClient {
  readonly provider: AffiliateProviderName;
  searchSources(
    query: string,
    options?: AffiliateSourceSearchOptions,
  ): Promise<AffiliateSourceSearchResult>;
}

export interface AffiliateSourceCaptureClient {
  readonly provider: AffiliateProviderName;
  captureSourcePage(
    url: string,
    options?: AffiliateSourceCaptureOptions,
  ): Promise<AffiliateSourcePageCapture>;
  captureScreenshot(
    url: string,
    options?: AffiliateSourceCaptureOptions,
  ): Promise<AffiliateSourceScreenshot>;
}
