'use client';

import { useId, useState, type ReactNode, type KeyboardEvent } from 'react';

export type CustomerDetailTab = 'overview' | 'roster' | 'events' | 'billing' | 'documents';

export default function OrganizationCustomerProfile({ header, rosterLabel, renderContent }: {
  header: ReactNode;
  rosterLabel: 'Teams' | 'Roster';
  renderContent: (tab: CustomerDetailTab) => ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<CustomerDetailTab>('overview');
  const id = useId();
  const tabs: { key: CustomerDetailTab; label: string }[] = [
    { key: 'overview', label: 'Overview' }, { key: 'roster', label: rosterLabel },
    { key: 'events', label: 'Events' }, { key: 'billing', label: 'Billing' },
    { key: 'documents', label: 'Documents' },
  ];
  const navigate = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const destinations: Record<string, number> = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 };
    const next = destinations[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setActiveTab(tabs[next].key);
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons?.[next]?.focus();
  };
  return <>
    <div className="org-customer-profile-header">{header}</div>
    <div className="org-customer-detail-tabs" role="tablist" aria-label="Customer information">
      {tabs.map((tab, index) => <button key={tab.key} type="button" role="tab" id={`${id}-${tab.key}`} aria-controls={`${id}-panel`} aria-selected={activeTab === tab.key} tabIndex={activeTab === tab.key ? 0 : -1} onClick={() => setActiveTab(tab.key)} onKeyDown={(event) => navigate(event, index)}>{tab.label}</button>)}
    </div>
    <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${activeTab}`} tabIndex={0} className="org-customer-profile-content">{renderContent(activeTab)}</div>
  </>;
}
