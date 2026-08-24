import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  buildAppVersionResponse,
  normalizeAppReleasePlatform,
  parseBuildNumber,
  type AppReleaseRow,
} from '@/lib/appReleases';
import {
  appVersionIsolationProbeResponseSchema,
  appVersionResponseSchema,
} from '@/contracts/appVersion';
import { isOutboundProvidersDisabled } from '@/server/outboundProviders';

export const dynamic = 'force-dynamic';

const getTestDatabaseUrlHash = (): string | null => {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) return null;
  return createHash('sha256').update(databaseUrl, 'utf8').digest('hex');
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const platform = normalizeAppReleasePlatform(searchParams.get('platform'));

  if (!platform) {
    return NextResponse.json(
      { error: 'platform must be IOS or ANDROID' },
      { status: 400 },
    );
  }

  const current = {
    versionName: searchParams.get('versionName')?.trim() || null,
    buildNumber: parseBuildNumber(searchParams.get('buildNumber')),
  };

  const releases = await prisma.appReleases.findMany({
    where: {
      platform,
      isActive: true,
    },
  });

  const payload = appVersionResponseSchema.parse(
    buildAppVersionResponse(releases as AppReleaseRow[], current),
  );
  const isIsolationProbe = searchParams.get('mvpTestIsolation') === '1';
  const outboundProvidersDisabled = isOutboundProvidersDisabled();
  const response = isIsolationProbe
    ? appVersionIsolationProbeResponseSchema.parse({
        ...payload,
        outboundProvidersDisabled,
        databaseUrlHash: outboundProvidersDisabled ? getTestDatabaseUrlHash() : null,
      })
    : payload;

  return NextResponse.json(response, { status: 200 });
}
