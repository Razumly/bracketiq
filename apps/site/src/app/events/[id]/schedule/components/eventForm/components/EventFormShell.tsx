import type { ReactNode } from 'react';
import { Alert } from '@/components/organization/organization-operation-ui';

import {
    SectionNavigation,
    type SectionNavigationItem,
} from './SectionNavigation';

type EventFormShellProps = {
    formId?: string;
    sectionNavItems: SectionNavigationItem[];
    activeSectionId: string;
    mobileEditUnsupportedWarning?: string | null;
    leagueWarning?: string | null;
    leagueError?: string | null;
    onSelectSection: (sectionId: string) => void;
    hideSectionNavigation?: boolean;
    validationErrorCount?: number;
    firstValidationError?: string;
    children: ReactNode;
};

export const EventFormShell = ({
    formId,
    sectionNavItems,
    activeSectionId,
    mobileEditUnsupportedWarning,
    leagueWarning,
    leagueError,
    onSelectSection,
    hideSectionNavigation = false,
    validationErrorCount = 0,
    firstValidationError,
    children,
}: EventFormShellProps) => (
    <div className="w-full">
        <div className={hideSectionNavigation
            ? 'grid grid-cols-1 gap-5'
            : 'grid grid-cols-1 gap-5 xl:grid-cols-[220px_minmax(0,1fr)]'}>
            {!hideSectionNavigation ? <SectionNavigation
                items={sectionNavItems}
                activeSectionId={activeSectionId}
                variant="desktop"
                onSelectSection={onSelectSection}
            /> : null}

            <div className="min-w-0">
                {validationErrorCount > 0 ? (
                    <Alert color="red" variant="light" radius="md" mb="md" role="status" aria-live="polite">
                        {validationErrorCount} {validationErrorCount === 1 ? 'issue needs' : 'issues need'} attention.
                        {firstValidationError ? ` ${firstValidationError}` : ''}
                    </Alert>
                ) : null}
                {!hideSectionNavigation ? <SectionNavigation
                    items={sectionNavItems}
                    activeSectionId={activeSectionId}
                    variant="mobile"
                    onSelectSection={onSelectSection}
                /> : null}
                <div className="w-full">
                    {mobileEditUnsupportedWarning && (
                        <Alert color="yellow" variant="light" radius="md" mb="md">
                            {mobileEditUnsupportedWarning}
                        </Alert>
                    )}
                    <form id={formId} className={hideSectionNavigation ? 'grid grid-cols-1 gap-6 lg:grid-cols-2' : 'space-y-6'}>
                        {children}
                    </form>
                </div>

                <div className="mt-5 flex flex-col gap-3">
                    {leagueWarning && (
                        <Alert color="yellow" radius="md">
                            {leagueWarning}
                        </Alert>
                    )}
                    {leagueError && (
                        <Alert color="red" radius="md">
                            {leagueError}
                        </Alert>
                    )}
                </div>
            </div>
        </div>
    </div>
);
