'use client';

import type { ReactNode } from 'react';

import { Paper } from '@/components/organization/organization-operation-ui';

type OrganizationCustomerDetailPanelProps = {
  children: ReactNode;
};

export default function OrganizationCustomerDetailPanel({
  children,
}: OrganizationCustomerDetailPanelProps) {
  return (
    <Paper
      withBorder
      p="md"
      radius="md"
      role="region"
      aria-label="Customer details"
      className="org-customer-detail-panel min-w-0"
    >
      {children}
    </Paper>
  );
}
