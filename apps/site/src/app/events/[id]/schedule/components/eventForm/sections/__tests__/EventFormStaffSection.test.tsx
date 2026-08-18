import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Control } from 'react-hook-form';

import type { EventFormValues } from '../../formTypes';
import type { useStaffOfficialController } from '../../hooks/useStaffOfficialController';
import { EventFormStaffSection } from '../EventFormStaffSection';

type MockStaffPanelProps = {
    onRosterEditsChange: (checked: boolean) => void;
    onStaffingPriorityChange: (value: string | null) => void;
    onTeamsOfficiateChange: (checked: boolean) => void;
};

const mockStaffManagementPanel = jest.fn((_props: MockStaffPanelProps) => null);

jest.mock('../StaffSection', () => ({
    StaffSection: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}));

jest.mock('../StaffManagementPanel', () => ({
    StaffManagementPanel: (props: MockStaffPanelProps) => {
        mockStaffManagementPanel(props);
        return (
            <div>
                <button type="button" onClick={() => props.onRosterEditsChange(false)}>Disable roster edits</button>
                <button type="button" onClick={() => props.onTeamsOfficiateChange(false)}>Disable team officiating</button>
                <button type="button" onClick={() => props.onStaffingPriorityChange('TEAM_COVERAGE_REQUIRED')}>Require team coverage</button>
            </div>
        );
    },
}));

const buildProps = (overrides: Partial<{
    eventData: EventFormValues;
    setValue: jest.Mock;
    visible: boolean;
}> = {}) => ({
    collapsed: false,
    comboboxProps: { withinPortal: true },
    control: {} as Control<EventFormValues>,
    eventData: {
        doTeamsOfficiate: false,
        staffingPriority: 'BEST_AVAILABLE_COVERAGE',
    } as EventFormValues,
    isImmutableField: jest.fn(() => false),
    isOrganizationHostedEvent: false,
    maxMediumTextLength: 160,
    maxShortTextLength: 80,
    onToggle: jest.fn(),
    setValue: jest.fn(),
    staffController: {
        assignedUserIdSetByRole: { OFFICIAL: new Set<string>() },
        assistantHostValue: [],
        sportOfficialPositionTemplates: [],
    } as unknown as ReturnType<typeof useStaffOfficialController>,
    visible: true,
    ...overrides,
});

describe('EventFormStaffSection', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('does not mount staff controls when the section is hidden', () => {
        render(<EventFormStaffSection {...buildProps({ visible: false })} />);

        expect(mockStaffManagementPanel).not.toHaveBeenCalled();
    });

    it('keeps dependent staffing fields synchronized through the form writer', () => {
        const setValue = jest.fn();
        render(<EventFormStaffSection {...buildProps({ setValue })} />);

        fireEvent.click(screen.getByRole('button', { name: 'Disable roster edits' }));
        fireEvent.click(screen.getByRole('button', { name: 'Disable team officiating' }));
        fireEvent.click(screen.getByRole('button', { name: 'Require team coverage' }));

        expect(setValue).toHaveBeenCalledWith('allowTemporaryMatchPlayers', false, {
            shouldDirty: true,
            shouldValidate: true,
        });
        expect(setValue).toHaveBeenCalledWith('teamOfficialsMaySwap', false, {
            shouldDirty: true,
            shouldValidate: true,
        });
        expect(setValue).toHaveBeenCalledWith('staffingPriority', 'TEAM_COVERAGE_REQUIRED', {
            shouldDirty: true,
            shouldValidate: true,
        });
    });

    it('changes only Staffing Priority when its canonical control changes', () => {
        const setValue = jest.fn();
        render(<EventFormStaffSection {...buildProps({ setValue })} />);

        fireEvent.click(screen.getByRole('button', { name: 'Require team coverage' }));

        expect(setValue).toHaveBeenCalledTimes(1);
        expect(setValue).toHaveBeenCalledWith('staffingPriority', 'TEAM_COVERAGE_REQUIRED', {
            shouldDirty: true,
            shouldValidate: true,
        });
    });
});
