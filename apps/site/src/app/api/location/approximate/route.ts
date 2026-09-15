import { isIP } from 'node:net';
import { NextRequest, NextResponse } from 'next/server';
import type { LocationInfo } from '@/lib/locationService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const responseHeaders = { 'Cache-Control': 'private, no-store' };

const readText = (value: unknown): string | undefined => (
  typeof value === 'string' ? value.trim() || undefined : undefined
);

const readCoordinate = (value: unknown, limit: number): number | null => {
  const text = readText(value);
  if (typeof value !== 'number' && !text) return null;
  const coordinate = typeof value === 'number' ? value : Number(text);
  return Number.isFinite(coordinate) && Math.abs(coordinate) <= limit ? coordinate : null;
};

const normalizeLocation = (fields: Record<string, unknown>): LocationInfo | null => {
  const lat = readCoordinate(fields.latitude, 90);
  const lng = readCoordinate(fields.longitude, 180);
  if (lat === null || lng === null) return null;

  const city = readText(fields.city);
  const state = readText(fields.region_code) ?? readText(fields.region);
  const country = readText(fields.country_code);
  return {
    lat,
    lng,
    city,
    state,
    country,
    zipCode: readText(fields.postal),
    formattedAddress: [city, state, country].filter(Boolean).join(', ') || undefined,
    source: 'approximate',
  };
};

const readDecodedHeader = (headers: Headers, name: string): string | undefined => {
  const value = readText(headers.get(name));
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const getPlatformLocation = (headers: Headers): LocationInfo | null => (
  normalizeLocation({
    latitude: headers.get('x-vercel-ip-latitude'),
    longitude: headers.get('x-vercel-ip-longitude'),
    city: readDecodedHeader(headers, 'x-vercel-ip-city'),
    region_code: headers.get('x-vercel-ip-country-region'),
    country_code: headers.get('x-vercel-ip-country'),
    postal: headers.get('x-vercel-ip-postal-code'),
  }) ?? normalizeLocation({
    latitude: headers.get('cf-iplatitude'),
    longitude: headers.get('cf-iplongitude'),
    city: headers.get('cf-ipcity'),
    region_code: headers.get('cf-region-code'),
    region: headers.get('cf-region'),
    country_code: headers.get('cf-ipcountry'),
    postal: headers.get('cf-postal-code'),
  })
);

const getRequestIp = (headers: Headers): string | null => (
  headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  || headers.get('cf-connecting-ip')?.trim()
  || headers.get('x-real-ip')?.trim()
  || headers.get('x-client-ip')?.trim()
  || null
);

const unavailableResponse = () => NextResponse.json(
  { error: 'Approximate location is unavailable. Enter a location or use your current location.' },
  { status: 503, headers: responseHeaders },
);

const getIpLocation = async (ip: string, signal: AbortSignal): Promise<LocationInfo | null> => {
  // Provider fields: https://www.geojs.io/docs/v1/endpoints/geo/
  const response = await fetch(`https://get.geojs.io/v1/ip/geo/${encodeURIComponent(ip)}.json`, {
    cache: 'no-store',
    redirect: 'error',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
  });
  if (!response.ok) return null;

  const data: unknown = await response.json();
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  return normalizeLocation(data as Record<string, unknown>);
};

export async function GET(request: NextRequest) {
  const platformLocation = getPlatformLocation(request.headers);
  if (platformLocation) {
    return NextResponse.json(platformLocation, { headers: responseHeaders });
  }

  const ip = getRequestIp(request.headers);
  if (!ip || isIP(ip) === 0) return unavailableResponse();

  try {
    const location = await getIpLocation(ip, request.signal);
    if (!location) return unavailableResponse();
    return NextResponse.json(location, { headers: responseHeaders });
  } catch {
    return unavailableResponse();
  }
}
