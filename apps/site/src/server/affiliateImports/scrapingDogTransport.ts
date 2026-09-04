import { createHash } from 'crypto';
import { readBoundedByteStream } from './boundedByteStream';

const SCRAPINGDOG_BASE_URL = 'https://api.scrapingdog.com';
const DEFAULT_SCRAPINGDOG_TIMEOUT_MS = 5 * 60 * 1000;
const MIN_SCRAPINGDOG_TIMEOUT_MS = 10_000;
const MAX_SCRAPINGDOG_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_RETRIES = 1;
const MAX_ERROR_BODY_BYTES = 64 * 1024;
const MAX_SCRAPE_RESPONSE_BYTES = 10 * 1024 * 1024;
const MAX_GOOGLE_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_SCREENSHOT_RESPONSE_BYTES = 3 * 1024 * 1024;

export type ScrapingDogResponseType = 'text' | 'json' | 'buffer';

export type ScrapingDogTransportRequest = {
  endpoint: '/scrape' | '/google' | '/screenshot';
  targetUrl?: string;
  params: Record<string, string | number | boolean | null | undefined>;
  timeoutMs?: number;
  maxBytes?: number;
  responseType: ScrapingDogResponseType;
  deadlineAt?: number;
};

export type ScrapingDogTransportResult<T> = {
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  statusCode: number;
  headers: Record<string, string>;
  body: T;
  elapsedMs: number;
};

type Sleep = (milliseconds: number) => Promise<void>;

const defaultSleep: Sleep = async (milliseconds) => {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
};

export const scrapingDogTimeoutMs = (override?: number): number => {
  if (
    typeof override === 'number'
    && Number.isInteger(override)
    && override >= MIN_SCRAPINGDOG_TIMEOUT_MS
    && override <= MAX_SCRAPINGDOG_TIMEOUT_MS
  ) {
    return override;
  }
  const configured = Number.parseInt(process.env.SCRAPINGDOG_TIMEOUT_MS ?? '', 10);
  return Number.isInteger(configured)
    && configured >= MIN_SCRAPINGDOG_TIMEOUT_MS
    && configured <= MAX_SCRAPINGDOG_TIMEOUT_MS
    ? configured
    : DEFAULT_SCRAPINGDOG_TIMEOUT_MS;
};

const safeHeaders = (headers?: Headers): Record<string, string> => {
  if (!headers || typeof headers.get !== 'function') return {};
  const allowed = ['content-type', 'content-length', 'retry-after', 'x-request-id'];
  return Object.fromEntries(allowed.flatMap((name) => {
    const value = headers.get(name);
    return value ? [[name, value]] : [];
  }));
};

const normalizedParams = (
  params: ScrapingDogTransportRequest['params'],
): Record<string, string | number | boolean> => Object.fromEntries(
  Object.entries(params)
    .filter((entry): entry is [string, string | number | boolean] => (
      entry[1] !== null && entry[1] !== undefined
    ))
    .sort(([left], [right]) => left.localeCompare(right)),
);

const retryDelayMs = (response: Response, attempt: number): number => {
  const retryAfter = Number.parseInt(response.headers?.get?.('retry-after') ?? '', 10);
  if (Number.isFinite(retryAfter) && retryAfter >= 0) {
    return Math.min(10_000, retryAfter * 1_000);
  }
  return Math.min(2_000, 500 * (2 ** attempt));
};

const isRetryableResponse = (response: Response, attempt: number): boolean => (
  attempt < MAX_RETRIES
  && (
    response.status === 429
    || (response.status >= 500 && response.status < 600)
    || response.status === 202
  )
);
const responseMaximumBytes = (input: ScrapingDogTransportRequest): number => {
  if (input.maxBytes !== undefined) return input.maxBytes;
  if (input.endpoint === '/google') return MAX_GOOGLE_RESPONSE_BYTES;
  if (input.endpoint === '/screenshot') return MAX_SCREENSHOT_RESPONSE_BYTES;
  return MAX_SCRAPE_RESPONSE_BYTES;
};

const boundedBufferFromResponse = async (
  response: Response,
  maximumBytes: number,
  signal?: AbortSignal,
): Promise<Buffer> => {
  const declaredLength = Number.parseInt(
    response.headers?.get?.('content-length') ?? '',
    10,
  );
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`ScrapingDog response exceeds the ${maximumBytes} byte limit.`);
  }
  if (!response.body || typeof response.body.getReader !== 'function') {
    throw new Error('ScrapingDog response body stream is unavailable.');
  }
  try {
    return await readBoundedByteStream(response.body, maximumBytes, signal);
  } catch (error) {
    if (
      error instanceof Error
      && error.message === `Response body exceeds the ${maximumBytes} byte limit.`
    ) {
      throw new Error(`ScrapingDog response exceeds the ${maximumBytes} byte limit.`);
    }
    throw error;
  }
};

const responseError = async (
  response: Response,
  maximumBytes = MAX_ERROR_BODY_BYTES,
  signal?: AbortSignal,
): Promise<Error> => {
  let body = '';
  try {
    body = (await boundedBufferFromResponse(response, maximumBytes, signal)).toString('utf8');
  } catch (error) {
    if (
      signal?.aborted
      || (error instanceof Error && error.message === 'Response body read aborted.')
    ) {
      throw error;
    }
    // The status and bounded error prefix remain useful when the body is too large.
  }
  const suffix = body.trim() ? `: ${body.trim().slice(0, 300)}` : '';
  return new Error(`ScrapingDog request failed with HTTP ${response.status}${suffix}`);
};

export class ScrapingDogTransport {
  constructor(
    private readonly apiKey = process.env.SCRAPINGDOG_API_KEY?.trim() ?? '',
    private readonly fetchImpl: typeof fetch | null = null,
    private readonly sleep: Sleep = defaultSleep,
  ) {}

  async requestText(
    request: Omit<ScrapingDogTransportRequest, 'responseType'>,
  ): Promise<ScrapingDogTransportResult<string>> {
    return this.request({ ...request, responseType: 'text' });
  }

  async requestJson<T = unknown>(
    request: Omit<ScrapingDogTransportRequest, 'responseType'>,
  ): Promise<ScrapingDogTransportResult<T>> {
    return this.request<T>({ ...request, responseType: 'json' });
  }

  async requestBuffer(
    request: Omit<ScrapingDogTransportRequest, 'responseType'>,
  ): Promise<ScrapingDogTransportResult<Buffer>> {
    return this.request({ ...request, responseType: 'buffer' });
  }

  private async request<T>(
    input: ScrapingDogTransportRequest,
  ): Promise<ScrapingDogTransportResult<T>> {
    if (!this.apiKey) {
      throw new Error('SCRAPINGDOG_API_KEY is not configured.');
    }
    const params = normalizedParams(input.params);
    const requestUrl = new URL(input.endpoint, SCRAPINGDOG_BASE_URL);
    requestUrl.searchParams.set('api_key', this.apiKey);
    Object.entries(params).forEach(([key, value]) => {
      requestUrl.searchParams.set(key, String(value));
    });
    const redactedRequest = {
      provider: 'SCRAPINGDOG',
      endpoint: input.endpoint,
      ...(input.targetUrl ? { targetUrl: input.targetUrl } : {}),
      options: {
        ...Object.fromEntries(
          Object.entries(params).filter(([key]) => key !== 'url' && key !== 'query'),
        ),
        ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
        ...(input.maxBytes === undefined ? {} : { maxBytes: input.maxBytes }),
      },
      ...(typeof params.query === 'string' ? { query: params.query } : {}),
    };
    const timeoutMs = scrapingDogTimeoutMs(input.timeoutMs);
    const operationStartedAt = Date.now();
    const defaultDeadline = operationStartedAt + timeoutMs;
    const deadline = Number.isFinite(input.deadlineAt)
      ? Math.min(input.deadlineAt as number, defaultDeadline)
      : defaultDeadline;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(0, deadline - Date.now()));
    const timeoutError = (): Error => new Error(`ScrapingDog request timed out after ${timeoutMs}ms.`);
    const throwIfTimedOut = (): void => {
      if (controller.signal.aborted || Date.now() >= deadline) {
        controller.abort();
        throw timeoutError();
      }
    };
    const sleepUntilDeadline = async (delayMs: number): Promise<void> => {
      throwIfTimedOut();
      const remainingMs = Math.max(1, deadline - Date.now());
      const waitMs = Math.min(delayMs, remainingMs);
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const deadlineTimer = setTimeout(() => {
          settled = true;
          controller.abort();
          reject(timeoutError());
        }, remainingMs);
        const finish = (callback: () => void): void => {
          if (settled) return;
          settled = true;
          clearTimeout(deadlineTimer);
          try {
            callback();
          } catch (error) {
            reject(error);
          }
        };
        try {
          this.sleep(waitMs).then(
            () => finish(() => {
              throwIfTimedOut();
              resolve();
            }),
            (error) => finish(() => reject(error)),
          );
        } catch (error) {
          finish(() => reject(error));
        }
      });
    };

    try {
      const request = this.fetchImpl ?? globalThis.fetch;
      if (typeof request !== 'function') throw new Error('Global fetch is not available.');
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
        throwIfTimedOut();
        const response = await request(requestUrl, {
          method: 'GET',
          headers: {
            Accept: input.responseType === 'buffer'
              ? 'image/png,image/jpeg,image/webp,*/*;q=0.8'
              : 'application/json,text/html,application/xhtml+xml,*/*;q=0.8',
          },
          signal: controller.signal,
        });
        throwIfTimedOut();

        const canRetry = isRetryableResponse(response, attempt);
        if (!response.ok || response.status === 202) {
          if (canRetry) {
            void response.body?.cancel().catch(() => undefined);
            await sleepUntilDeadline(retryDelayMs(response, attempt));
            continue;
          }
          throw await responseError(
            response,
            Math.min(responseMaximumBytes(input), MAX_ERROR_BODY_BYTES),
            controller.signal,
          );
        }

        const maximumBytes = responseMaximumBytes(input);
        const bodyBytes = await boundedBufferFromResponse(response, maximumBytes, controller.signal);
        throwIfTimedOut();
        const body: unknown = input.responseType === 'json'
          ? JSON.parse(bodyBytes.toString('utf8'))
          : input.responseType === 'buffer'
            ? bodyBytes
            : bodyBytes.toString('utf8');
        const headers = safeHeaders(response.headers);
        const elapsedMs = Date.now() - operationStartedAt;
        return {
          request: redactedRequest,
          response: {
            provider: 'SCRAPINGDOG',
            statusCode: response.status,
            headers,
            elapsedMs,
            bodyBytes: bodyBytes.length,
            bodyHash: createHash('sha256').update(bodyBytes).digest('hex'),
            bodyHashAlgorithm: 'sha256',
          },
          statusCode: response.status,
          headers,
          body: body as T,
          elapsedMs,
        };
      }
      throw new Error('ScrapingDog request exhausted retries.');
    } catch (error) {
      if (
        controller.signal.aborted
        || (error instanceof Error && (
          error.name === 'AbortError'
          || error.message === 'Response body read aborted.'
        ))
        || Date.now() >= deadline
      ) {
        throw timeoutError();
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
