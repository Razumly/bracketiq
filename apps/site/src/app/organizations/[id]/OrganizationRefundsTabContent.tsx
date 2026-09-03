'use client';

import type { ComponentProps } from 'react';

import RefundRequestsList from '@/components/ui/RefundRequestsList';

export type OrganizationRefundsTabContentProps = ComponentProps<typeof RefundRequestsList>;

export default function OrganizationRefundsTabContent(props: OrganizationRefundsTabContentProps) {
  return <RefundRequestsList {...props} />;
}
