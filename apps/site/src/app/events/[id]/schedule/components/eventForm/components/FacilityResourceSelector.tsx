import React, { useCallback, useMemo, useState } from 'react';
import { Badge, Collapse, Text, TextInput } from '@/components/organization/organization-operation-ui';
import { ChevronDown } from 'lucide-react';

import { filterFieldCalendarItems, type FieldCalendarFilterItem } from '@/components/calendar/FieldCalendarFilter';
import { getFieldDisplayName } from '@/lib/fieldUtils';
import type { Field } from '@/types';

import { SECTION_ANIMATION_DURATION_MS } from '../constants';
import { buildFacilityResourceGroups } from '../resourceGroups';

export type FacilityResourceSelectorProps = {
    label: string;
    description: string;
    placeholder: string;
    resourceSingular: string;
    fields: Field[];
    value: string[];
    onChange: (values: string[]) => void;
    eventOrganizationId?: string | null;
    disabled?: boolean;
    loading?: boolean;
    error?: React.ReactNode;
};

export const FacilityResourceSelector: React.FC<FacilityResourceSelectorProps> = ({
    label,
    description,
    placeholder,
    resourceSingular,
    fields,
    value,
    onChange,
    eventOrganizationId,
    disabled = false,
    loading = false,
    error,
}) => {
    const groups = useMemo(
        () => buildFacilityResourceGroups(fields, eventOrganizationId),
        [eventOrganizationId, fields],
    );
    const [groupExpansionOverrides, setGroupExpansionOverrides] = useState<Record<string, boolean>>({});
    const [searchQuery, setSearchQuery] = useState('');
    const selectedValues = useMemo(
        () => Array.from(new Set(value.map((fieldId) => String(fieldId).trim()).filter(Boolean))),
        [value],
    );
    const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);
    const visibleGroups = useMemo(() => {
        if (!searchQuery.trim()) {
            return groups;
        }
        return groups.map((group) => {
            const facilityMatches = filterFieldCalendarItems([{
                id: group.key,
                label: group.label,
                detail: group.description,
            }], searchQuery).length > 0;
            if (facilityMatches) {
                return group;
            }
            const resourceItems: FieldCalendarFilterItem[] = group.resources.map((resource) => ({
                id: resource.$id,
                label: getFieldDisplayName(resource, resourceSingular),
                detail: [group.label, resource.location].filter(Boolean).join(' • '),
            }));
            const matchingResourceIds = new Set(
                filterFieldCalendarItems(resourceItems, searchQuery).map((item) => item.id),
            );
            return {
                ...group,
                resources: group.resources.filter((resource) => matchingResourceIds.has(resource.$id)),
            };
        }).filter((group) => group.resources.length > 0);
    }, [groups, resourceSingular, searchQuery]);
    const showFacilityRows = groups.length > 1 || groups.some((group) => group.isRental);

    const toggleResource = useCallback((resourceId: string) => {
        if (disabled) {
            return;
        }
        const next = selectedSet.has(resourceId)
            ? selectedValues.filter((fieldId) => fieldId !== resourceId)
            : [...selectedValues, resourceId];
        onChange(next);
    }, [disabled, onChange, selectedSet, selectedValues]);

    const renderResourceRow = (resource: Field & { $id: string }) => {
        const resourceLabel = getFieldDisplayName(resource, resourceSingular);
        const selected = selectedSet.has(resource.$id);
        return (
            <label
                key={resource.$id}
                className={`flex cursor-pointer items-center gap-3 border-b px-3 py-2 pl-8 text-sm transition last:border-b-0 ${
                    selected
                        ? 'border-[#2c4d6f] bg-[#eaf2fa]'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                } ${disabled ? 'cursor-not-allowed opacity-70' : ''}`}
            >
                <input
                    type="checkbox"
                    aria-label={resourceLabel}
                    checked={selected}
                    disabled={disabled}
                    onChange={() => toggleResource(resource.$id)}
                    className="h-4 w-4 rounded border-gray-300 accent-[#2c4d6f]"
                />
                <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-gray-900">{resourceLabel}</span>
                    {resource.location ? (
                        <span className="block truncate text-xs text-gray-500">{resource.location}</span>
                    ) : null}
                </span>
            </label>
        );
    };

    return (
        <div className="space-y-2">
            <div>
                <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-900">{label}</label>
                    {selectedValues.length > 0 ? (
                        <Badge size="sm" variant="light" color="blue">
                            {selectedValues.length} selected
                        </Badge>
                    ) : null}
                </div>
                <Text size="sm" c="dimmed">{description}</Text>
            </div>
            <div
                role="group"
                aria-label={label}
                className={`overflow-hidden rounded-lg border ${error ? 'border-red-500' : 'border-gray-300'} ${disabled ? 'bg-gray-50' : 'bg-white'}`}
            >
                {loading ? (
                    <Text size="sm" c="dimmed">Loading resources...</Text>
                ) : groups.length === 0 ? (
                    <Text size="sm" c="dimmed">{placeholder}</Text>
                ) : (
                    <>
                        <div className="border-b border-gray-200 p-2">
                            <TextInput
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.currentTarget.value)}
                                placeholder="Search resources or facilities"
                                aria-label="Search resources or facilities"
                                disabled={disabled}
                                size="sm"
                            />
                        </div>
                        {visibleGroups.length === 0 ? (
                            <Text size="sm" c="dimmed" className="p-3">
                                No resources match your search.
                            </Text>
                        ) : showFacilityRows ? (
                            <div>
                                {visibleGroups.map((group) => {
                                    const expanded = groupExpansionOverrides[group.key]
                                        ?? (group.isRental || groups.length === 1 || searchQuery.trim().length > 0);
                                    const selectedCount = group.resources.filter((resource) => selectedSet.has(resource.$id)).length;
                                    const panelId = `facility-resource-group-${group.key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
                                    return (
                                        <div key={group.key} className="border-b border-gray-200 bg-gray-50 last:border-b-0">
                                            <button
                                                type="button"
                                                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                                                aria-expanded={expanded}
                                                aria-controls={panelId}
                                                onClick={() => {
                                                    setGroupExpansionOverrides((previous) => ({
                                                        ...previous,
                                                        [group.key]: !expanded,
                                                    }));
                                                }}
                                            >
                                                <span className="min-w-0 flex-1">
                                                    <span className="flex items-center gap-2">
                                                        <span className="truncate font-medium text-gray-900">{group.label}</span>
                                                        {group.isRental ? (
                                                            <Badge size="xs" variant="light" color="green">Rented</Badge>
                                                        ) : null}
                                                    </span>
                                                    <span className="block truncate text-xs text-gray-500">
                                                        {selectedCount} of {group.resources.length} resources selected
                                                        {group.description ? ` • ${group.description}` : ''}
                                                    </span>
                                                </span>
                                                <ChevronDown
                                                    aria-hidden="true"
                                                    className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
                                                />
                                            </button>
                                            <Collapse in={expanded} transitionDuration={SECTION_ANIMATION_DURATION_MS} animateOpacity>
                                                <div id={panelId} className="border-t border-gray-200 bg-white">
                                                    {group.resources.map(renderResourceRow)}
                                                </div>
                                            </Collapse>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {visibleGroups.flatMap((group) => group.resources).map(renderResourceRow)}
                            </div>
                        )}
                    </>
                )}
            </div>
            {error ? (
                <Text size="xs" c="red">{error}</Text>
            ) : null}
        </div>
    );
};
