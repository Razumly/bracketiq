import { deriveAffiliateHtmlArtifacts } from './affiliateHtmlArtifacts';
import { SUPPORTED_IMAGE_MIME_TYPES } from '@/lib/imageUploadPolicy';
import Firecrawl, {
  type Document,
  type MapData,
  type ScrapeOptions,
  type SearchData,
} from '@mendable/firecrawl-js';
import {
  affiliateSourceCaptureDeadlineAt,
  type AffiliateSourceCaptureClient,
  type AffiliateSourceCaptureOptions,
  type AffiliateSourcePageCapture,
  type AffiliateSourcePageScreenshotEvidence,
  type AffiliateSourceProviderArtifacts,
  type AffiliateSourceScreenshot,
  type AffiliateSourceSearchClient,
  type AffiliateSourceSearchOptions,
  type AffiliateSourceSearchResult,
} from './affiliateProviderContracts';
import { fetchBoundedPublicResource, type BoundedPublicResource } from './sourceIntakeUrlSafety';
import { readBoundedByteStream } from './boundedByteStream';

const DEFAULT_MAP_LIMIT = 50;
const MAX_MAP_LIMIT = 50;
const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_SEARCH_LIMIT = 10;
const MAX_SEARCH_LIMIT = 20;
const MAX_SEARCH_TIMEOUT_MS = 60_000;
const MAX_CAPTURE_WAIT_MS = 35_000;
const MAX_SCREENSHOT_BYTES = 3 * 1024 * 1024;
const MAX_SCRAPE_RESPONSE_BYTES = 20 * 1024 * 1024;
const MAX_CAPTURE_METADATA_ENTRIES = 32;
const MAX_CAPTURE_METADATA_KEY_BYTES = 256;
const MAX_CAPTURE_METADATA_STRING_BYTES = 2_048;
const MAX_FIRECRAWL_RETRIES = 1;
const MAX_FIRECRAWL_RETRY_DELAY_MS = 10_000;
const firecrawlTimeoutMs = (): number => {
  const configured = Number.parseInt(process.env.FIRECRAWL_TIMEOUT_MS ?? '', 10);
  return Number.isInteger(configured) && configured >= 30_000 && configured <= 180_000
    ? configured
    : DEFAULT_TIMEOUT_MS;
};

export type FirecrawlMappedLink = {
  url: string;
  title?: string | null;
  description?: string | null;
};

export type FirecrawlMapResult = {
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  links: FirecrawlMappedLink[];
  providerJobId: string | null;
};
export type FirecrawlCaptureResult = {
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  normalized: {
    finalUrl: string;
    statusCode: number | null;
    markdown: string | null;
    rawHtml: string | null;
    links: string[];
    images: string[];
    branding: Record<string, unknown> | null;
    screenshotUrl: string | null;
    screenshotEvidence: AffiliateSourcePageScreenshotEvidence | null;
    warnings: string[];
    metadata: Record<string, unknown>;
  };
  providerJobId: string | null;
};

export type FirecrawlSourceSearchOptions = AffiliateSourceSearchOptions;

export type FirecrawlSourceSearchResult = AffiliateSourceSearchResult;
export interface AffiliateFirecrawlClient {
  searchSources(query: string, options?: FirecrawlSourceSearchOptions): Promise<FirecrawlSourceSearchResult>;
  mapSourceUrls(url: string, options?: { limit?: number; search?: string }): Promise<FirecrawlMapResult>;
  scrapeSourcePage(url: string, options?: AffiliateSourceCaptureOptions): Promise<FirecrawlCaptureResult>;
  captureScreenshot?: (
    url: string,
    options?: AffiliateSourceCaptureOptions,
  ) => Promise<AffiliateSourceScreenshot>;
}


const serializableRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
};

const stringValue = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const numberValue = (value: unknown): number | null => (
  typeof value === 'number' && Number.isFinite(value) ? value : null
);

const inferredCanonicalUrlFromHtml = (
  rawHtml: string,
  finalUrl: string,
): string | null => {
  if (!rawHtml.trim()) return null;
  try {
    return deriveAffiliateHtmlArtifacts(rawHtml, finalUrl).inferredCanonicalUrl;
  } catch {
    return null;
  }
};

const mapLimit = (value: number | undefined): number => {
  if (!Number.isInteger(value) || !value) return DEFAULT_MAP_LIMIT;
  return Math.max(1, Math.min(MAX_MAP_LIMIT, value));
};

const searchLimit = (value: number | undefined): number => {
  if (!Number.isInteger(value) || !value) return DEFAULT_SEARCH_LIMIT;
  return Math.max(1, Math.min(MAX_SEARCH_LIMIT, value));
};

const searchTimeoutMs = (): number => Math.min(firecrawlTimeoutMs(), MAX_SEARCH_TIMEOUT_MS);
const isCaptureTimeoutWithinBounds = (value: number | undefined): value is number => (
  value !== undefined && Number.isInteger(value) && value >= 30_000 && value <= 180_000
);

const captureTimeoutMs = (profile: AffiliateSourceCaptureOptions['profile']): number => {
  const timeoutMs = profile?.timeoutMs;
  return isCaptureTimeoutWithinBounds(timeoutMs) ? timeoutMs : firecrawlTimeoutMs();
};

const captureWaitFor = (profile: AffiliateSourceCaptureOptions['profile']): number | undefined => (
  Number.isInteger(profile?.waitMs)
    && (profile?.waitMs ?? 0) > 0
    && (profile?.waitMs ?? 0) <= MAX_CAPTURE_WAIT_MS
    ? profile?.waitMs
    : undefined
);

const awaitWithTimeout = <T>(
  operation: Promise<T>,
  timeoutMs: number,
  message: string,
  onTimeout?: () => void,
): Promise<T> => new Promise<T>((resolve, reject) => {
  const timeout = setTimeout(() => {
    onTimeout?.();
    reject(new Error(message));
  }, timeoutMs);
  operation.then(
    (value) => {
      clearTimeout(timeout);
      resolve(value);
    },
    (error: unknown) => {
      clearTimeout(timeout);
      reject(error);
    },
  );
});

const firecrawlRetryDelayMs = (response: Response, attempt: number): number => {
  const retryAfter = Number.parseInt(response.headers?.get?.('retry-after') ?? '', 10);
  if (Number.isFinite(retryAfter) && retryAfter >= 0) {
    return Math.min(MAX_FIRECRAWL_RETRY_DELAY_MS, retryAfter * 1_000);
  }
  return Math.min(MAX_FIRECRAWL_RETRY_DELAY_MS, 500 * (2 ** attempt));
};

const firecrawlRetryableResponse = (response: Response, attempt: number): boolean => (
  attempt < MAX_FIRECRAWL_RETRIES
  && (
    response.status === 429
    || (response.status >= 500 && response.status < 600)
  )
);
const recordValue = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const FIRECRAWL_METADATA_EXCLUDED_KEYS: Record<string, true> = {
  rawhtml: true,
  markdown: true,
  links: true,
  images: true,
  branding: true,
  screenshot: true,
};

export const boundedFirecrawlMetadata = (value: unknown): Record<string, unknown> => (
  Object.fromEntries(
    Object.entries(recordValue(value))
      .filter(([key]) => (
        Buffer.byteLength(key, 'utf8') <= MAX_CAPTURE_METADATA_KEY_BYTES
        && !FIRECRAWL_METADATA_EXCLUDED_KEYS[key.toLowerCase()]
      ))
      .flatMap(([key, entry]) => {
        if (typeof entry === 'string') {
          const normalized = entry.trim();
          return normalized && Buffer.byteLength(normalized, 'utf8') <= MAX_CAPTURE_METADATA_STRING_BYTES
            ? [[key, normalized] as [string, unknown]]
            : [];
        }
        if (typeof entry === 'number' && Number.isFinite(entry)) {
          return [[key, entry] as [string, unknown]];
        }
        if (typeof entry === 'boolean') return [[key, entry] as [string, unknown]];
        return [];
      })
      .slice(0, MAX_CAPTURE_METADATA_ENTRIES),
  )
);

type BoundedFirecrawlScrapeResult = Readonly<{
  document: Document;
  statusCode: number;
}>;

const scrapeWithBoundedFetch = async (
  fetchImpl: typeof fetch | null,
  apiUrl: string,
  apiKey: string,
  url: string,
  options: ScrapeOptions,
  timeoutMs: number,
  operationLabel: string,
  deadlineAt = Date.now() + timeoutMs,
): Promise<BoundedFirecrawlScrapeResult> => {
  if (typeof fetchImpl !== 'function') throw new Error('Global fetch is not available.');
  const controller = new AbortController();
  const timeoutError = (): Error => new Error(`Firecrawl ${operationLabel} timed out after ${timeoutMs}ms.`);
  const throwIfTimedOut = (): void => {
    if (controller.signal.aborted || Date.now() >= deadlineAt) {
      controller.abort();
      throw timeoutError();
    }
  };
  const timeout = setTimeout(() => controller.abort(), Math.max(1, deadlineAt - Date.now()));
  const sleepUntilDeadline = async (delayMs: number): Promise<void> => {
    throwIfTimedOut();
    const remainingMs = Math.max(1, deadlineAt - Date.now());
    const waitMs = Math.min(delayMs, remainingMs);
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const cleanup = (): void => {
        clearTimeout(waitTimer);
        clearTimeout(deadlineTimer);
      };
      const finish = (callback: () => void): void => {
        if (settled) return;
        settled = true;
        cleanup();
        try {
          callback();
        } catch (error) {
          reject(error);
        }
      };
      const waitTimer = setTimeout(() => finish(() => {
        throwIfTimedOut();
        resolve();
      }), waitMs);
      const deadlineTimer = setTimeout(() => {
        settled = true;
        cleanup();
        controller.abort();
        reject(timeoutError());
      }, remainingMs);
    });
  };
  try {
    for (let attempt = 0; attempt <= MAX_FIRECRAWL_RETRIES; attempt += 1) {
      throwIfTimedOut();
      const response = await fetchImpl(`${apiUrl}/v2/scrape`, {
        method: 'POST',
        headers: {
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: url.trim(), ...options }),
        signal: controller.signal,
      });
      throwIfTimedOut();
      if (firecrawlRetryableResponse(response, attempt)) {
        try {
          await response.body?.cancel();
        } catch {
          // The retry does not depend on consuming a failed response body.
        }
        await sleepUntilDeadline(firecrawlRetryDelayMs(response, attempt));
        continue;
      }
      if (!response.body || typeof response.body.getReader !== 'function') {
        throw new Error('Firecrawl response body stream is unavailable.');
      }
      let bytes: Buffer;
      try {
        bytes = await readBoundedByteStream(response.body, MAX_SCRAPE_RESPONSE_BYTES, controller.signal);
      } catch (error) {
        if (
          error instanceof Error
          && error.message === `Response body exceeds the ${MAX_SCRAPE_RESPONSE_BYTES} byte limit.`
        ) {
          throw new Error(`Firecrawl ${operationLabel} response exceeds the ${MAX_SCRAPE_RESPONSE_BYTES} byte limit.`);
        }
        throw error;
      }
      throwIfTimedOut();
      let payload: unknown;
      try {
        payload = JSON.parse(bytes.toString('utf8'));
      } catch {
        throw new Error(`Firecrawl ${operationLabel} returned invalid JSON.`);
      }
      const payloadRecord = recordValue(payload);
      const data = payloadRecord.data;
      if (
        !response.ok
        || payloadRecord.success !== true
        || !data
        || typeof data !== 'object'
        || Array.isArray(data)
      ) {
        const message = stringValue(payloadRecord.error);
        const suffix = message ? `: ${message.slice(0, 300)}` : '';
        throw new Error(`Firecrawl ${operationLabel} failed with HTTP ${response.status}${suffix}`);
      }
      return {
        document: data as Document,
        statusCode: response.status,
      };
    }
    throw new Error(`Firecrawl ${operationLabel} exhausted retries.`);
  } catch (error) {
    if (
      controller.signal.aborted
      || (error instanceof Error && (
        error.name === 'AbortError'
        || error.message === 'Response body read aborted.'
      ))
      || Date.now() >= deadlineAt
    ) {
      throw timeoutError();
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};


type FirecrawlScreenshotDownloader = (
  screenshotUrl: string,
  timeoutMs: number,
) => Promise<AffiliateSourcePageScreenshotEvidence>;

export const createFirecrawlScreenshotDownloader = (
  fetchResource: typeof fetchBoundedPublicResource = fetchBoundedPublicResource,
): FirecrawlScreenshotDownloader => async (
  screenshotUrl,
  timeoutMs,
) => {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(screenshotUrl);
  } catch {
    throw new Error('Firecrawl returned an invalid screenshot URL.');
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('Firecrawl returned an unsupported screenshot URL.');
  }

  const boundedTimeoutMs = Math.max(1, timeoutMs);
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), boundedTimeoutMs);
  let response: BoundedPublicResource;
  try {
    response = await awaitWithTimeout(
      fetchResource(parsedUrl.toString(), {
        maxBytes: MAX_SCREENSHOT_BYTES,
        timeoutMs: boundedTimeoutMs,
        signal: abortController.signal,
      }),
      boundedTimeoutMs,
      `Firecrawl screenshot download timed out after ${timeoutMs}ms.`,
      () => abortController.abort(),
    );
  } catch (error) {
    if (error instanceof Error
      && (
        error.message.includes('timed out')
        || error.message.includes('aborted')
        || error.name === 'AbortError'
      )) {
      throw new Error(`Firecrawl screenshot download timed out after ${timeoutMs}ms.`);
    }
    if (error instanceof Error
      && error.message === `Source response exceeds the ${MAX_SCREENSHOT_BYTES} byte limit.`) {
      throw new Error(`Firecrawl screenshot exceeds the ${MAX_SCREENSHOT_BYTES} byte limit.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Firecrawl screenshot download failed with HTTP ${response.statusCode}.`);
  }
  const mimeType = response.contentType?.split(';', 1)[0].trim().toLowerCase() ?? '';
  if (!mimeType || !SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new Error('Firecrawl screenshot download returned an unsupported image type.');
  }

  return {
    data: response.body,
    mimeType,
    sourceUrl: parsedUrl.toString(),
    finalUrl: response.finalUrl,
    statusCode: response.statusCode,
  };
};

const downloadScreenshot = createFirecrawlScreenshotDownloader();

const domainList = (value: string[] | undefined): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const normalized = Array.from(new Set(value.map((entry) => entry.trim().toLowerCase()).filter(Boolean)));
  return normalized.length ? normalized.slice(0, 100) : undefined;
};

export class FirecrawlAffiliateClient implements
  AffiliateFirecrawlClient,
  AffiliateSourceSearchClient,
  AffiliateSourceCaptureClient {
  readonly provider = 'FIRECRAWL' as const;

  private readonly client: Firecrawl;
  private readonly apiKey: string;
  private readonly apiUrl: string;
  private readonly fetchImpl: typeof fetch | null;

  constructor(
    apiKey = process.env.FIRECRAWL_API_KEY?.trim(),
    fetchImpl: typeof fetch | null = globalThis.fetch,
  ) {
    if (!apiKey) {
      throw new Error('FIRECRAWL_API_KEY is required to inspect affiliate sources.');
    }
    this.apiKey = apiKey;
    this.apiUrl = (
      process.env.FIRECRAWL_API_URL?.trim() || 'https://api.firecrawl.dev'
    ).replace(/\/$/, '');
    this.fetchImpl = fetchImpl;
    this.client = new Firecrawl({
      apiKey,
      apiUrl: this.apiUrl,
      timeoutMs: firecrawlTimeoutMs(),
      maxRetries: 1,
    });
  }

  async searchSources(
    query: string,
    options: FirecrawlSourceSearchOptions = {},
  ): Promise<FirecrawlSourceSearchResult> {
    const normalizedQuery = stringValue(query);
    if (!normalizedQuery) throw new Error('Affiliate source discovery query is required.');
    const timeout = searchTimeoutMs();
    const request = {
      query: normalizedQuery,
      ...(options.strategy ? { strategy: options.strategy } : {}),
      options: {
        sources: ['web'] as Array<'web'>,
        limit: searchLimit(options.limit),
        location: stringValue(options.location) ?? undefined,
        includeDomains: domainList(options.includeDomains),
        excludeDomains: domainList(options.excludeDomains),
        ignoreInvalidURLs: true,
        timeout,
      },
    };
    const response: SearchData = await this.client.search(normalizedQuery, request.options);
    const rows = (response.web ?? []).map((entry) => {
      const row = serializableRecord(entry);
      return {
        url: stringValue(row.url) ?? '',
        title: stringValue(row.title),
        description: stringValue(row.description) ?? stringValue(row.markdown),
        category: stringValue(row.category),
      };
    }).filter((entry) => entry.url);
    const responseRecord = serializableRecord(response);
    return {
      provider: this.provider,
      request: serializableRecord(request),
      response: responseRecord,
      rows,
      providerJobId: stringValue(responseRecord.id),
      estimatedCredits: null,
    };
  }

  async mapSourceUrls(url: string, options: { limit?: number; search?: string } = {}): Promise<FirecrawlMapResult> {
    const timeout = firecrawlTimeoutMs();
    const request = {
      url,
      options: {
        limit: mapLimit(options.limit),
        search: stringValue(options.search) ?? undefined,
        includeSubdomains: false,
        ignoreQueryParameters: false,
        timeout,
        integration: 'cli',
      },
    };
    const response: MapData = await this.client.map(url, request.options);
    const links = (response.links ?? [])
      .map((entry) => ({
        url: stringValue(entry.url) ?? '',
        title: stringValue(entry.title),
        description: stringValue(entry.description),
      }))
      .filter((entry) => entry.url);

    return {
      request: serializableRecord(request),
      response: serializableRecord(response),
      links,
      providerJobId: stringValue(response.id),
    };
  }
  async scrapeSourcePage(
    url: string,
    captureOptions: AffiliateSourceCaptureOptions = {},
  ): Promise<FirecrawlCaptureResult> {
    if (captureOptions.profile?.renderMode === 'STATIC') {
      throw new Error('Firecrawl does not support STATIC capture profiles.');
    }
    const profile = captureOptions.profile;
    const captureScreenshot = captureOptions.captureScreenshot !== false;
    const timeout = captureTimeoutMs(profile);
    const waitFor = captureWaitFor(profile);
    const formats: NonNullable<ScrapeOptions['formats']> = [
      'markdown',
      'rawHtml',
      'links',
      'images',
      'branding',
    ];
    if (captureScreenshot) {
      formats.push({ type: 'screenshot', fullPage: true, quality: 80 });
    }
    const options: ScrapeOptions = {
      formats,
      onlyMainContent: false,
      timeout,
      ...(waitFor === undefined ? {} : { waitFor }),
      removeBase64Images: true,
      blockAds: true,
      integration: 'cli',
    };
    const request = {
      url,
      captureScreenshot,
      ...(profile ? { captureProfile: profile } : {}),
      options,
    };
    const startedAt = Date.now();
    const deadlineAt = affiliateSourceCaptureDeadlineAt(captureOptions, startedAt);
    const remainingBeforeScrape = deadlineAt - Date.now();
    if (remainingBeforeScrape <= 0) {
      throw new Error(`Firecrawl capture timed out after ${timeout}ms.`);
    }
    const scrapeResult = await scrapeWithBoundedFetch(
      this.fetchImpl,
      this.apiUrl,
      this.apiKey,
      url,
      options,
      Math.max(1, Math.min(timeout, remainingBeforeScrape)),
      'capture',
      deadlineAt,
    );
    const response = scrapeResult.document;
    const metadata = boundedFirecrawlMetadata(response.metadata);
    const finalUrl = stringValue(metadata.sourceURL)
      ?? stringValue(metadata.url)
      ?? url;
    const screenshotUrl = captureScreenshot ? stringValue(response.screenshot) : null;
    const elapsedMs = Date.now() - startedAt;
    const warnings: string[] = [];
    let screenshotEvidence: AffiliateSourcePageScreenshotEvidence | null = null;
    if (captureScreenshot) {
      const remainingForScreenshot = deadlineAt - Date.now();
      if (!screenshotUrl) {
        warnings.push('Firecrawl did not return a screenshot URL.');
      } else if (remainingForScreenshot <= 0) {
        warnings.push(`Screenshot download skipped because Firecrawl capture timed out after ${timeout}ms.`);
      } else {
        try {
          screenshotEvidence = await downloadScreenshot(
            screenshotUrl,
            Math.max(1, remainingForScreenshot),
          );
        } catch (error) {
          warnings.push(
            `Screenshot download failed for ${url}: ${error instanceof Error ? error.message : 'unknown error'}`,
          );
        }
      }
    }

    const responseRecord = {
      statusCode: scrapeResult.statusCode,
      metadata,
      ...(screenshotUrl ? { screenshotUrl } : {}),
    };
    return {
      request: serializableRecord(request),
      response: responseRecord,
      normalized: {
        finalUrl,
        statusCode: numberValue(metadata.statusCode) ?? null,
        markdown: stringValue(response.markdown),
        rawHtml: stringValue(response.rawHtml),
        links: (response.links ?? []).map((entry) => entry.trim()).filter(Boolean),
        images: (response.images ?? []).map((entry) => entry.trim()).filter(Boolean),
        branding: response.branding ? serializableRecord(response.branding) : null,
        screenshotUrl,
        screenshotEvidence,
        warnings,
        metadata,
      },
      providerJobId: stringValue(metadata.scrapeId),
    };
  }

  async captureSourcePage(
    url: string,
    captureOptions: AffiliateSourceCaptureOptions = {},
  ): Promise<AffiliateSourcePageCapture> {
    const startedAt = Date.now();
    const capture = await this.scrapeSourcePage(url, captureOptions);
    const rawHtml = capture.normalized.rawHtml ?? '';
    const inferredCanonicalUrl = inferredCanonicalUrlFromHtml(
      rawHtml,
      capture.normalized.finalUrl || url,
    );
    const providerArtifacts: AffiliateSourceProviderArtifacts = {
      markdown: capture.normalized.markdown,
      links: capture.normalized.links,
      images: capture.normalized.images,
      branding: capture.normalized.branding,
      screenshotUrl: capture.normalized.screenshotUrl,
      metadata: capture.normalized.metadata,
      screenshotEvidence: capture.normalized.screenshotEvidence,
    };
    return {
      provider: this.provider,
      request: capture.request,
      response: capture.response,
      requestedUrl: url,
      finalUrl: capture.normalized.finalUrl,
      isRedirectVerified: false,
      providerStatusCode: 200,
      targetStatusCode: capture.normalized.statusCode,
      inferredCanonicalUrl,
      renderMode: 'JAVASCRIPT',
      rawHtml,
      elapsedMs: Date.now() - startedAt,
      estimatedCredits: null,
      warnings: capture.normalized.warnings,
      providerJobId: capture.providerJobId,
      providerArtifacts,
    };
  }
  async captureScreenshot(
    url: string,
    captureOptions: AffiliateSourceCaptureOptions = {},
  ): Promise<AffiliateSourceScreenshot> {
    const startedAt = Date.now();
    const timeout = captureTimeoutMs(captureOptions.profile);
    const deadlineAt = affiliateSourceCaptureDeadlineAt(captureOptions, startedAt);
    const remainingBeforeScrape = deadlineAt - Date.now();
    if (remainingBeforeScrape <= 0) {
      throw new Error(`Firecrawl screenshot capture timed out after ${timeout}ms.`);
    }
    const options: ScrapeOptions = {
      formats: [{ type: 'screenshot', fullPage: true, quality: 80 }],
      onlyMainContent: false,
      timeout,
      integration: 'cli',
    };
    const scrapeResult = await scrapeWithBoundedFetch(
      this.fetchImpl,
      this.apiUrl,
      this.apiKey,
      url,
      options,
      Math.max(1, Math.min(timeout, remainingBeforeScrape)),
      'screenshot',
      deadlineAt,
    );
    const response = scrapeResult.document;
    const metadata = boundedFirecrawlMetadata(response.metadata);
    const screenshotUrl = stringValue(response.screenshot);
    if (!screenshotUrl) throw new Error('Firecrawl did not return a screenshot URL.');
    const remainingForScreenshot = deadlineAt - Date.now();
    if (remainingForScreenshot <= 0) {
      throw new Error(`Firecrawl screenshot capture timed out after ${timeout}ms.`);
    }
    const screenshot = await downloadScreenshot(
      screenshotUrl,
      Math.max(1, remainingForScreenshot),
    );
    return {
      provider: this.provider,
      request: serializableRecord({ url, options }),
      response: {
        statusCode: scrapeResult.statusCode,
        metadata,
        screenshotUrl,
        downloadStatus: screenshot.statusCode,
      },
      sourceUrl: screenshot.sourceUrl,
      finalUrl: screenshot.finalUrl,
      data: screenshot.data,
      mimeType: screenshot.mimeType,
      providerStatusCode: screenshot.statusCode,
      elapsedMs: Date.now() - startedAt,
      estimatedCredits: null,
    };
  }
}

export const createFirecrawlAffiliateClient = (): AffiliateFirecrawlClient => new FirecrawlAffiliateClient();
