'use client';

import { Button, Group, Loader, Paper, Stack, Text, Title } from '@/components/organization/organization-operation-ui';
import ResponsiveCardGrid from '@/components/ui/ResponsiveCardGrid';
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

const PendingTemplateCard = ({
  template,
}: {
  template: OrganizationPendingDocumentTemplate;
}) => (
  <Paper withBorder p="sm" radius="md" className="org-tab-item">
    <Text fw={600}>{template.title || 'Untitled Template'}</Text>
    <Text size="sm" c="dimmed">
      {template.signOnce ? 'Sign once per participant' : 'Sign for every event'}
    </Text>
    <Text size="xs" c="dimmed">
      Required signer: {getRequiredSignerTypeLabel(template.requiredSignerType)}
    </Text>
    <Text size="xs" c="dimmed">
      Type: PDF
    </Text>
    <Text size="xs" c={template.error ? 'red' : 'blue'}>
      Status: {template.error ? template.error : `Syncing (${template.status})`}
    </Text>
    {!template.error && (
      <Group gap="xs" mt="xs">
        <Loader size="xs" />
        <Text size="xs" c="dimmed">
          Creating template and waiting for projection…
        </Text>
      </Group>
    )}
  </Paper>
);

const DocumentTemplateCard = ({
  template,
  isSelectedVersion,
  editingTemplateId,
  deletingTemplateId,
  savingTemplateVersion,
  onEditTextTemplate,
  onPreviewTemplate,
  onEditPdfTemplate,
  onDeleteTemplate,
}: {
  template: TemplateDocument;
  isSelectedVersion: boolean;
  editingTemplateId: string | null;
  deletingTemplateId: string | null;
  savingTemplateVersion: boolean;
  onEditTextTemplate: (template: TemplateDocument) => void;
  onPreviewTemplate: (template: TemplateDocument) => void;
  onEditPdfTemplate: (template: TemplateDocument) => void | Promise<void>;
  onDeleteTemplate: (template: TemplateDocument) => void | Promise<void>;
}) => (
  <Paper withBorder p="sm" radius="md" className="org-tab-item">
    <Text fw={600}>{template.title || 'Untitled Template'}</Text>
    <Text size="xs" c="dimmed">
      {`Version ${template.versionSequence}`}
      {isSelectedVersion ? ' · Selected version' : ''}
    </Text>
    <Text size="xs" c={template.frozenAt ? 'orange' : 'green'}>
      {template.frozenAt ? 'Frozen: existing assignments stay pinned' : 'Editable until assigned or signed'}
    </Text>
    <Text size="sm" c="dimmed">
      {template.signOnce ? 'Sign once per participant' : 'Sign for every event'}
    </Text>
    <Text size="xs" c="dimmed">
      Required signer: {getRequiredSignerTypeLabel(template.requiredSignerType)}
    </Text>
    <Text size="xs" c="dimmed">
      Type: {template.type ?? 'PDF'}
    </Text>
    {template.status && (
      <Text size="xs" c="dimmed">
        Status: {template.status}
      </Text>
    )}
    <Group justify="flex-end" mt="sm">
      {template.type === 'TEXT' && (
        <Button
          size="xs"
          variant="light"
          onClick={() => onEditTextTemplate(template)}
          disabled={deletingTemplateId === template.$id || savingTemplateVersion}
        >
          Edit
        </Button>
      )}
      {template.type === 'TEXT' && (
        <Button
          size="xs"
          variant="light"
          onClick={() => onPreviewTemplate(template)}
          disabled={deletingTemplateId === template.$id}
        >
          Preview
        </Button>
      )}
      {(template.type ?? 'PDF') === 'PDF' && (
        <Button
          size="xs"
          variant="light"
          onClick={() => { void onEditPdfTemplate(template); }}
          loading={editingTemplateId === template.$id}
          disabled={deletingTemplateId === template.$id}
        >
          Edit
        </Button>
      )}
      <Button
        size="xs"
        color="red"
        variant="light"
        onClick={() => { void onDeleteTemplate(template); }}
        loading={deletingTemplateId === template.$id}
        disabled={editingTemplateId === template.$id}
      >
        Delete
      </Button>
    </Group>
  </Paper>
);

export default function OrganizationDocumentTemplatesTabContent({
  templateDocuments,
  pendingTemplateCreates,
  selectedTemplateVersionByRequirement,
  isLoading,
  error,
  editingTemplateId,
  deletingTemplateId,
  savingTemplateVersion,
  onRefresh,
  onCreateTemplate,
  onEditTextTemplate,
  onPreviewTemplate,
  onEditPdfTemplate,
  onDeleteTemplate,
}: OrganizationDocumentTemplatesTabContentProps) {
  const hasTemplates = pendingTemplateCreates.length > 0 || templateDocuments.length > 0;

  return (
    <Paper withBorder p="md" radius="md" className="org-tab-surface">
      <Group justify="space-between" mb="md" wrap="wrap">
        <Title order={5}>Document Templates</Title>
        <Group>
          <Button variant="default" onClick={() => { void onRefresh(); }} loading={isLoading}>
            Refresh
          </Button>
          <Button onClick={onCreateTemplate}>
            Create Document Template
          </Button>
        </Group>
      </Group>
      <Text size="sm" c="dimmed" mb="md">
        Create reusable documents for participants to sign during event registration.
      </Text>
      {error && (
        <Text size="sm" c="red" mb="md">
          {error}
        </Text>
      )}

      {isLoading ? (
        <Text size="sm" c="dimmed">Loading templates...</Text>
      ) : hasTemplates ? (
        <ResponsiveCardGrid>
          {pendingTemplateCreates.map((pendingTemplate) => (
            <PendingTemplateCard key={pendingTemplate.localId} template={pendingTemplate} />
          ))}
          {templateDocuments.map((template) => (
            <DocumentTemplateCard
              key={template.$id}
              template={template}
              isSelectedVersion={Boolean(
                template.documentRequirementId
                && selectedTemplateVersionByRequirement.get(template.documentRequirementId) === template.$id,
              )}
              editingTemplateId={editingTemplateId}
              deletingTemplateId={deletingTemplateId}
              savingTemplateVersion={savingTemplateVersion}
              onEditTextTemplate={onEditTextTemplate}
              onPreviewTemplate={onPreviewTemplate}
              onEditPdfTemplate={onEditPdfTemplate}
              onDeleteTemplate={onDeleteTemplate}
            />
          ))}
        </ResponsiveCardGrid>
      ) : (
        <Text size="sm" c="dimmed">No templates yet.</Text>
      )}
    </Paper>
  );
}
