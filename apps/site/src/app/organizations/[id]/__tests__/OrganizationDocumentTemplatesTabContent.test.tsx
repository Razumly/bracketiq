import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import OrganizationDocumentTemplatesTabContent from '../OrganizationDocumentTemplatesTabContent';
import type { TemplateDocument } from '@/types';

jest.mock('@/components/ui/ResponsiveCardGrid', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const template: TemplateDocument = {
  $id: 'document-template-1',
  organizationId: 'org-1',
  documentRequirementId: 'requirement-1',
  versionSequence: 1,
  title: 'Participant Waiver',
  description: 'A sample waiver.',
  signOnce: true,
  requiredSignerType: 'PARTICIPANT',
  type: 'TEXT',
  status: 'ACTIVE',
  content: 'Sample waiver content.',
};

const defaultProps = {
  templateDocuments: [template],
  pendingTemplateCreates: [],
  selectedTemplateVersionByRequirement: new Map([['requirement-1', 'document-template-1']]),
  isLoading: false,
  error: null,
  editingTemplateId: null,
  deletingTemplateId: null,
  savingTemplateVersion: false,
  onRefresh: jest.fn(),
  onCreateTemplate: jest.fn(),
  onEditTextTemplate: jest.fn(),
  onPreviewTemplate: jest.fn(),
  onEditPdfTemplate: jest.fn(),
  onDeleteTemplate: jest.fn(),
};

describe('OrganizationDocumentTemplatesTabContent', () => {
  it('renders a document template and delegates its actions', async () => {
    const user = userEvent.setup();
    const onEditTextTemplate = jest.fn();
    const onPreviewTemplate = jest.fn();
    const onDeleteTemplate = jest.fn();
    const onCreateTemplate = jest.fn();

    render(
      <OrganizationDocumentTemplatesTabContent
        {...defaultProps}
        onEditTextTemplate={onEditTextTemplate}
        onPreviewTemplate={onPreviewTemplate}
        onDeleteTemplate={onDeleteTemplate}
        onCreateTemplate={onCreateTemplate}
      />,
    );

    expect(screen.getByText('Participant Waiver')).toBeInTheDocument();
    expect(screen.getByText('Version 1 · Selected version')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Create Document Template' }));
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onCreateTemplate).toHaveBeenCalledTimes(1);
    expect(onEditTextTemplate).toHaveBeenCalledWith(template);
    expect(onPreviewTemplate).toHaveBeenCalledWith(template);
    expect(onDeleteTemplate).toHaveBeenCalledWith(template);
  });

  it('keeps the document template surface visible during loading and errors', () => {
    const { rerender } = render(
      <OrganizationDocumentTemplatesTabContent
        {...defaultProps}
        templateDocuments={[]}
        isLoading
      />,
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();

    rerender(
      <OrganizationDocumentTemplatesTabContent
        {...defaultProps}
        templateDocuments={[]}
        error="Request failed"
      />,
    );

    expect(screen.getByText('Request failed')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
    expect(screen.queryByText('No templates yet.')).not.toBeInTheDocument();
  });
});
