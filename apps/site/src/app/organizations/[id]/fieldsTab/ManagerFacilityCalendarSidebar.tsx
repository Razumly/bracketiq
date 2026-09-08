"use client";

import { type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Button, Group, Popover, Select, Stack, Text } from '@/components/organization/organization-operation-ui';
import FieldCalendarFilter, { type FieldCalendarFilterItem } from '@/components/calendar/FieldCalendarFilter';
import SharedCalendarEvent, { type SharedCalendarEventVariant } from '@/components/calendar/SharedCalendarEvent';
import type { EntityColorReferenceValue } from '@/lib/entityColors';
import { OrganizationLoadingValue } from '@/components/organization/OrganizationDataLoading';
import type { FacilityCalendarFeedItemType } from '../fieldCalendar';

export type ManagerCalendarSelectionMode = 'rental' | 'staff_assignment' | 'official_assignment';

export type CalendarLayerType =
  | FacilityCalendarFeedItemType
  | 'reservation';

export type ManagerCreateTemplate = {
  mode: ManagerCalendarSelectionMode;
  title: string;
  subtitle: string;
  meta: string;
  variant: SharedCalendarEventVariant;
  colorSeed: string;
};

type SelectOption = {
  value: string;
  label: string;
};

type ManagerFacilityCalendarSidebarProps = {
  conflictCount: number;
  loading?: boolean;
  facilityFilterOptions: SelectOption[];
  selectedFacilityFilterValue: string;
  onFacilityFilterChange: (value: string | null) => void;
  calendarLayerOrder: CalendarLayerType[];
  calendarLayerLabels: Record<CalendarLayerType, string>;
  calendarLayerColors: Record<CalendarLayerType, string>;
  calendarLayerCounts: Map<CalendarLayerType, number>;
  activeCalendarLayerSet: Set<CalendarLayerType>;
  allCalendarLayersSelected: boolean;
  onSelectAllCalendarLayers: () => void;
  onToggleCalendarLayer: (type: CalendarLayerType) => void;
  editMode: boolean;
  createTemplates: ManagerCreateTemplate[];
  selectedFieldIds: string[];
  facilityFilteredFieldIds: string[];
  fieldFilterItems: FieldCalendarFilterItem[];
  fieldColorReferenceList: EntityColorReferenceValue[];
  createDragMode: ManagerCalendarSelectionMode | null;
  onCreatePointerDown: (mode: ManagerCalendarSelectionMode, event: ReactPointerEvent<HTMLDivElement>) => void;
  onCreateActivate: (mode: ManagerCalendarSelectionMode) => void;
  onCreatePointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onCreatePointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onCreatePointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onSelectedFieldIdsChange: (fieldIds: string[]) => void;
  children: ReactNode;
};

export default function ManagerFacilityCalendarSidebar({
  conflictCount,
  loading,
  facilityFilterOptions,
  selectedFacilityFilterValue,
  onFacilityFilterChange,
  calendarLayerOrder,
  calendarLayerLabels,
  calendarLayerColors,
  calendarLayerCounts,
  activeCalendarLayerSet,
  allCalendarLayersSelected,
  onSelectAllCalendarLayers,
  onToggleCalendarLayer,
  editMode,
  createTemplates,
  selectedFieldIds,
  facilityFilteredFieldIds,
  fieldFilterItems,
  fieldColorReferenceList,
  createDragMode,
  onCreatePointerDown,
  onCreateActivate,
  onCreatePointerMove,
  onCreatePointerUp,
  onCreatePointerCancel,
  onSelectedFieldIdsChange,
  children,
}: ManagerFacilityCalendarSidebarProps) {
  const selectedFacilityFieldIds = selectedFieldIds.filter((fieldId) => facilityFilteredFieldIds.includes(fieldId));

  return (
    <>
      <Stack gap="sm" className="org-facility-controls">
        <Select
          aria-label="Facility"
          data={facilityFilterOptions}
          value={selectedFacilityFilterValue}
          onChange={onFacilityFilterChange}
          allowDeselect={false}
          size="sm"
        />
        <Stack gap={6} className="org-facility-layer-group">
          <Group justify="space-between" align="center">
            <Text fw={700} size="sm" className="sr-only">Calendar layers</Text>
            <Button
              size="compact-xs"
              variant={allCalendarLayersSelected ? 'light' : 'subtle'}
              color="gray"
              onClick={onSelectAllCalendarLayers}
            >
              All
            </Button>
          </Group>
          <Group
            gap="xs"
            wrap="wrap"
            className="facility-calendar-layer-controls"
            aria-label="Calendar layer filters"
          >
            {calendarLayerOrder.map((type) => {
              const count = calendarLayerCounts.get(type) ?? 0;
              const selected = activeCalendarLayerSet.has(type);
              return (
                <Button
                  key={type}
                  size="compact-xs"
                  variant="subtle"
                  aria-pressed={selected}
                  className="org-calendar-layer"
                  style={{ '--layer-color': calendarLayerColors[type] } as React.CSSProperties}
                  onClick={() => onToggleCalendarLayer(type)}
                >
                  <span className="org-layer-check" aria-hidden="true">{selected ? '✓' : ''}</span>{calendarLayerLabels[type]} <OrganizationLoadingValue loading={loading}>{count}</OrganizationLoadingValue>
                </Button>
              );
            })}
          </Group>
        </Stack>
        <Group gap="xs" wrap="nowrap">
          <Popover>
            <Popover.Target><Button variant="outline" size="sm">Resources ({selectedFacilityFieldIds.length})</Button></Popover.Target>
            <Popover.Dropdown>
              <FieldCalendarFilter
                items={fieldFilterItems}
                selectedIds={selectedFacilityFieldIds}
                onSelectedIdsChange={onSelectedFieldIdsChange}
                colorReferenceList={fieldColorReferenceList}
                title="Resources"
                ariaLabel="Facility resources"
                searchPlaceholder="Search resources"
                searchAriaLabel="Search resources"
                emptyText="No resources match this facility."
              />
            </Popover.Dropdown>
          </Popover>
          {!loading && conflictCount > 0 ? (
            <Text role="status" className="org-calendar-conflict-count">
              {conflictCount} {conflictCount === 1 ? 'conflict' : 'conflicts'}
            </Text>
          ) : null}
        </Group>
      </Stack>
      <div className={`org-facility-calendar-workspace${editMode ? ' org-facility-calendar-workspace--editing' : ''}`}>
        <div className="org-facility-calendar-canvas">{children}</div>
        {editMode ? (
          <aside className="org-facility-create-panel" aria-label="Create schedule entries">
            <Text fw={700} size="sm">Create</Text>
            <div className="facility-calendar-create-grid">
              {createTemplates.map((template) => {
                const canDragTemplate = selectedFieldIds.length > 0;
                const isDragging = createDragMode === template.mode;
                return (
                  <div
                    key={template.mode}
                    className={[
                      'facility-calendar-create-card',
                      isDragging ? 'facility-calendar-create-card--active' : '',
                      !canDragTemplate ? 'facility-calendar-create-card--disabled' : '',
                    ].filter(Boolean).join(' ')}
                    draggable={false}
                    aria-grabbed={isDragging}
                    aria-disabled={!canDragTemplate}
                    onPointerDown={(event) => onCreatePointerDown(template.mode, event)}
                    onPointerMove={onCreatePointerMove}
                    onPointerUp={onCreatePointerUp}
                    onPointerCancel={onCreatePointerCancel}
                  >
                    <SharedCalendarEvent
                      title={template.title}
                      subtitle={template.subtitle}
                      meta={template.meta}
                      colorSeed={template.colorSeed}
                      colorReferenceList={fieldColorReferenceList}
                      colorMatchKey={selectedFieldIds[0] ?? undefined}
                      resourceColorMatchKeys={selectedFieldIds}
                      variant={template.variant}
                      draggable={canDragTemplate}
                      selected={isDragging}
                    />
                    <button
                      type="button"
                      className="mt-2 min-h-11 w-full rounded border border-border bg-background px-3 text-sm"
                      disabled={!canDragTemplate}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => onCreateActivate(template.mode)}
                    >
                      Add {template.title.toLowerCase()}
                    </button>
                  </div>
                );
              })}
            </div>
          </aside>
        ) : null}
      </div>
    </>
  );
}
