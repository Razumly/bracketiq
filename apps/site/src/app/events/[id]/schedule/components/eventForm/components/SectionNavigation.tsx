import { Text } from '@/components/organization/organization-operation-ui';

export type SectionNavigationItem = {
    id: string;
    label: string;
    errorCount?: number;
};

type EventFormSectionNavigationItem = SectionNavigationItem & {
    visible: boolean;
};

type BuildEventFormSectionNavigationItemsOptions = {
    showMatchRulesSection: boolean;
    showStaffSection: boolean;
    showManualPaymentsSection: boolean;
    scoringConfigSectionLabel: string;
    divisionSettingsSectionLabel?: string;
    showScoringConfigSection: boolean;
    showScheduleConfig: boolean;
    sectionErrorCounts?: Record<string, number>;
};

export const buildEventFormSectionNavigationItems = ({
    showMatchRulesSection,
    showStaffSection,
    showManualPaymentsSection,
    scoringConfigSectionLabel,
    divisionSettingsSectionLabel = 'Divisions',
    showScoringConfigSection,
    showScheduleConfig,
    sectionErrorCounts = {},
}: BuildEventFormSectionNavigationItemsOptions): EventFormSectionNavigationItem[] => [
    { id: 'section-basic-information', label: 'Basic Information', visible: true },
    { id: 'section-event-details', label: 'Event Details', visible: true },
    { id: 'section-manual-payments', label: 'Manual Payments', visible: showManualPaymentsSection },
    { id: 'section-match-rules', label: 'Match Rules', visible: showMatchRulesSection },
    { id: 'section-officials', label: 'Staff', visible: showStaffSection },
    { id: 'section-division-settings', label: divisionSettingsSectionLabel, visible: true },
    { id: 'section-league-scoring-config', label: scoringConfigSectionLabel, visible: showScoringConfigSection },
    { id: 'section-schedule-config', label: 'Schedule', visible: showScheduleConfig },
].map((item) => ({ ...item, errorCount: sectionErrorCounts[item.id] ?? 0 }));

export const getVisibleSectionNavigationItems = (
    items: EventFormSectionNavigationItem[],
): SectionNavigationItem[] => items
    .filter((item) => item.visible)
    .map(({ id, label, errorCount }) => ({ id, label, errorCount }));

type SectionNavigationProps = {
    items: SectionNavigationItem[];
    activeSectionId: string;
    variant: 'desktop' | 'mobile';
    onSelectSection: (sectionId: string) => void;
};

export const SectionNavigation = ({
    items,
    activeSectionId,
    variant,
    onSelectSection,
}: SectionNavigationProps) => {
    if (variant === 'desktop') {
        return (
            <aside className="hidden xl:block xl:sticky xl:top-20 xl:self-start">
                <div className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
                    <Text fw={700} size="sm" c="gray.8" mb="xs">
                        Sections
                    </Text>
                    <Text size="xs" c="dimmed" mb="md">
                        Jump to a section. Changes stay in the event draft.
                    </Text>
                    <div className="space-y-1">
                        {items.map((section) => {
                            const isActive = activeSectionId === section.id;
                            return (
                                <button
                                    key={section.id}
                                    type="button"
                                    onClick={() => onSelectSection(section.id)}
                                    className={`min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                                        isActive
                                            ? 'bg-slate-950 text-white shadow-sm'
                                            : 'text-gray-700 hover:bg-slate-100'
                                    }`}
                                >
                                    <span className="flex items-center justify-between gap-2">
                                        <span>{section.label}</span>
                                        {section.errorCount ? (
                                            <span
                                                aria-label={`${section.label}: ${section.errorCount} ${section.errorCount === 1 ? 'error' : 'errors'}`}
                                                className={`rounded-md px-2 py-0.5 text-xs font-semibold ${isActive
                                                    ? 'bg-red-100 text-red-800'
                                                    : 'bg-red-50 text-red-700'}`}
                                            >
                                                {section.errorCount}
                                            </span>
                                        ) : null}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </aside>
        );
    }

    return (
        <div className="mb-4 xl:hidden overflow-x-auto">
            <div className="flex min-w-max gap-2 pb-1">
                {items.map((section) => {
                    const isActive = activeSectionId === section.id;
                    return (
                        <button
                            key={`mobile-${section.id}`}
                            type="button"
                            onClick={() => onSelectSection(section.id)}
                            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                                isActive
                                    ? 'border-slate-900 bg-slate-900 text-white'
                                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
                            }`}
                        >
                            <span className="flex items-center gap-1.5">
                                <span>{section.label}</span>
                                {section.errorCount ? (
                                    <span
                                        aria-label={`${section.label}: ${section.errorCount} ${section.errorCount === 1 ? 'error' : 'errors'}`}
                                        className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${isActive
                                            ? 'bg-red-100 text-red-800'
                                            : 'bg-red-50 text-red-700'}`}
                                    >
                                        {section.errorCount}
                                    </span>
                                ) : null}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
