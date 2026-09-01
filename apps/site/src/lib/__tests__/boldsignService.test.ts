import { boldsignService } from '@/lib/boldsignService';
import { apiRequest } from '@/lib/apiClient';

jest.mock('@/lib/apiClient', () => ({
  apiRequest: jest.fn(),
}));

const apiRequestMock = apiRequest as jest.MockedFunction<typeof apiRequest>;

describe('boldsignService', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it('sends multipart form data for PDF template creation', async () => {
    apiRequestMock.mockResolvedValue({
      createUrl: 'https://app.boldsign.com/template/edit/tmpl_pdf',
      template: {
        $id: 'tmpl_pdf',
        organizationId: 'org_1',
        title: 'PDF Waiver',
        signOnce: true,
        type: 'PDF',
      },
    });

    const file = new File(['pdf-content'], 'waiver.pdf', { type: 'application/pdf' });

    await boldsignService.createTemplate({
      organizationId: 'org_1',
      userId: 'user_1',
      title: 'PDF Waiver',
      signOnce: true,
      requiredSignerType: 'PARTICIPANT',
      type: 'PDF',
      file,
    });

    expect(apiRequestMock).toHaveBeenCalledWith(
      '/api/organizations/org_1/templates',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData),
        timeoutMs: 60_000,
      }),
    );

    const options = apiRequestMock.mock.calls[0][1];
    const body = options?.body as FormData;
    expect(body.get('type')).toBe('PDF');
    expect(body.get('title')).toBe('PDF Waiver');
    expect(body.get('requiredSignerType')).toBe('PARTICIPANT');
    expect(body.get('file')).toBe(file);
  });

  it('includes type and content when creating TEXT templates', async () => {
    apiRequestMock.mockResolvedValue({
      template: {
        $id: 'tmpl_text',
        organizationId: 'org_1',
        title: 'Text Waiver',
        signOnce: true,
        type: 'TEXT',
        content: 'Sample waiver text',
      },
    });

    await boldsignService.createTemplate({
      organizationId: 'org_1',
      userId: 'user_1',
      title: 'Text Waiver',
      signOnce: true,
      requiredSignerType: 'PARTICIPANT',
      type: 'TEXT',
      content: 'Sample waiver text',
    });

    expect(apiRequestMock).toHaveBeenCalledWith(
      '/api/organizations/org_1/templates',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          userId: 'user_1',
          template: expect.objectContaining({
            type: 'TEXT',
            content: 'Sample waiver text',
            requiredSignerType: 'PARTICIPANT',
          }),
        }),
      }),
    );
  });
  it('loads and maps every template Version through the service seam', async () => {
    apiRequestMock.mockResolvedValue({
      templates: [{
        $id: 'version_2',
        organizationId: 'org_1',
        documentRequirementId: 'requirement_1',
        versionSequence: 2,
        title: 'Current waiver',
        requiredSignerType: 'PARENT_GUARDIAN_CHILD',
        type: 'TEXT',
        content: 'Waiver content',
      }],
    });

    const templates = await boldsignService.getTemplates({
      organizationId: 'org_1',
      isVersionHistoryIncluded: true,
    });

    expect(templates).toEqual([
      expect.objectContaining({
        $id: 'version_2',
        documentRequirementId: 'requirement_1',
        versionSequence: 2,
        requiredSignerType: 'PARENT_GUARDIAN_CHILD',
        type: 'TEXT',
      }),
    ]);
    expect(apiRequestMock).toHaveBeenCalledWith(
      '/api/organizations/org_1/templates?includeVersions=true',
      { method: 'GET' },
    );
  });
  it('fails loudly when the template list response is malformed', async () => {
    apiRequestMock.mockResolvedValue({});

    await expect(boldsignService.getTemplates({
      organizationId: 'org_1',
    })).rejects.toThrow('The template response did not include a templates array.');
  });



  it('updates a text template through the organization template service', async () => {
    apiRequestMock.mockResolvedValue({
      newVersionCreated: true,
      newVersionSequence: 2,
      previousVersionId: 'tmpl_doc_1',
    });

    const result = await boldsignService.updateTemplate({
      organizationId: 'org_1',
      templateDocumentId: 'tmpl_doc_1',
      title: 'Updated waiver',
      description: null,
      content: 'Updated waiver content',
    });

    expect(result).toEqual(expect.objectContaining({
      newVersionCreated: true,
      newVersionSequence: 2,
    }));
    expect(apiRequestMock).toHaveBeenCalledWith(
      '/api/organizations/org_1/templates/tmpl_doc_1',
      {
        method: 'PATCH',
        body: {
          title: 'Updated waiver',
          description: null,
          content: 'Updated waiver content',
        },
      },
    );
  });
});
