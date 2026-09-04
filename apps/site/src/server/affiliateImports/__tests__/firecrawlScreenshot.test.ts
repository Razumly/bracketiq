/** @jest-environment node */

import { createFirecrawlScreenshotDownloader } from '@/server/affiliateImports/firecrawlClient';
import type {
  BoundedPublicResource,
  BoundedPublicResourceOptions,
} from '@/server/affiliateImports/sourceIntakeUrlSafety';

const resource = (overrides: Partial<BoundedPublicResource> = {}): BoundedPublicResource => ({
  body: Buffer.from('safe-image'),
  finalUrl: 'https://cdn.example.test/final.png',
  statusCode: 200,
  contentType: 'image/png; charset=utf-8',
  headers: {},
  ...overrides,
});

describe('Firecrawl screenshot download seam', () => {
  it('uses the bounded resource contract and preserves staged evidence metadata', async () => {
    const fetchResource = jest.fn(async () => resource());
    const download = createFirecrawlScreenshotDownloader(fetchResource);

    await expect(download('https://cdn.example.test/screenshot.png', 1_234)).resolves.toEqual({
      data: Buffer.from('safe-image'),
      mimeType: 'image/png',
      sourceUrl: 'https://cdn.example.test/screenshot.png',
      finalUrl: 'https://cdn.example.test/final.png',
      statusCode: 200,
    });
    expect(fetchResource).toHaveBeenCalledWith('https://cdn.example.test/screenshot.png', {
      maxBytes: 3 * 1024 * 1024,
      timeoutMs: 1_234,
      signal: expect.any(AbortSignal),
    });
  });

  it('aborts the entire bounded download at one absolute deadline', async () => {
    const signals: AbortSignal[] = [];
    const fetchResource = jest.fn((
      _url: string,
      options: BoundedPublicResourceOptions,
    ): Promise<BoundedPublicResource> => new Promise((_, reject) => {
      const signal = options.signal;
      if (!signal) {
        reject(new Error('Expected an abort signal.'));
        return;
      }
      signals.push(signal);
      signal.addEventListener(
        'abort',
        () => reject(new Error('Source request aborted.')),
        { once: true },
      );
    }));
    const download = createFirecrawlScreenshotDownloader(fetchResource);

    await expect(download('https://cdn.example.test/redirecting.png', 20))
      .rejects.toThrow('timed out after 20ms');

    expect(signals).toHaveLength(1);
    expect(signals[0].aborted).toBe(true);
    expect(fetchResource).toHaveBeenCalledWith(
      'https://cdn.example.test/redirecting.png',
      expect.objectContaining({
        maxBytes: 3 * 1024 * 1024,
        timeoutMs: 20,
        signal: signals[0],
      }),
    );
  });

  it('rejects a successful response without a supported image content type', async () => {
    const fetchResource = jest.fn(async () => resource({ contentType: 'text/html' }));
    const download = createFirecrawlScreenshotDownloader(fetchResource);

    await expect(download('https://cdn.example.test/screenshot.png', 1_234)).rejects.toThrow(
      'unsupported image type',
    );
  });

  it('maps bounded resource timeout and size failures to screenshot errors', async () => {
    const fetchResource = jest.fn()
      .mockRejectedValueOnce(new Error('Source request timed out.'))
      .mockRejectedValueOnce(new Error('Source response exceeds the 3145728 byte limit.'));
    const download = createFirecrawlScreenshotDownloader(fetchResource);

    await expect(download('https://cdn.example.test/screenshot.png', 1_234)).rejects.toThrow(
      'Firecrawl screenshot download timed out after 1234ms',
    );
    await expect(download('https://cdn.example.test/screenshot.png', 1_234)).rejects.toThrow(
      'Firecrawl screenshot exceeds the 3145728 byte limit',
    );
  });

  it('rejects non-success responses before staging their bytes', async () => {
    const fetchResource = jest.fn(async () => resource({ statusCode: 404 }));
    const download = createFirecrawlScreenshotDownloader(fetchResource);

    await expect(download('https://cdn.example.test/screenshot.png', 1_234)).rejects.toThrow(
      'HTTP 404',
    );
  });
});
