'use client';

import type { ReactNode } from 'react';

import { Paper, ScrollArea } from '@/components/organization/organization-operation-ui';

type OrganizationCustomerDetailPanelProps = {
  children: ReactNode;
  maxHeight?: number | string;
};

export default function OrganizationCustomerDetailPanel({
  children,
  maxHeight = 720,
}: OrganizationCustomerDetailPanelProps) {
  return (
    <Paper
      withBorder
      p="md"
      radius="md"
      role="region"
      aria-label="Customer details"
      className="org-customer-detail-panel min-w-0 xl:sticky xl:top-24 xl:self-start"
    >
      <ScrollArea.Autosize mah={maxHeight} type="auto">
        {children}
      </ScrollArea.Autosize>
    </Paper>
  );
}
