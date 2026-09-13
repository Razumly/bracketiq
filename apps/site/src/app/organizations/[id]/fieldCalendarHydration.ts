import type { Field } from '@/types';

type RentalHydrationSelection = {
  scheduledFieldIds?: unknown;
};

const normalizeFieldIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((entry) => String(entry).trim())
        .filter((entry) => entry.length > 0),
    ),
  );
};

export const resolveFieldIdsForCalendarHydration = ({
  canManage,
  calendarView,
  calendarVisibleFieldIds,
  fields,
  selectedFieldIds,
  rentalSelections,
}: {
  canManage: boolean;
  calendarView?: 'week' | 'month';
  calendarVisibleFieldIds?: string[];
  fields: Field[];
  selectedFieldIds: string[];
  rentalSelections: RentalHydrationSelection[];
}): string[] => {
  if (canManage) {
    if (calendarView === 'week') {
      return normalizeFieldIds(fields.map((field) => field.$id));
    }
    if (calendarView === 'month' && calendarVisibleFieldIds) {
      return normalizeFieldIds(calendarVisibleFieldIds);
    }
    return normalizeFieldIds(selectedFieldIds);
  }

  const visibleFieldIds = normalizeFieldIds(fields.map((field) => field.$id));
  if (visibleFieldIds.length > 0) {
    return visibleFieldIds;
  }

  return normalizeFieldIds(
    rentalSelections.flatMap((selection) => normalizeFieldIds(selection.scheduledFieldIds)),
  );
};
