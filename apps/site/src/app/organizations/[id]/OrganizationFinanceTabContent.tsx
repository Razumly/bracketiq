'use client';

import type { ComponentProps } from 'react';

import OrganizationFinancePanel from './OrganizationFinancePanel';

export type OrganizationFinanceTabContentProps = ComponentProps<typeof OrganizationFinancePanel>;

export default function OrganizationFinanceTabContent(props: OrganizationFinanceTabContentProps) {
  return <OrganizationFinancePanel {...props} />;
}
