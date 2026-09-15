import {
  createServer,
  request as httpRequest,
  type AddressInfo,
  type Server,
} from 'node:http';
import type { NextRequest } from 'next/server';
import type { SportCatalog } from '@/lib/sportsService';

let getSports: (request: NextRequest) => Promise<Response>;
let UndiciHeaders: typeof Headers;
let UndiciRequest: typeof Request;
let UndiciResponse: typeof Response;
let sportsService: {
  getCatalog: (forceRefresh?: boolean) => Promise<SportCatalog>;
};

const mockPrisma = {
  sportCategories: {
    findMany: jest.fn(),
    createMany: jest.fn(),
  },
};
const mockEnsureDefaultSports = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('@/server/defaultSports', () => ({ ensureDefaultSports: mockEnsureDefaultSports }));

describe('sports catalog client-to-site integration', () => {
  let server: Server;
  let baseUrl: string;
  let originalFetch: typeof fetch;

  beforeAll(async () => {
    // jsdom does not provide the Web APIs that Next and Undici require at import time.
    const { ReadableStream, TransformStream, WritableStream } = await import('node:stream/web');
    const { MessagePort } = await import('node:worker_threads');
    Object.assign(globalThis, { ReadableStream, TransformStream, WritableStream, MessagePort });
    const undici = await import('undici');
    UndiciHeaders = undici.Headers;
    UndiciRequest = undici.Request;
    UndiciResponse = undici.Response;
    Object.assign(globalThis, {
      Headers: UndiciHeaders,
      Request: UndiciRequest,
      Response: UndiciResponse,
    });
    const [routeModule, serviceModule] = await Promise.all([
      import('@/app/api/sports/route'),
      import('@/lib/sportsService'),
    ]);
    getSports = routeModule.GET;
    sportsService = serviceModule.sportsService;
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockEnsureDefaultSports.mockResolvedValue([
      {
        id: 'Indoor Soccer',
        name: 'Indoor Soccer',
        resourceLabelSingular: 'Field',
        resourceLabelPlural: 'Fields',
      },
      {
        id: 'Futsal',
        name: 'Futsal',
        resourceLabelSingular: 'Field',
        resourceLabelPlural: 'Fields',
      },
    ]);
    mockPrisma.sportCategories.findMany.mockResolvedValue([
      {
        id: 'soccer',
        name: 'Soccer',
        sportIds: ['Indoor Soccer', 'Futsal', 'missing-sport'],
        displayOrder: 10,
        createdAt: '2026-09-09T00:00:00.000Z',
        updatedAt: '2026-09-09T00:00:00.000Z',
      },
    ]);

    server = createServer(async (request, response) => {
      try {
        const nextResponse = await getSports(new UndiciRequest(
          `http://127.0.0.1${request.url ?? '/api/sports'}`,
          { method: request.method ?? 'GET' },
        ) as unknown as NextRequest);
        response.statusCode = nextResponse.status;
        nextResponse.headers.forEach((value, key) => response.setHeader(key, value));
        response.end(await nextResponse.text());
      } catch {
        response.statusCode = 500;
        response.end();
      }
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    originalFetch = globalThis.fetch;
    globalThis.fetch = ((input, init) => {
      const inputUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const requestUrl = inputUrl.startsWith('/') ? `${baseUrl}${inputUrl}` : inputUrl;
      const requestHeaders = new UndiciHeaders(init?.headers);
      return new Promise<Response>((resolve, reject) => {
        const requestHandle = httpRequest(
          requestUrl,
          {
            method: init?.method ?? 'GET',
            headers: Object.fromEntries(requestHeaders.entries()),
          },
          (response) => {
            const chunks: Buffer[] = [];
            response.on('data', (chunk: Buffer) => chunks.push(chunk));
            response.on('end', () => {
              const responseHeaders = new UndiciHeaders();
              Object.entries(response.headers).forEach(([key, value]) => {
                if (value !== undefined) {
                  responseHeaders.set(key, Array.isArray(value) ? value.join(', ') : value);
                }
              });
              resolve(new UndiciResponse(Buffer.concat(chunks), {
                status: response.statusCode ?? 500,
                statusText: response.statusMessage ?? '',
                headers: responseHeaders,
              }));
            });
          },
        );
        requestHandle.on('error', reject);
        if (typeof init?.body === 'string') requestHandle.write(init.body);
        requestHandle.end();
      });
    }) as typeof fetch;
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('maps the live HTTP catalog response without changing the sports filter contract', async () => {
    const catalog = await sportsService.getCatalog(true);

    expect(catalog.sports.map((sport) => sport.name)).toEqual(['Indoor Soccer', 'Futsal']);
    expect(catalog.categories).toEqual([
      expect.objectContaining({
        $id: 'soccer',
        name: 'Soccer',
        sportIds: ['Indoor Soccer', 'Futsal'],
      }),
    ]);
  });
});
