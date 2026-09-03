'use client';

import type { ComponentProps } from 'react';

import OrganizationReviewsPanel from './OrganizationReviewsPanel';

export type OrganizationReviewsTabContentProps = ComponentProps<typeof OrganizationReviewsPanel>;

export default function OrganizationReviewsTabContent(props: OrganizationReviewsTabContentProps) {
  return <OrganizationReviewsPanel {...props} />;
}
