jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: HeadersInit }) => ({
      status: init?.status ?? 200,
      headers: new Headers(init?.headers),
      json: async () => body,
    }),
  },
}));

const { GET } = require('@/app/api/location/approximate/route');

const fetchMock = jest.fn();

beforeEach(() => {
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  fetchMock.mockReset();
  Reflect.deleteProperty(global, 'fetch');
});

describe('/api/location/approximate', () => {
  it('uses trusted platform coordinates without exposing the client IP', async () => {
    const response = await GET({
      headers: new Headers({
        'x-vercel-ip-latitude': '40.7128',
        'x-vercel-ip-longitude': '-74.0060',
        'x-vercel-ip-city': 'New%20York',
        'x-vercel-ip-country-region': 'NY',
        'x-vercel-ip-country': 'US',
        'x-vercel-ip-postal-code': '10001',
      }),
      signal: new AbortController().signal,
    } as any);

    const body = await response.json();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(body).toEqual({
      lat: 40.7128,
      lng: -74.006,
      city: 'New York',
      state: 'NY',
      country: 'US',
      zipCode: '10001',
      formattedAddress: 'New York, NY, US',
      source: 'approximate',
    });
    expect(body).not.toHaveProperty('ip');
  });

  it('returns unavailable when the request has no usable address data', async () => {
    const response = await GET({
      headers: new Headers(),
      signal: new AbortController().signal,
    } as any);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'Approximate location is unavailable. Enter a location or use your current location.',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  });
