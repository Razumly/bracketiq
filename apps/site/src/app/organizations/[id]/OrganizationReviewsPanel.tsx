'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  ConfirmDialog,
  Group,
  Modal,
  Paper,
  Rating,
  Stack,
  Text,
  Textarea,
  Title,
} from '@/components/organization/organization-operation-ui';
import { notifications } from '@/lib/organizationNotifications';
import { Trash2 } from 'lucide-react';
import {
  organizationReviewService,
  type OrganizationReview,
  type OrganizationReviewsPayload,
} from '@/lib/organizationReviewService';

import OrganizationReviewsView from './OrganizationReviewsView';
import { OrganizationDataRegion } from '@/components/organization/OrganizationDataLoading';

type OrganizationReviewsPanelProps = {
  organizationId: string;
  mode?: 'summary' | 'full';
  onViewAll?: () => void;
};

type ReviewConfirmationRequest = {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
};

function ReviewsError({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  if (!error) return null;
  return (
    <Alert color="red" title="Reviews unavailable">
      <Stack gap="sm">
        <Text size="sm">{error}</Text>
        <Button variant="light" size="xs" onClick={onRetry}>Try again</Button>
      </Stack>
    </Alert>
  );
}

type ReviewsStatusProps = {
  payload: OrganizationReviewsPayload | null;
  error: string | null;
  onRetry: () => void;
};

function ReviewsSummary({
  payload, loading, error, onRetry, onViewAll,
}: ReviewsStatusProps & { loading: boolean; onViewAll?: () => void }) {
  const summary = payload?.summary;
  const average = summary?.averageRating ?? 0;
  return (
    <Paper withBorder p="md" radius="md" className="org-tab-surface">
      <Group justify="space-between" align="center">
        <div>
          <Title order={5}>Reviews</Title>
          <OrganizationDataRegion loading={loading} label="reviews" layout="detail">
            <ReviewsError error={error} onRetry={onRetry} />
            {summary && summary.reviewCount > 0 ? (
              <Group gap="xs" mt={6}>
                <Text fw={800}>{average.toFixed(1)}</Text>
                <Rating value={average} fractions={2} readOnly size="sm" />
                <Text size="sm" c="dimmed">({summary.reviewCount})</Text>
              </Group>
            ) : !error && <Text size="sm" c="dimmed" mt={6}>No reviews yet.</Text>}
          </OrganizationDataRegion>
        </div>
        <Button variant="light" size="xs" onClick={onViewAll}>View reviews</Button>
      </Group>
    </Paper>
  );
}

function ReviewsAction({
  payload, organizationId, onEdit,
}: { payload: OrganizationReviewsPayload | null; organizationId: string; onEdit: () => void }) {
  if (!payload) return <Button disabled>Write a review</Button>;
  if (payload.canReview) {
    return <Button onClick={onEdit}>{payload.viewerReview ? 'Edit review' : 'Write a review'}</Button>;
  }
  if (!payload.viewerIsAuthenticated) {
    return <Button component="a" href={`/login?redirect=${encodeURIComponent(`/organizations/${organizationId}/reviews`)}`}>Sign in to review</Button>;
  }
  return null;
}

function ReviewsNotices({ payload, error, onRetry }: ReviewsStatusProps) {
  return (
    <>
      <ReviewsError error={error} onRetry={onRetry} />
      {payload && !payload.canReview && payload.viewerIsAuthenticated && payload.cannotReviewReason && <Text size="sm" c="dimmed">{payload.cannotReviewReason}</Text>}
      {payload?.viewerReview?.status === 'HIDDEN' && <Alert color="yellow" title="Your review is hidden">A moderator removed this review from the public list. Editing it will not republish it.</Alert>}
    </>
  );
}

type ReviewEditorProps = {
  opened: boolean;
  hasReview: boolean;
  rating: number;
  body: string;
  saving: boolean;
  deleting: boolean;
  onClose: () => void;
  onRatingChange: (value: number) => void;
  onBodyChange: (value: string) => void;
  onDelete: () => void;
  onSave: () => void;
};

function ReviewEditor({
  opened, hasReview, rating, body, saving, deleting,
  onClose, onRatingChange, onBodyChange, onDelete, onSave,
}: ReviewEditorProps) {
  return (
    <Modal opened={opened} onClose={onClose} title={hasReview ? 'Edit your review' : 'Write a review'} centered>
      <Stack>
        <div>
          <Text fw={700} size="sm" mb={6}>Your rating</Text>
          <Rating value={rating} onChange={onRatingChange} size="xl" />
          {rating === 0 ? <Text size="xs" c="dimmed" mt={4}>Choose 1 to 5 stars.</Text> : null}
        </div>
        <Textarea
          label="Review"
          description="Optional"
          placeholder="Share what stood out about this organization."
          value={body}
          onChange={(event) => onBodyChange(event.currentTarget.value)}
          minRows={5}
          maxLength={2000}
        />
        <Group justify="space-between">
          {hasReview ? (
            <Button color="red" variant="subtle" leftSection={<Trash2 size={16} />} loading={deleting} onClick={onDelete}>
              Delete
            </Button>
          ) : <span />}
          <Group>
            <Button variant="default" onClick={onClose}>Cancel</Button>
            <Button loading={saving} disabled={rating === 0 || deleting} onClick={onSave}>Publish</Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}

function ReviewConfirmation({
  confirmation, onClose,
}: { confirmation: ReviewConfirmationRequest | null; onClose: () => void }) {
  return (
    <ConfirmDialog
      open={Boolean(confirmation)}
      title={confirmation?.title ?? ''}
      message={confirmation?.message ?? ''}
      confirmLabel={confirmation?.confirmLabel ?? 'Confirm'}
      destructive={confirmation?.destructive}
      onCancel={onClose}
      onConfirm={() => {
        const action = confirmation?.onConfirm;
        onClose();
        void action?.();
      }}
    />
  );
}

export default function OrganizationReviewsPanel({
  organizationId,
  mode = 'full',
  onViewAll,
}: OrganizationReviewsPanelProps) {
  const [payload, setPayload] = useState<OrganizationReviewsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<ReviewConfirmationRequest | null>(null);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const dataGenerationRef = useRef(0);

  const loadReviews = useCallback(async () => {
    const generation = ++dataGenerationRef.current;
    setLoading(true);
    setLoadingMore(false);
    setSaving(false);
    setDeleting(false);
    setError(null);
    setLoadMoreError(null);
    try {
      const nextPayload = await organizationReviewService.getReviews(organizationId, {
        limit: mode === 'summary' ? 6 : 20,
      });
      if (dataGenerationRef.current === generation) {
        setPayload(nextPayload);
      }
    } catch (loadError) {
      if (dataGenerationRef.current === generation) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load reviews.');
      }
    } finally {
      if (dataGenerationRef.current === generation) {
        setLoading(false);
      }
    }
  }, [mode, organizationId]);

  useEffect(() => {
    void loadReviews();
    return () => {
      dataGenerationRef.current += 1;
    };
  }, [loadReviews]);

  const openEditor = () => {
    setRating(payload?.viewerReview?.rating ?? 0);
    setBody(payload?.viewerReview?.body ?? '');
    setEditorOpen(true);
  };

  const loadMoreReviews = async () => {
    const cursor = payload?.nextCursor;
    if (!cursor || loadingMore) return;
    const generation = ++dataGenerationRef.current;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const nextPage = await organizationReviewService.getReviews(organizationId, { limit: 20, cursor });
      if (dataGenerationRef.current !== generation) return;
      setPayload((current) => {
        if (!current || current.nextCursor !== cursor) return current;
        const existingIds = new Set(current.reviews.map((review) => review.id));
        const appended = nextPage.reviews.filter((review) => !existingIds.has(review.id));
        return {
          ...nextPage,
          reviews: [...current.reviews, ...appended],
        };
      });
    } catch (loadError) {
      if (dataGenerationRef.current === generation) {
        setLoadMoreError(loadError instanceof Error ? loadError.message : 'Unable to load more reviews.');
      }
    } finally {
      if (dataGenerationRef.current === generation) {
        setLoadingMore(false);
      }
    }
  };

  const saveReview = async () => {
    if (rating < 1 || rating > 5) return;
    const generation = ++dataGenerationRef.current;
    setSaving(true);
    setLoadingMore(false);
    setLoadMoreError(null);
    try {
      const nextPayload = await organizationReviewService.saveReview(organizationId, { rating, body });
      if (dataGenerationRef.current === generation) {
        setPayload(nextPayload);
        setEditorOpen(false);
        notifications.show({ color: 'green', message: 'Your review has been published.' });
      }
    } catch (saveError) {
      if (dataGenerationRef.current === generation) {
        notifications.show({
          color: 'red',
          message: saveError instanceof Error ? saveError.message : 'Unable to save your review.',
        });
      }
    } finally {
      if (dataGenerationRef.current === generation) {
        setSaving(false);
      }
    }
  };

  const deleteReview = async () => {
    const reviewId = payload?.viewerReview?.id;
    if (!reviewId) return;
    const generation = ++dataGenerationRef.current;
    setDeleting(true);
    setLoadingMore(false);
    setLoadMoreError(null);
    try {
      const nextPayload = await organizationReviewService.deleteReview(organizationId, reviewId);
      if (dataGenerationRef.current === generation) {
        setPayload(nextPayload);
        setEditorOpen(false);
        notifications.show({ color: 'green', message: 'Your review has been deleted.' });
      }
    } catch (deleteError) {
      if (dataGenerationRef.current === generation) {
        notifications.show({
          color: 'red',
          message: deleteError instanceof Error ? deleteError.message : 'Unable to delete your review.',
        });
      }
    } finally {
      if (dataGenerationRef.current === generation) {
        setDeleting(false);
      }
    }
  };

  const confirmDelete = () => {
    setConfirmation({
      title: 'Delete review?',
      message: 'This removes your rating and written review from the organization.',
      confirmLabel: 'Delete review',
      destructive: true,
      onConfirm: () => void deleteReview(),
    });
  };

  const reportReview = (reviewId: string) => {
    setConfirmation({
      title: 'Report this review?',
      message: 'BracketIQ moderators will review it for inappropriate or misleading content.',
      confirmLabel: 'Report review',
      onConfirm: async () => {
        try {
          await organizationReviewService.reportReview(reviewId);
          notifications.show({ color: 'green', message: 'Review reported to moderators.' });
        } catch (reportError) {
          notifications.show({
            color: 'red',
            message: reportError instanceof Error ? reportError.message : 'Unable to report this review.',
          });
        }
      },
    });
  };

  const retry = () => { void loadReviews(); };
  if (mode === 'summary') {
    return <ReviewsSummary payload={payload} loading={loading} error={error} onRetry={retry} onViewAll={onViewAll} />;
  }

  return (
    <>
      <OrganizationReviewsView
        payload={payload}
        loading={loading}
        error={error}
        onEdit={openEditor}
        onReport={reportReview}
        onLoadMore={() => void loadMoreReviews()}
        loadingMore={loadingMore}
        loadMoreError={loadMoreError}
        action={<ReviewsAction payload={payload} organizationId={organizationId} onEdit={openEditor} />}
        notices={<ReviewsNotices payload={payload} error={error} onRetry={retry} />}
      />
      <ReviewEditor
        opened={editorOpen}
        hasReview={Boolean(payload?.viewerReview)}
        rating={rating}
        body={body}
        saving={saving}
        deleting={deleting}
        onClose={() => setEditorOpen(false)}
        onRatingChange={setRating}
        onBodyChange={setBody}
        onDelete={confirmDelete}
        onSave={() => void saveReview()}
      />
      <ReviewConfirmation confirmation={confirmation} onClose={() => setConfirmation(null)} />
    </>
  );
}
