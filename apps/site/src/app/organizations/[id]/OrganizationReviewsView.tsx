'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { MessageSquare, Search, ShieldCheck, Star } from 'lucide-react';
import { Alert, Avatar, Button, Rating, Select, TextInput } from '@/components/organization/organization-operation-ui';
import { OrganizationTabHeading } from '@/components/organization/OrganizationTabLayout';
import { OrganizationDataRegion, OrganizationLoadingValue, useOrganizationDataLoading } from '@/components/organization/OrganizationDataLoading';
import type { OrganizationReview, OrganizationReviewsPayload } from '@/lib/organizationReviewService';

type Props = {
  payload: OrganizationReviewsPayload | null;
  loading?: boolean;
  error?: string | null;
  action: ReactNode;
  notices: ReactNode;
  onEdit: () => void;
  onReport: (id: string) => void;
  onLoadMore: () => void;
  loadingMore: boolean;
  loadMoreError: string | null;
};

function ReviewRow({ review, action }: { review: OrganizationReview; action: ReactNode }) {
  const date = new Date(review.updatedAt);
  const dateLabel = Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return (
    <article className="org-review-row">
      <Avatar src={review.reviewer.profileImageUrl} name={review.reviewer.displayName} size={52} radius="xl" />
      <div className="org-review-copy">
        <div className="org-review-byline">
          <strong>{review.reviewer.displayName}</strong>
          <Rating value={review.rating} readOnly size="sm" />
          <time dateTime={review.updatedAt}>{dateLabel}</time>
        </div>
        {review.body && <p>{review.body}</p>}
        <div className="org-review-row-footer"><span>Organization review</span>{action}</div>
      </div>
    </article>
  );
}

function ReviewSummary({ summary, action, loading }: { summary?: OrganizationReviewsPayload['summary']; action: ReactNode; loading: boolean }) {
  return (
    <div className="org-review-summary">
      <div className="org-review-score">
        <strong><OrganizationLoadingValue loading={loading}>{summary?.averageRating?.toFixed(1) ?? '—'}</OrganizationLoadingValue></strong>
        <OrganizationLoadingValue loading={loading}>
          {summary && <Rating value={summary.averageRating ?? 0} readOnly />}
        </OrganizationLoadingValue>
        <span><OrganizationLoadingValue loading={loading}>{summary?.reviewCount ?? '—'}</OrganizationLoadingValue> reviews</span>
      </div>
      <div className="org-review-distribution">
        {[5, 4, 3, 2, 1].map((rating) => {
          const count = summary?.ratingCounts[rating - 1] ?? 0;
          const percentage = summary?.reviewCount ? count / summary.reviewCount * 100 : 0;
          return <div key={rating}><span>{rating}</span><Star aria-hidden="true" /><span className="org-rating-track"><span style={{ width: `${percentage}%` }} /></span><span><OrganizationLoadingValue loading={loading}>{summary ? count : '—'}</OrganizationLoadingValue></span></div>;
        })}
      </div>
      <div className="org-review-write">{action}</div>
    </div>
  );
}

function positiveReviewPercentage(summary?: OrganizationReviewsPayload['summary']) {
  if (!summary || !summary.reviewCount) return '—';
  return Math.round((summary.ratingCounts[3] + summary.ratingCounts[4]) / summary.reviewCount * 100) + '%';
}

function ReviewInsights({ summary, loading }: { summary?: OrganizationReviewsPayload['summary']; loading: boolean }) {
  return (
    <aside className="org-detail-stack">
      <section className="org-reference-card">
        <h3>Review insights</h3>
        <dl className="org-insight-list">
          <div><dt><Star />Overall rating</dt><dd><OrganizationLoadingValue loading={loading}>{summary?.averageRating?.toFixed(1) ?? '—'}</OrganizationLoadingValue></dd></div>
          <div><dt><ShieldCheck />Positive reviews</dt><dd><OrganizationLoadingValue loading={loading}>{positiveReviewPercentage(summary)}</OrganizationLoadingValue></dd></div>
          <div><dt><MessageSquare />Total reviews</dt><dd><OrganizationLoadingValue loading={loading}>{summary?.reviewCount ?? '—'}</OrganizationLoadingValue></dd></div>
        </dl>
      </section>
      <section className="org-reference-card">
        <h3>Review policy</h3>
        <p>Share feedback based on your experience with this organization. You can report inappropriate or misleading content for moderator review.</p>
      </section>
    </aside>
  );
}

function ReviewEmptyCopy({ payload, error, hasReviews }: Pick<Props, 'payload' | 'error'> & { hasReviews: boolean }) {
  if (error || !payload || hasReviews) return null;
  return <p className="org-empty-copy">{payload.reviews.length ? 'No reviews match your search.' : 'No reviews yet. Be the first to share your experience.'}</p>;
}

export default function OrganizationReviewsView({ payload, loading = false, error, action, notices, onEdit, onReport, onLoadMore, loadingMore, loadMoreError }: Props) {
  const isLoading = useOrganizationDataLoading(loading);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('recent');
  const reviews = useMemo(() => {
    const matching = (payload?.reviews ?? []).filter((review) => `${review.reviewer.displayName} ${review.body ?? ''}`.toLowerCase().includes(search.toLowerCase()));
    return matching.sort((a, b) => sort === 'rating' ? b.rating - a.rating : Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }, [payload?.reviews, search, sort]);
  const rowAction = (review: OrganizationReview) => {
    if (payload?.viewerReview?.id === review.id) return <Button variant="subtle" size="sm" onClick={onEdit}>Edit</Button>;
    if (!payload?.viewerIsAuthenticated) return null;
    return <Button variant="subtle" size="sm" onClick={() => onReport(review.id)}>Report</Button>;
  };
  return (
    <section className="org-section org-reviews">
      <OrganizationTabHeading title="Reviews" description="Feedback from athletes, families, and teams" />
      <ReviewSummary summary={payload?.summary} action={action} loading={isLoading} />
      {notices}
      <div className="org-content-with-aside">
        <div className="min-w-0">
          <div className="org-filter-toolbar">
            <span className="org-filter-current">Organization reviews</span>
            <TextInput aria-label="Search reviews" placeholder="Search" value={search} onChange={(event) => setSearch(event.currentTarget.value)} leftSection={<Search className="size-4" />} />
            <Select aria-label="Sort reviews" value={sort} onChange={(value) => setSort(value ?? 'recent')} data={[{ value: 'recent', label: 'Most recent' }, { value: 'rating', label: 'Highest rated' }]} />
          </div>
          <div className="org-review-feed">
            <OrganizationDataRegion loading={isLoading} label="reviews">
            {reviews.map((review) => <ReviewRow key={review.id} review={review} action={rowAction(review)} />)}
            <ReviewEmptyCopy payload={payload} error={error} hasReviews={reviews.length > 0} />
            {loadMoreError && <Alert color="red" title="More reviews unavailable">{loadMoreError}</Alert>}
            {payload?.nextCursor && <div className="org-list-footer"><Button variant="outline" loading={loadingMore} onClick={onLoadMore}>Load more reviews</Button></div>}
            </OrganizationDataRegion>
          </div>
        </div>
        <ReviewInsights summary={payload?.summary} loading={isLoading} />
      </div>
    </section>
  );
}
