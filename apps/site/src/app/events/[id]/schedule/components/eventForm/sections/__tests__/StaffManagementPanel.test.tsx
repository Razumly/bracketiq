import type { ComponentProps } from 'react';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';

import type { EventFormValues } from '../../formTypes';
import { StaffManagementPanel } from '../StaffManagementPanel';

type PositionEditorProps = {
    showPositions?: boolean;
    onStaffingPriorityChange: (value: string) => void;
};

const mockPositionEditor = jest.fn((props: PositionEditorProps) => (
    <section>
        <label>
            Staffing Priority
            <select aria-label="Staffing Priority" onChange={(event) => props.onStaffingPriorityChange(event.currentTarget.value)}>
                <option value="BEST_AVAILABLE_COVERAGE">Best Available Coverage</option>
                <option value="TEAM_COVERAGE_REQUIRED">Team Coverage Required</option>
                <option value="OFFICIAL_COVERAGE_REQUIRED">Official Coverage Required</option>
            </select>
        </label>
        {props.showPositions ? <h2>Official Positions</h2> : null}
    </section>
));

jest.mock('../StaffOfficialPositionEditor', () => ({
    StaffOfficialPositionEditor: (props: PositionEditorProps) => mockPositionEditor(props),
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

const renderPanel = (props: ComponentProps<typeof StaffManagementPanel>) => {
    const { result } = renderHook(() => useForm<EventFormValues>({ defaultValues: props.eventData }));
    return {
        ...render(<StaffManagementPanel {...props} control={result.current.control} />, {
            wrapper: ({ children }) => <MantineProvider env="test">{children}</MantineProvider>,
        }),
        control: result.current.control,
    };
};

describe('StaffManagementPanel staffing priority visibility', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('changes Team duties and Staffing Priority without dedicated assignments', () => {
        const props = buildProps({});
        renderPanel(props);

        fireEvent.click(screen.getByRole('switch', { name: /Teams provide officials/i }));
        fireEvent.change(screen.getByLabelText('Staffing Priority'), { target: { value: 'TEAM_COVERAGE_REQUIRED' } });

        expect(props.onTeamsOfficiateChange).toHaveBeenCalledWith(true);
        expect(props.onStaffingPriorityChange).toHaveBeenCalledWith('TEAM_COVERAGE_REQUIRED');
        expect(screen.queryByRole('heading', { name: 'Official Positions' })).not.toBeInTheDocument();
        expect(mockPositionEditor).toHaveBeenLastCalledWith(expect.objectContaining({
            showPositions: false,
        }));
    });

    it('keeps enabled named positions when Staffing Priority changes', () => {
        const props = buildProps({ staffingPriority: 'TEAM_COVERAGE_REQUIRED' }, true);
        const { rerender, control } = renderPanel(props);

        fireEvent.change(screen.getByLabelText('Staffing Priority'), { target: { value: 'OFFICIAL_COVERAGE_REQUIRED' } });
        expect(props.onStaffingPriorityChange).toHaveBeenCalledWith('OFFICIAL_COVERAGE_REQUIRED');
        expect(screen.getByRole('heading', { name: 'Official Positions' })).toBeInTheDocument();

        rerender(
            <StaffManagementPanel
                {...buildProps({ staffingPriority: 'OFFICIAL_COVERAGE_REQUIRED' }, true)}
                control={control}
            />,
        );

        expect(screen.getByRole('heading', { name: 'Official Positions' })).toBeInTheDocument();
        expect(mockPositionEditor).toHaveBeenLastCalledWith(expect.objectContaining({
            showPositions: true,
        }));
    });
});
