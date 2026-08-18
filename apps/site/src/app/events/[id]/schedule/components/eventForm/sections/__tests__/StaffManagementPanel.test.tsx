import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';

import type { EventFormValues } from '../../formTypes';
import { StaffManagementPanel } from '../StaffManagementPanel';

const mockPositionEditor = jest.fn((props: { showPositions?: boolean }) => (
    <section>
        <label>
            Staffing Priority
            <select aria-label="Staffing Priority" />
        </label>
        {props.showPositions ? <h2>Official Positions</h2> : null}
    </section>
));

jest.mock('../StaffOfficialPositionEditor', () => ({
    StaffOfficialPositionEditor: (props: { showPositions?: boolean }) => mockPositionEditor(props),
}));

const buildProps = (eventData: Partial<EventFormValues>, showCustomOfficialPositions = false) => ({
    control: {},
    eventData: {
        staffingPriority: 'BEST_AVAILABLE_COVERAGE',
        officialPositions: [],
        ...eventData,
    },
    isOrganizationHostedEvent: false,
    sportDefaultPositionCount: 0,
    maxMediumTextLength: 160,
    maxShortTextLength: 80,
    showStaffAssignments: false,
    showDedicatedOfficials: false,
    showCustomOfficialPositions,
    showTeamOperations: false,
    onRosterEditsChange: jest.fn(),
    onTeamsOfficiateChange: jest.fn(),
    onStaffingPriorityChange: jest.fn(),
    onLoadSportDefaults: jest.fn(),
    onAddPosition: jest.fn(),
    onUpdatePosition: jest.fn(),
    onRemovePosition: jest.fn(),
} as unknown as ComponentProps<typeof StaffManagementPanel>);

describe('StaffManagementPanel staffing priority visibility', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('keeps Staffing Priority visible in the minimal direct-organizer workflow', () => {
        render(<StaffManagementPanel {...buildProps({})} />);

        expect(screen.getByLabelText('Staffing Priority')).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Official Positions' })).not.toBeInTheDocument();
        expect(mockPositionEditor).toHaveBeenLastCalledWith(expect.objectContaining({
            showPositions: false,
        }));
    });

    it('shows named positions only when enabled and relevant to the selected priority', () => {
        const { rerender } = render(
            <StaffManagementPanel
                {...buildProps({ staffingPriority: 'TEAM_COVERAGE_REQUIRED' }, true)}
            />,
        );

        expect(screen.getByLabelText('Staffing Priority')).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Official Positions' })).not.toBeInTheDocument();

        rerender(
            <StaffManagementPanel
                {...buildProps({ staffingPriority: 'OFFICIAL_COVERAGE_REQUIRED' }, true)}
            />,
        );

        expect(screen.getByRole('heading', { name: 'Official Positions' })).toBeInTheDocument();
        expect(mockPositionEditor).toHaveBeenLastCalledWith(expect.objectContaining({
            showPositions: true,
        }));
    });
});
