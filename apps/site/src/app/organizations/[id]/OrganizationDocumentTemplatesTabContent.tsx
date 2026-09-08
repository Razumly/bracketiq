'use client';

import { useState } from 'react';
import { CheckCircle2, Clock3, FileText, Plus, Search } from 'lucide-react';
import { Badge, Button, Group, Select, Stack, Table, Text, TextInput } from '@/components/organization/organization-operation-ui';
import { OrganizationStatStrip, OrganizationTabHeading } from '@/components/organization/OrganizationTabLayout';
import { OrganizationLoadingRows, useOrganizationDataLoading } from '@/components/organization/OrganizationDataLoading';
import type { TemplateDocument, TemplateRequiredSignerType } from '@/types';
import { getRequiredSignerTypeLabel } from '@/lib/templateSignerTypes';

export type OrganizationPendingDocumentTemplate = {
  localId: string;
  operationId: string;
  templateId?: string;
  templateDocumentId?: string;
  title: string;
  description?: string;
  signOnce: boolean;
  requiredSignerType: TemplateRequiredSignerType;
  status: string;
  error?: string;
};

export type OrganizationDocumentTemplatesTabContentProps = {
  templateDocuments: TemplateDocument[];
  pendingTemplateCreates: OrganizationPendingDocumentTemplate[];
  selectedTemplateVersionByRequirement: Map<string, string>;
  isLoading: boolean;
  error: string | null;
  editingTemplateId: string | null;
  deletingTemplateId: string | null;
  savingTemplateVersion: boolean;
  onRefresh: () => void | Promise<unknown>;
  onCreateTemplate: () => void;
  onEditTextTemplate: (template: TemplateDocument) => void;
  onPreviewTemplate: (template: TemplateDocument) => void;
  onEditPdfTemplate: (template: TemplateDocument) => void | Promise<void>;
  onDeleteTemplate: (template: TemplateDocument) => void | Promise<void>;
};


type TemplateActionsProps = Pick<OrganizationDocumentTemplatesTabContentProps, 'onEditTextTemplate' | 'onPreviewTemplate' | 'onEditPdfTemplate' | 'onDeleteTemplate' | 'editingTemplateId' | 'deletingTemplateId' | 'savingTemplateVersion'> & { template: TemplateDocument };

function TemplateActions({ template, onEditTextTemplate, onPreviewTemplate, onEditPdfTemplate, onDeleteTemplate, editingTemplateId, deletingTemplateId, savingTemplateVersion }: TemplateActionsProps) {
  const isText = template.type === 'TEXT';
  return (
    <Group gap="xs" wrap="nowrap">
      {isText && <Button size="sm" variant="outline" onClick={() => onPreviewTemplate(template)} disabled={deletingTemplateId === template.$id}>Preview</Button>}
      <Button size="sm" variant="subtle" loading={editingTemplateId === template.$id} disabled={deletingTemplateId === template.$id || savingTemplateVersion} onClick={() => { if (isText) onEditTextTemplate(template); else void onEditPdfTemplate(template); }}>Edit</Button>
      <Button size="sm" variant="subtle" color="red" loading={deletingTemplateId === template.$id} disabled={editingTemplateId === template.$id} onClick={() => void onDeleteTemplate(template)}>Delete</Button>
    </Group>
  );
}

function TemplatePreview({ template }: { template: TemplateDocument | null }) {
  if (!template) return <section className="org-reference-card"><h3>Template details</h3><p>Select a template to see its signing requirements and version.</p></section>;
  return (
    <section className="org-reference-card org-document-preview">
      <h3>{template.title}</h3>
      <Badge variant="light" color={template.frozenAt ? 'orange' : 'teal'}>{template.frozenAt ? 'Frozen' : 'Editable'}</Badge>
      <p>{template.description}</p>
      <h4>Signing requirements</h4>
      <p>{getRequiredSignerTypeLabel(template.requiredSignerType)}</p>
      <p>{template.signOnce ? 'Sign once per participant' : 'Sign for every event'}</p>
      <h4>Version {template.versionSequence ?? 1}</h4>
      <p>{template.frozenAt ? 'Existing assignments stay pinned to this version.' : 'Editable until assigned or signed.'}</p>
    </section>
  );
}

export default function OrganizationDocumentTemplatesTabContent(props: OrganizationDocumentTemplatesTabContentProps) {
  const { templateDocuments, pendingTemplateCreates, selectedTemplateVersionByRequirement, isLoading, error, onRefresh, onCreateTemplate } = props;
  const isDataLoading = useOrganizationDataLoading(isLoading);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = templateDocuments.find((template) => template.$id === selectedId) ?? null;
  const frozen = templateDocuments.filter((template) => template.frozenAt).length;
  const filtered = templateDocuments.filter((template) => {
    if (!template.title.toLowerCase().includes(query.toLowerCase())) return false;
    if (type && (template.type ?? 'PDF') !== type) return false;
    return status === 'all' || (status === 'frozen' ? Boolean(template.frozenAt) : !template.frozenAt);
  });
  return (
    <section className="org-section">
      <OrganizationTabHeading title="Document templates" description="Create reusable waivers, releases, and agreements">
        <Button variant="outline" onClick={() => void onRefresh()} loading={isLoading}>Refresh</Button>
        <Button onClick={onCreateTemplate} leftSection={<Plus />}>Create Document Template</Button>
      </OrganizationTabHeading>
      <OrganizationStatStrip loading={isDataLoading} items={[
        { label: 'templates', value: templateDocuments.length, icon: <FileText /> },
        { label: 'editable', value: templateDocuments.length - frozen, icon: <CheckCircle2 /> },
        { label: 'frozen versions', value: frozen, icon: <FileText /> },
        { label: 'pending', value: pendingTemplateCreates.length, icon: <Clock3 /> },
      ]} />
      <div className="org-filter-toolbar">
        <TextInput aria-label="Search document templates" placeholder="Search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} leftSection={<Search className="size-4" />} />
        <Select aria-label="Document type" placeholder="Document type" data={['PDF', 'TEXT']} value={type} onChange={(value) => setType(value ?? '')} clearable />
        <Select aria-label="Template status" value={status} onChange={(value) => setStatus(value ?? 'all')} data={[{ value: 'all', label: 'All versions' }, { value: 'editable', label: 'Editable' }, { value: 'frozen', label: 'Frozen' }]} />
      </div>
      {error && <Text role="alert" c="red" size="sm">{error}</Text>}
      {pendingTemplateCreates.map((template) => <div className="org-reference-card" key={template.localId}><strong>{template.title}</strong><p>{template.error || 'Creating template…'}</p></div>)}
      <div className="org-document-workspace">
        <div className="org-reference-table">
          <Table.ScrollContainer minWidth={760}>
            <Table highlightOnHover><Table.Thead><Table.Tr><Table.Th>Template</Table.Th><Table.Th>Type</Table.Th><Table.Th>Required for</Table.Th><Table.Th>Version</Table.Th><Table.Th>Status</Table.Th><Table.Th>Actions</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody aria-busy={isDataLoading}>{isDataLoading ? <OrganizationLoadingRows columns={6} label="templates" /> : <>{filtered.map((template) => (
                <Table.Tr key={template.$id} onClick={() => setSelectedId(template.$id)} data-selected={template.$id === selectedId}>
                  <Table.Td><button type="button" className="org-document-name" onClick={() => setSelectedId(template.$id)}><FileText />{template.title || 'Untitled Template'}</button></Table.Td>
                  <Table.Td>{template.type ?? 'PDF'}</Table.Td>
                  <Table.Td><Stack gap={2}><Text size="xs">{getRequiredSignerTypeLabel(template.requiredSignerType)}</Text><Text size="xs" c="dimmed">{template.signOnce ? 'Sign once per participant' : 'Sign for every event'}</Text></Stack></Table.Td>
                  <Table.Td><Text size="xs">Version {template.versionSequence}{template.documentRequirementId && selectedTemplateVersionByRequirement.get(template.documentRequirementId) === template.$id ? ' · Selected version' : ''}</Text></Table.Td>
                  <Table.Td><Badge color={template.frozenAt ? 'orange' : 'teal'}>{template.frozenAt ? 'Frozen' : 'Editable'}</Badge></Table.Td>
                  <Table.Td><TemplateActions {...props} template={template} /></Table.Td>
                </Table.Tr>
              ))}{!error && filtered.length === 0 && <Table.Tr><Table.Td colSpan={6}><p className="org-empty-copy">{templateDocuments.length ? 'No templates match your filters.' : 'No templates yet.'}</p></Table.Td></Table.Tr>}</>}</Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </div>
        <TemplatePreview template={selected} />
      </div>
    </section>
  );
}
