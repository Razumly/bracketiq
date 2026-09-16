import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import OrganizationEventTemplatesTabContent, {
  type OrganizationEventTemplateSummary,
} from '../OrganizationEventTemplatesTabContent';

jest.mock('@/components/ui/ResponsiveCardGrid', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const eventTemplates: OrganizationEventTemplateSummary[] = [
  { id: 'template-1', name: 'Saturday League', eventType: 'LEAGUE' },
];

describe('OrganizationEventTemplatesTabContent', () => {
  it('creates an event from the selected template', async () => {
    const user = userEvent.setup();
    const onCreateEvent = jest.fn();

    render(
      <OrganizationEventTemplatesTabContent
        eventTemplates={eventTemplates}
        isLoading={false}
        error={null}
        onRefresh={jest.fn()}
        onCreateEvent={onCreateEvent}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Create event' }));

    expect(onCreateEvent).toHaveBeenCalledWith('template-1');
  });

  it('shows loading and error states without hiding the tab surface', () => {
    const { rerender } = render(
      <OrganizationEventTemplatesTabContent
        eventTemplates={[]}
        isLoading
        error={null}
        onRefresh={jest.fn()}
        onCreateEvent={jest.fn()}
      />,
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();

    rerender(
      <OrganizationEventTemplatesTabContent
        eventTemplates={[]}
        isLoading={false}
        error="Request failed"
        onRefresh={jest.fn()}
        onCreateEvent={jest.fn()}
      />,
    );

    expect(screen.getByText('Request failed')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
    expect(screen.queryByText('No event templates yet.')).not.toBeInTheDocument();
  });
});
