import { SUPPORTED_IMAGE_MIME_TYPES } from '@/lib/imageUploadPolicy';
import {
  deriveAffiliateHtmlArtifacts,
  evaluateAffiliateHtmlQuality,
  type AffiliateHtmlQuality,
} from './affiliateHtmlArtifacts';
import type {
  AffiliateSourceCaptureAttempt,
  AffiliateSourceCaptureClient,
  AffiliateSourceCaptureOptions,
  AffiliateSourcePageCapture,
  AffiliateSourcePageScreenshotEvidence,
  AffiliateSourceScreenshot,
  AffiliateSourceSearchClient,
  AffiliateSourceSearchOptions,
  AffiliateSourceSearchResult,
} from './affiliateProviderContracts';
import {
  ScrapingDogTransport,
  scrapingDogTimeoutMs,
  type ScrapingDogTransportResult,
} from './scrapingDogTransport';
const DEFAULT_SEARCH_LIMIT = 10;
const MAX_SEARCH_LIMIT = 20;
const DEFAULT_DYNAMIC_WAIT_MS = 2_500;
const MAX_DYNAMIC_WAIT_MS = 35_000;
const MIN_CAPTURE_TIMEOUT_MS = 30_000;
const MAX_CAPTURE_TIMEOUT_MS = 180_000;
const MIN_SCREENSHOT_TIMEOUT_MS = 10_000;
const MAX_SCREENSHOT_BYTES = 3 * 1024 * 1024;

const captureTimeoutMs = (value: number | undefined): number => {
  if (
    typeof value === 'number'
    && Number.isInteger(value)
    && value >= MIN_CAPTURE_TIMEOUT_MS
    && value <= MAX_CAPTURE_TIMEOUT_MS
  ) {
    return value;
  }
  return scrapingDogTimeoutMs();
};

type JsonRecord = Record<string, unknown>;

const recordValue = (value: unknown): JsonRecord => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
);

const stringValue = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const searchLimit = (value: number | undefined): number => {
  if (!Number.isInteger(value) || !value) return DEFAULT_SEARCH_LIMIT;
  return Math.max(1, Math.min(MAX_SEARCH_LIMIT, value));
};

const normalizedDomains = (values: string[] | undefined): Set<string> => new Set(
  (values ?? []).map((value) => value.trim().toLowerCase().replace(/^www\./, '')).filter(Boolean),
);

const hostnameFor = (value: string): string | null => {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
};

const domainMatches = (hostname: string, domains: Set<string>): boolean => (
  [...domains].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))
);

const toggledWwwUrl = (value: string): string | null => {
  try {
    const url = new URL(value);
    url.hostname = url.hostname.toLowerCase().startsWith('www.')
      ? url.hostname.slice(4)
      : `www.${url.hostname}`;
    return url.toString();
  } catch {
    return null;
  }
};

export const scrapingDogDynamicWaitMs = (): number => {
  const configured = Number.parseInt(process.env.SCRAPINGDOG_DYNAMIC_WAIT_MS ?? '', 10);
  return Number.isInteger(configured) && configured >= 0 && configured <= MAX_DYNAMIC_WAIT_MS
    ? configured
    : DEFAULT_DYNAMIC_WAIT_MS;
};

type ScrapingDogCapture = Readonly<{
  response: ScrapingDogTransportResult<string>;
  captureUrl: string;
  stealthModeUsed: boolean;
  wwwFallbackUsed: boolean;
}>;

type ScrapingDogCaptureBudget = Readonly<{
  timeoutMs: number;
  deadlineAt: number;
}>;

const remainingCaptureTimeoutMs = (budget: ScrapingDogCaptureBudget): number => {
  const remainingMs = budget.deadlineAt - Date.now();
  if (remainingMs <= 0) {
    throw new Error(`ScrapingDog capture timed out after ${budget.timeoutMs}ms.`);
  }
  return remainingMs;
};

type ScrapingDogStaticCaptureResult = Readonly<{
  attempt: AffiliateSourceCaptureAttempt;
  page: AffiliateSourcePageCapture | null;
}>;

type ScrapingDogRenderMode = 'AUTO' | 'STATIC' | 'JAVASCRIPT';

const buildScrapingDogStaticCapture = (
  url: string,
  profile: AffiliateSourceCaptureOptions['profile'],
  requestedRenderMode: ScrapingDogRenderMode,
  capture: ScrapingDogCapture,
): ScrapingDogStaticCaptureResult => {
  const staticResponse = capture.response;
  const staticQuality = evaluateAffiliateHtmlQuality(staticResponse.body, capture.captureUrl);
  const attempt: AffiliateSourceCaptureAttempt = {
    renderMode: 'STATIC',
    providerStatusCode: staticResponse.statusCode,
    elapsedMs: staticResponse.elapsedMs,
    estimatedCredits: 1,
    accepted: staticQuality.accepted,
    quality: staticQuality,
  };
  if (requestedRenderMode === 'STATIC' || staticQuality.accepted) {
    const artifacts = deriveAffiliateHtmlArtifacts(staticResponse.body, capture.captureUrl);
    return {
      attempt,
      page: {
        provider: 'SCRAPINGDOG',
        request: {
          ...staticResponse.request,
          ...(profile ? { captureProfile: profile } : {}),
        },
        response: staticResponse.response,
        requestedUrl: url,
        finalUrl: capture.captureUrl,
        isRedirectVerified: false,
        inferredCanonicalUrl: artifacts.inferredCanonicalUrl,
        providerStatusCode: staticResponse.statusCode,
        targetStatusCode: null,
        rawHtml: staticResponse.body,
        renderMode: 'STATIC',
        elapsedMs: staticResponse.elapsedMs,
        estimatedCredits: 1,
        warnings: [
          ...(capture.stealthModeUsed
            ? ['The standard ScrapingDog request failed; stealth mode was used.']
            : []),
          ...(capture.wwwFallbackUsed
            ? [`The requested host returned 404; capture used ${new URL(capture.captureUrl).hostname}.`]
            : []),
        ],
        providerJobId: staticResponse.headers['x-request-id'] ?? null,
        attempts: [attempt],
      },
    };
  }
  return { attempt, page: null };
};

const scrapingDogDynamicWarnings = (
  staticCapture: ScrapingDogCapture | null,
  dynamicCapture: ScrapingDogCapture,
  dynamicQuality: AffiliateHtmlQuality,
): string[] => {
  const warnings: string[] = [];
  if (staticCapture?.stealthModeUsed || dynamicCapture.stealthModeUsed) {
    warnings.push('The standard ScrapingDog request failed; stealth mode was used.');
  }
  if (staticCapture?.wwwFallbackUsed || dynamicCapture.wwwFallbackUsed) {
    warnings.push(
      `The requested host returned 404; capture used ${new URL(dynamicCapture.captureUrl).hostname}.`,
    );
  }
  if (staticCapture) {
    warnings.push(
      dynamicQuality.accepted
        ? 'Static HTML quality was insufficient; JavaScript rendering was used.'
        : 'JavaScript-rendered HTML still failed the content-quality gate.',
    );
  }
  return warnings;
};

const buildScrapingDogDynamicCapture = (
  url: string,
  profile: AffiliateSourceCaptureOptions['profile'],
  staticCapture: ScrapingDogCapture | null,
  dynamicCapture: ScrapingDogCapture,
  attempts: AffiliateSourceCaptureAttempt[],
): AffiliateSourcePageCapture => {
  const dynamicResponse = dynamicCapture.response;
  const dynamicQuality = evaluateAffiliateHtmlQuality(dynamicResponse.body, dynamicCapture.captureUrl);
  const dynamicAttempt: AffiliateSourceCaptureAttempt = {
    renderMode: 'JAVASCRIPT',
    providerStatusCode: dynamicResponse.statusCode,
    elapsedMs: dynamicResponse.elapsedMs,
    estimatedCredits: 5,
    accepted: dynamicQuality.accepted,
    quality: dynamicQuality,
  };
  attempts.push(dynamicAttempt);
  const artifacts = deriveAffiliateHtmlArtifacts(dynamicResponse.body, dynamicCapture.captureUrl);
  return {
    provider: 'SCRAPINGDOG',
    request: {
      ...dynamicResponse.request,
      ...(profile ? { captureProfile: profile } : {}),
    },
    response: dynamicResponse.response,
    requestedUrl: url,
    finalUrl: dynamicCapture.captureUrl,
    isRedirectVerified: false,
    inferredCanonicalUrl: artifacts.inferredCanonicalUrl,
    providerStatusCode: dynamicResponse.statusCode,
    targetStatusCode: null,
    rawHtml: dynamicResponse.body,
    renderMode: 'JAVASCRIPT',
    elapsedMs: (staticCapture?.response.elapsedMs ?? 0) + dynamicResponse.elapsedMs,
    estimatedCredits: staticCapture ? 6 : 5,

    warnings: scrapingDogDynamicWarnings(staticCapture, dynamicCapture, dynamicQuality),
    providerJobId: dynamicResponse.headers['x-request-id'] ?? null,
    attempts,
  };
};
const screenshotEvidenceFrom = (
  screenshot: AffiliateSourceScreenshot,
): AffiliateSourcePageScreenshotEvidence => {
  const mimeType = screenshot.mimeType.split(';', 1)[0].trim().toLowerCase();
  const sourceUrl = stringValue(screenshot.sourceUrl);
  const finalUrl = stringValue(screenshot.finalUrl);
  if (
    !sourceUrl
    || !finalUrl
    || screenshot.providerStatusCode < 200
    || screenshot.providerStatusCode >= 300
    || !SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)
    || screenshot.data.byteLength > MAX_SCREENSHOT_BYTES
  ) {
    throw new Error('ScrapingDog screenshot evidence failed its MIME, status, or size check.');
  }
  return {
    data: screenshot.data,
    mimeType,
    sourceUrl,
    finalUrl,
    statusCode: screenshot.providerStatusCode,
  };
};
type ScrapingDogTransportClient = Pick<
  ScrapingDogTransport,
  'requestText' | 'requestJson' | 'requestBuffer'
>;

export class ScrapingDogAffiliateClient implements AffiliateSourceSearchClient, AffiliateSourceCaptureClient {
  readonly provider = 'SCRAPINGDOG' as const;

  constructor(
    private readonly transport: ScrapingDogTransportClient = new ScrapingDogTransport(),
  ) {}

  private async requestScrapeOnce(
    url: string,
    params: Record<string, string | number | boolean>,
    budget: ScrapingDogCaptureBudget,
  ): Promise<{
    response: ScrapingDogTransportResult<string>;
    captureUrl: string;
    stealthModeUsed: boolean;
  }> {
    remainingCaptureTimeoutMs(budget);
    try {
      return {
        response: await this.transport.requestText({
          endpoint: '/scrape',
          targetUrl: url,
          params: { ...params, url },
          timeoutMs: budget.timeoutMs,
          deadlineAt: budget.deadlineAt,
        }),
        captureUrl: url,
        stealthModeUsed: false,
      };
    } catch (error) {
      remainingCaptureTimeoutMs(budget);
      const message = error instanceof Error ? error.message : String(error);
      if (!/stealth(?: mode)?|stealth_mode=true/i.test(message)) throw error;
      return {
        response: await this.transport.requestText({
          endpoint: '/scrape',
          targetUrl: url,
          params: {
            ...params,
            url,
            stealth_mode: true,
          },
          timeoutMs: budget.timeoutMs,
          deadlineAt: budget.deadlineAt,
        }),
        captureUrl: url,
        stealthModeUsed: true,
      };
    }
  }

  private async requestScrape(
    url: string,
    params: Record<string, string | number | boolean>,
    budget: ScrapingDogCaptureBudget,
  ): Promise<{
    response: ScrapingDogTransportResult<string>;
    captureUrl: string;
    stealthModeUsed: boolean;
    wwwFallbackUsed: boolean;
  }> {
    try {
      return {
        ...await this.requestScrapeOnce(url, params, budget),
        wwwFallbackUsed: false,
      };
    } catch (error) {
      remainingCaptureTimeoutMs(budget);
      const message = error instanceof Error ? error.message : String(error);
      const alternateUrl = /HTTP 404/i.test(message) ? toggledWwwUrl(url) : null;
      if (!alternateUrl) throw error;
      return {
        ...await this.requestScrapeOnce(alternateUrl, params, budget),
        wwwFallbackUsed: true,
      };
    }
  }


  async searchSources(
    query: string,
    options: AffiliateSourceSearchOptions = {},
  ): Promise<AffiliateSourceSearchResult> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) throw new Error('Affiliate source discovery query is required.');
    const response = await this.transport.requestJson({
      endpoint: '/google',
      params: {
        query: normalizedQuery,
        results: searchLimit(options.limit),
        page: 0,
        country: 'us',
        language: 'en',
        ...(options.location?.trim() ? { location: options.location.trim() } : {}),
      },
    });
    const payload = recordValue(response.body);
    const includeDomains = normalizedDomains(options.includeDomains);
    const excludeDomains = normalizedDomains(options.excludeDomains);
    const organicResults = Array.isArray(payload.organic_results) ? payload.organic_results : [];
    const rows = organicResults.flatMap((value) => {
      const row = recordValue(value);
      const url = stringValue(row.link) ?? stringValue(row.url);
      if (!url) return [];
      const hostname = hostnameFor(url);
      if (!hostname) return [];
      if (includeDomains.size && !domainMatches(hostname, includeDomains)) return [];
      if (excludeDomains.size && domainMatches(hostname, excludeDomains)) return [];
      return [{
        url,
        title: stringValue(row.title),
        description: stringValue(row.snippet) ?? stringValue(row.description),
        category: stringValue(row.source) ?? 'web',
      }];
    }).slice(0, searchLimit(options.limit));
    const providerJobId = stringValue(recordValue(payload.search_information).id)
      ?? response.headers['x-request-id']
      ?? null;
    const normalizedResponseData = {
      searchInformation: providerJobId ? { id: providerJobId } : null,
      organicResults: rows.map(({ url, title, description, category }) => ({
        url,
        title,
        description,
        category,
      })),
    };

    return {
      provider: this.provider,
      request: options.strategy
        ? { ...response.request, strategy: options.strategy }
        : response.request,
      response: { ...response.response, data: normalizedResponseData },
      rows,
      providerJobId,
      estimatedCredits: 5,
    };
  }

  private async requestScreenshot(
    url: string,
    timeoutMs: number,
    deadlineAt?: number,
  ): Promise<AffiliateSourceScreenshot> {
    const screenshot = await this.transport.requestBuffer({
      endpoint: '/screenshot',
      targetUrl: url,
      params: {
        url,
        fullPage: true,
        format: 'png',
        quality: 80,
        wait_until: 'networkidle',
      },
      timeoutMs,
      ...(deadlineAt === undefined ? {} : { deadlineAt }),
    });
    const mimeType = screenshot.headers['content-type']?.split(';', 1)[0].trim().toLowerCase() ?? '';
    if (
      screenshot.statusCode < 200
      || screenshot.statusCode >= 300
      || !SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)
      || screenshot.body.byteLength > MAX_SCREENSHOT_BYTES
    ) {
      throw new Error('ScrapingDog screenshot returned an unsupported or oversized image.');
    }
    return {
      provider: this.provider,
      request: screenshot.request,
      response: screenshot.response,
      sourceUrl: url,
      finalUrl: url,
      data: screenshot.body,
      mimeType,
      providerStatusCode: screenshot.statusCode,
      elapsedMs: screenshot.elapsedMs,
      estimatedCredits: 5,
    };
  }

  private async captureScreenshotForPage(
    page: AffiliateSourcePageCapture,
    budget: ScrapingDogCaptureBudget,
  ): Promise<AffiliateSourcePageCapture> {
    const providerArtifacts = page.providerArtifacts ?? {
      markdown: null,
      links: [],
      images: [],
      branding: null,
      screenshotUrl: null,
      metadata: {},
    };
    const remainingMs = Math.max(0, budget.deadlineAt - Date.now());
    if (remainingMs < MIN_SCREENSHOT_TIMEOUT_MS) {
      return {
        ...page,
        warnings: [
          ...page.warnings,
          `Screenshot capture skipped because the capture budget was exhausted for ${page.requestedUrl}.`,
        ],
        providerArtifacts: {
          ...providerArtifacts,
          screenshotEvidence: null,
        },
      };
    }
    try {
      const screenshot = await this.requestScreenshot(
        page.finalUrl || page.requestedUrl,
        remainingMs,
        budget.deadlineAt,
      );
      const screenshotEvidence = screenshotEvidenceFrom(screenshot);
      return {
        ...page,
        elapsedMs: page.elapsedMs + screenshot.elapsedMs,
        estimatedCredits: (page.estimatedCredits ?? 0) + (screenshot.estimatedCredits ?? 0),
        providerArtifacts: {
          ...providerArtifacts,
          screenshotEvidence,
          metadata: {
            ...recordValue(providerArtifacts.metadata),
            screenshotRequest: screenshot.request,
            screenshotResponse: screenshot.response,
            screenshotProviderStatusCode: screenshot.providerStatusCode,
            screenshotElapsedMs: screenshot.elapsedMs,
            screenshotEstimatedCredits: screenshot.estimatedCredits,
          },
        },
      };
    } catch (error) {
      return {
        ...page,
        warnings: [
          ...page.warnings,
          `Screenshot capture failed for ${page.requestedUrl}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        ],
        providerArtifacts: {
          ...providerArtifacts,
          screenshotEvidence: null,
        },
      };
    }
  }

  async captureSourcePage(
    url: string,
    captureOptions: AffiliateSourceCaptureOptions = {},
  ): Promise<AffiliateSourcePageCapture> {
    const profile = captureOptions.profile;
    const captureScreenshot = captureOptions.captureScreenshot === true;
    const timeoutMs = captureTimeoutMs(profile?.timeoutMs);
    const startedAt = Date.now();
    const budget: ScrapingDogCaptureBudget = {
      timeoutMs,
      deadlineAt: Number.isFinite(captureOptions.deadlineAt)
        ? Math.min(captureOptions.deadlineAt as number, startedAt + timeoutMs)
        : startedAt + timeoutMs,
    };
    const requestedRenderMode = profile?.renderMode ?? 'AUTO';
    const attempts: AffiliateSourceCaptureAttempt[] = [];
    const staticCapture = requestedRenderMode === 'JAVASCRIPT'
      ? null
      : await this.requestScrape(url, {
        dynamic: false,
        formats: 'html',
      }, budget);

    if (staticCapture) {
      const staticResult = buildScrapingDogStaticCapture(
        url,
        profile,
        requestedRenderMode,
        staticCapture,
      );
      attempts.push(staticResult.attempt);
      if (staticResult.page) {
        return captureScreenshot
          ? this.captureScreenshotForPage(staticResult.page, budget)
          : staticResult.page;
      }
    }
    const dynamicCapture = await this.requestScrape(url, {
      dynamic: true,
      formats: 'html',
      wait: profile?.waitMs ?? scrapingDogDynamicWaitMs(),
    }, budget);
    const page = buildScrapingDogDynamicCapture(
      url,
      profile,
      staticCapture,
      dynamicCapture,
      attempts,
    );
    return captureScreenshot
      ? this.captureScreenshotForPage(page, budget)
      : page;
  }

  async captureScreenshot(
    url: string,
    captureOptions: AffiliateSourceCaptureOptions = {},
  ): Promise<AffiliateSourceScreenshot> {
    const timeoutMs = captureTimeoutMs(captureOptions.profile?.timeoutMs);
    const startedAt = Date.now();
    const deadlineAt = Number.isFinite(captureOptions.deadlineAt)
      ? Math.min(captureOptions.deadlineAt as number, startedAt + timeoutMs)
      : startedAt + timeoutMs;
    return this.requestScreenshot(url, timeoutMs, deadlineAt);
  }
}

export const createScrapingDogAffiliateClient = (): ScrapingDogAffiliateClient => (
  new ScrapingDogAffiliateClient()
);
