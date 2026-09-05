import { useState } from 'react';
import {
    fireEvent,
    render,
    screen,
} from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

import type { EventFormValues } from '../../formTypes';
import { EventFormDivisionSection } from '../EventFormDivisionSection';

jest.mock('../DivisionSettingsSection', () => ({
    DivisionSettingsSection: ({ children }: { children: React.ReactNode }) => (
        <section data-testid="division-section">{children}</section>
    ),
}));
jest.mock('../DivisionModeControls', () => ({
    DivisionModeControls: () => <div data-testid="division-mode" />,
}));
jest.mock('../SingleDivisionDefaultsPanel', () => ({
    SingleDivisionDefaultsPanel: ({ onAllowPaymentPlansChange }: {
        onAllowPaymentPlansChange: (value: boolean) => void;
    }) => (
        <button type="button" onClick={() => onAllowPaymentPlansChange(true)}>
            Enable payment plans
        </button>
    ),
}));
jest.mock('../DivisionEditorHeader', () => ({
    DivisionEditorHeader: () => <div data-testid="division-editor-header" />,
}));
jest.mock('../DivisionEditorLeaguePanel', () => ({
    DivisionEditorLeaguePanel: () => <div data-testid="division-editor-league" />,
}));
jest.mock('../DivisionEditorActionsAndErrors', () => ({
    DivisionEditorActionsAndErrors: () => <div data-testid="division-actions" />,
}));
jest.mock('../DivisionSummaryList', () => ({
    DivisionSummaryList: ({ hideOperationalDetails = false }: {
        hideOperationalDetails?: boolean;
    }) => (
        <div
            data-testid="division-summary"
            data-affiliate-mode={hideOperationalDetails ? 'true' : 'false'}
        />
    ),
}));

const buildEventData = (overrides: Partial<EventFormValues> = {}): EventFormValues => ({
    $id: 'event_1',
    eventType: 'EVENT',
    singleDivision: true,
    teamSignup: false,
    splitLeaguePlayoffDivisions: false,
    divisionDetails: [],
    playoffDivisionDetails: [],
    price: 0,
    maxParticipants: 8,
    allowPaymentPlans: false,
    installmentCount: 0,
    installmentAmounts: [],
    sportId: '',
    sportConfig: null,
    leagueData: { includePlayoffs: false },
    playoffData: {},
    tournamentData: {},
    ...overrides,
} as EventFormValues);

const buildDivisionController = () => ({
    divisionEditor: {
        editingId: null,
        divisionKind: 'LEAGUE',
        name: '',
        maxParticipants: 8,
        playoffConfig: {},
        error: null,
    },
    divisionEditorReady: true,
    divisionMaxParticipantsWarning: null,
    handleDivisionEditorKindChange: jest.fn(),
    handleEditDivisionDetail: jest.fn(),
    handleEditPlayoffDivisionDetail: jest.fn(),
    handleRemoveDivisionDetail: jest.fn(),
    handleRemovePlayoffDivision: jest.fn(),
    removeDivisionInstallment: jest.fn(),
    resetDivisionEditor: jest.fn(),
    setDivisionEditor: jest.fn(),
    setDivisionEditorLeagueConfig: jest.fn(),
    setDivisionEditorPlayoffConfig: jest.fn(),
    setDivisionInstallmentAmount: jest.fn(),
    setDivisionInstallmentDueDate: jest.fn(),
    setDivisionInstallmentDueRelativeDay: jest.fn(),
    singleDivisionPoolPlayDefaults: {},
    splitDivisionEditorEnabled: false,
    syncDivisionInstallmentCount: jest.fn(),
    updateDivisionEditorSelection: jest.fn(),
    updateSingleDivisionTournamentPoolDefaults: jest.fn(),
});

const buildPaymentController = () => ({
    connectStripe: jest.fn(),
    connectingStripe: false,
    eventTaxableForPreview: false,
    eventTaxPolicyForPreview: { organizerResponsibilityMessage: '' },
    organizationDefaultEventTaxHandling: 'PLATFORM',
    organizerManualTaxSelected: false,
    organizerTaxCollectionAllowed: false,
    pricingControlsEnabled: true,
    removeInstallment: jest.fn(),
    setInstallmentAmount: jest.fn(),
    setInstallmentDueDate: jest.fn(),
    setInstallmentDueRelativeDay: jest.fn(),
    syncInstallmentCount: jest.fn(),
});

const renderSection = ({
    isAffiliateEvent = false,
    eventData = buildEventData(),
    paymentController = buildPaymentController(),
    setValue = jest.fn(),
    playoffDivision = false,
}: {
    isAffiliateEvent?: boolean;
    eventData?: EventFormValues;
    paymentController?: ReturnType<typeof buildPaymentController>;
    setValue?: jest.Mock;
    playoffDivision?: boolean;
} = {}) => {
    function Section() {
        const controller = buildDivisionController();
        const [divisionEditor, setDivisionEditor] = useState({
            ...controller.divisionEditor,
            divisionKind: playoffDivision ? 'PLAYOFF' : 'LEAGUE',
            phaseSettings: {},
        });
        return (
        <MantineProvider>
            <EventFormDivisionSection
            collapsed={false}
            comboboxProps={{}}
            control={{} as never}
            divisionController={{ ...controller, divisionEditor, setDivisionEditor, splitDivisionEditorEnabled: playoffDivision } as never}
            divisionTypeOptions={[]}
            errors={{}}
            eventData={eventData}
            hasExternalRentalField={false}
            isAffiliateEvent={isAffiliateEvent}
            isImmutableField={() => false}
            isOrganizationHostedEvent={false}
            maxMediumTextLength={160}
            maxPriceCents={999_999_900}
            maxStandardNumber={99_999}
            numberInputStyles={{}}
            onSaveDivision={jest.fn()}
            onToggle={jest.fn()}
            paymentController={paymentController as never}
            playoffData={eventData.playoffData}
            setLeagueData={jest.fn()}
            setPlayoffData={jest.fn()}
            setTournamentData={jest.fn()}
            setValue={setValue}
            showsFixedTeamEventToggle={false}
            splitLeaguePlayoffDivisionsLocked={false}
            supportsEditableTeamSignup
            tournamentData={eventData.tournamentData}
            />
        </MantineProvider>
        );
    }
    render(<Section />);
    return { paymentController, setValue };
};

describe('EventFormDivisionSection', () => {
    it('renders standard division controls and forwards payment-plan activation', () => {
        const { paymentController, setValue } = renderSection();

        expect(screen.getByTestId('division-mode')).toBeInTheDocument();
        expect(screen.getByTestId('division-summary')).toHaveAttribute('data-affiliate-mode', 'false');

        fireEvent.click(screen.getByRole('button', { name: 'Enable payment plans' }));
        expect(setValue).toHaveBeenCalledWith('allowPaymentPlans', true, {
            shouldDirty: true,
            shouldValidate: true,
        });
        expect(paymentController.syncInstallmentCount).toHaveBeenCalledWith(1);
    });

    it('keeps playoff controls and hides payment controls with external registration', () => {
        renderSection({
            isAffiliateEvent: true,
            eventData: buildEventData({ eventType: 'LEAGUE', singleDivision: false }),
            playoffDivision: true,
        });

        expect(screen.queryByRole('button', { name: 'Enable payment plans' })).not.toBeInTheDocument();
        const nameInput = screen.getByRole('textbox', { name: 'Playoff Division Name' });
        fireEvent.change(nameInput, { target: { value: 'Championship' } });
        expect(nameInput).toHaveValue('Championship');
    });
});
