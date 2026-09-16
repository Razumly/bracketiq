'use client';

import { useState } from 'react';
import { CalendarDays, CircleDot, FileText, Search, RefreshCw } from 'lucide-react';
import { Button, Select, TextInput } from '@/components/organization/organization-operation-ui';
import { OrganizationStatStrip, OrganizationTabHeading } from '@/components/organization/OrganizationTabLayout';
import { OrganizationDataRegion } from '@/components/organization/OrganizationDataLoading';
import { formatEnumDisplayLabel } from '@/lib/enumUtils';

export type OrganizationEventTemplateSummary = {
  id: string;
  name: string;
  eventType?: string | null;
  sportId?: string | null;
  description?: string | null;
  updatedAt?: string | null;
};

type Props = {
  eventTemplates: OrganizationEventTemplateSummary[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void | Promise<void>;
  onCreateEvent: (templateId: string) => void;
};

function TemplateCard({ template, onCreateEvent }: { template: OrganizationEventTemplateSummary; onCreateEvent: Props['onCreateEvent'] }) {
  const updated = template.updatedAt ? new Date(template.updatedAt) : null;
  return (
    <article className="org-template-card">
      <div className="org-template-card-heading"><CircleDot aria-hidden="true" /><div><h3>{template.name}</h3><p>{formatEnumDisplayLabel(template.eventType, 'Event')}</p></div></div>
      <p className="org-template-description">{template.description || 'Reuse saved registration, resource, and schedule settings for your next event.'}</p>
      <div className="org-template-tags"><span>Saved event settings</span></div>
      <footer><span>{updated && !Number.isNaN(updated.getTime()) ? 'Updated ' + updated.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Ready to use'}</span><Button size="sm" variant="outline" onClick={() => onCreateEvent(template.id)}>Create event</Button></footer>
    </article>
  );
}

export default function OrganizationEventTemplatesTabContent({ eventTemplates, isLoading, error, onRefresh, onCreateEvent }: Props) {
  const [query, setQuery] = useState('');
  const [eventType, setEventType] = useState('');
  const [sort, setSort] = useState('recent');
  const types = [...new Set(eventTemplates.flatMap((template) => template.eventType ? [template.eventType] : []))];
  const filtered = eventTemplates.filter((template) => template.name.toLowerCase().includes(query.toLowerCase()) && (!eventType || template.eventType === eventType));
  if (sort === 'name') filtered.sort((a, b) => a.name.localeCompare(b.name));
  else filtered.sort((a, b) => (Date.parse(b.updatedAt || '') || 0) - (Date.parse(a.updatedAt || '') || 0));
  return (
    <section className="org-section">
      <OrganizationTabHeading title="Event templates" description="Reuse event settings to publish faster"><Button variant="outline" onClick={() => void onRefresh()} loading={isLoading} leftSection={<RefreshCw />}>Refresh</Button></OrganizationTabHeading>
      <OrganizationStatStrip loading={isLoading} items={[
        { label: 'templates', value: eventTemplates.length, icon: <FileText /> },
        { label: 'event formats', value: types.length, icon: <CalendarDays /> },
      ]} />
      <div className="org-filter-toolbar">
        <TextInput aria-label="Search event templates" placeholder="Search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} leftSection={<Search className="size-4" />} />
        <Select aria-label="Event type" placeholder="Event type" value={eventType} onChange={(value) => setEventType(value ?? '')} data={types.map((type) => ({ value: type, label: formatEnumDisplayLabel(type, 'Event') }))} clearable />
        <Select aria-label="Sort templates" value={sort} onChange={(value) => setSort(value ?? 'recent')} data={[{ value: 'recent', label: 'Last updated' }, { value: 'name', label: 'Name' }]} />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <OrganizationDataRegion loading={isLoading} label="event templates" layout="cards">
        <div className="org-template-grid">{filtered.map((template) => <TemplateCard key={template.id} template={template} onCreateEvent={onCreateEvent} />)}</div>
        {!error && filtered.length === 0 && <p className="org-empty-copy">{eventTemplates.length ? 'No templates match your filters.' : 'No event templates yet.'}</p>}
      </OrganizationDataRegion>
    </section>
  );
}
