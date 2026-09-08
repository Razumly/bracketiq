'use client';

import type { ReactNode } from 'react';
import { OrganizationLoadingValue } from './OrganizationDataLoading';

export function OrganizationTabHeading({ title, description, children }: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <header className="org-section-heading">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {children && <div className="org-section-actions">{children}</div>}
    </header>
  );
}

export type OrganizationStat = { label: string; value: ReactNode; icon: ReactNode };

export function OrganizationStatStrip({ items, loading = false }: { items: OrganizationStat[]; loading?: boolean }) {
  return (
    <div className="org-stat-strip">
      {items.map((item) => (
        <div className="org-stat" key={item.label}>
          <span className="org-stat-icon" aria-hidden="true">{item.icon}</span>
          <div><strong><OrganizationLoadingValue loading={loading}>{item.value}</OrganizationLoadingValue></strong><span>{item.label}</span></div>
        </div>
      ))}
    </div>
  );
}
