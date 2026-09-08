'use client';

import { createContext, useContext, type ReactNode } from 'react';
import './organization-data-loading.css';

const OrganizationDataLoadingContext = createContext(false);

export function useOrganizationDataLoading(loading = false) {
  const organizationLoading = useContext(OrganizationDataLoadingContext);
  return organizationLoading || loading;
}

export function OrganizationDataLoadingProvider({ loading, children }: { loading: boolean; children: ReactNode }) {
  const isLoading = useOrganizationDataLoading(loading);
  return <OrganizationDataLoadingContext.Provider value={isLoading}>{children}</OrganizationDataLoadingContext.Provider>;
}

export function OrganizationLoadingValue({ children, loading = false }: { children: ReactNode; loading?: boolean }) {
  const isLoading = useOrganizationDataLoading(loading);
  if (!isLoading) return <>{children}</>;
  return <span className="org-loading-value" aria-label="Loading value"><span aria-hidden="true" className="org-skeleton" /></span>;
}

export function OrganizationDataPlaceholder({ label, layout = 'rows', count = 3 }: {
  label: string;
  layout?: 'cards' | 'rows' | 'detail';
  count?: number;
}) {
  return (
    <div role="status" aria-label={`Loading ${label}`} className={`org-data-placeholder org-data-placeholder--${layout}`}>
      <span className="sr-only">Loading {label}</span>
      {Array.from({ length: layout === 'detail' ? 1 : count }, (_, index) => (
        <div key={index} className="org-data-placeholder__item" aria-hidden="true">
          {layout === 'cards' && <div className="org-skeleton org-data-placeholder__image" />}
          <div className="org-data-placeholder__copy">
            <div className="org-skeleton org-data-placeholder__title" />
            <div className="org-skeleton org-data-placeholder__line" />
            <div className="org-skeleton org-data-placeholder__line" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function OrganizationDataRegion({ children, loading = false, ...placeholder }: {
  children: ReactNode;
  loading?: boolean;
} & Parameters<typeof OrganizationDataPlaceholder>[0]) {
  const isLoading = useOrganizationDataLoading(loading);
  return <div aria-busy={isLoading}>{isLoading ? <OrganizationDataPlaceholder {...placeholder} /> : children}</div>;
}

export function OrganizationLoadingRows({ columns, label, rows = 4 }: { columns: number; label: string; rows?: number }) {
  return <>{Array.from({ length: rows }, (_, row) => (
    <tr key={row}>
      {Array.from({ length: columns }, (_, column) => (
        <td key={column} className="org-loading-cell">
          {row === 0 && column === 0 && <span role="status" className="sr-only">Loading {label}</span>}
          <span className="org-skeleton org-loading-cell__line" aria-hidden="true" />
        </td>
      ))}
    </tr>
  ))}</>;
}

export function OrganizationTableBody({ children, loading = false, unavailable = false, ...placeholder }: {
  children: ReactNode;
  loading?: boolean;
  unavailable?: boolean;
} & Parameters<typeof OrganizationLoadingRows>[0]) {
  const isLoading = useOrganizationDataLoading(loading);
  return <tbody aria-busy={isLoading}>{isLoading ? <OrganizationLoadingRows {...placeholder} /> : !unavailable && children}</tbody>;
}
