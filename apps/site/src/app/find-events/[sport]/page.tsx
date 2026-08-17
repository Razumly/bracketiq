import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PublicSearchPageView from '@/components/publicSearch/PublicSearchPageView';
import {
  fallbackSearchTitle,
  getSearchPageForSegments,
  metadataForPublicSearchPage,
} from '../publicSearchRoute';

export const dynamic = 'force-dynamic';

type EventSearchPageProps = {
  params: Promise<{ sport: string }>;
};

export async function generateMetadata({ params }: EventSearchPageProps): Promise<Metadata> {
  const { sport } = await params;
  const page = await getSearchPageForSegments('events', [sport]);
  return metadataForPublicSearchPage(page, fallbackSearchTitle('events', sport));
}

export default async function EventSearchPage({ params }: EventSearchPageProps) {
  const { sport } = await params;
  const page = await getSearchPageForSegments('events', [sport]);
  if (!page) {
    notFound();
  }
  return <PublicSearchPageView page={page} />;
}
