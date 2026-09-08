'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@/components/organization/organization-operation-ui';
import { notifications } from '@/lib/organizationNotifications';
import LocationSelector, { type LocationSelectionMeta } from '@/components/location/LocationSelector';
import ResourceSportsInput, { type ResourceSportOption } from '@/components/ui/ResourceSportsInput';
import { createId } from '@/lib/id';
import { fieldService } from '@/lib/fieldService';
import { facilityService } from '@/lib/facilityService';
import { sportsService } from '@/lib/sportsService';
import { getFieldFacilityId } from './facilityCalendarResources';
import type { Facility, Field, Organization } from '@/types';
import {
  DEFAULT_FACILITY_CLOSE_TIME,
  DEFAULT_FACILITY_OPEN_TIME,
  EMPTY_FACILITY_COORDINATES,
  FACILITY_DAY_OPTIONS,
  FACILITY_LOCATION_REQUIRED_ERROR,
  FACILITY_LOCATION_SELECTION_ERROR,
  buildDefaultFacilityWeeklyHours,
  buildOperatingHoursFromFormRows,
  facilityCoordinatesFromInput,
  facilityCoordinatesToInput,
  facilityOperatingHoursToFormRows,
  formatFacilityOperatingHours,
  hasFacilityCoordinates,
  type FacilityWeeklyHoursFormRow,
} from './facilityFormUtils';

type FacilityDetailsSelection =
  | { type: 'facility'; id: string }
  | { type: 'resource'; id: string };

type FacilityDraft = {
  id: string;
  persistedId: string | null;
  isNew: boolean;
  name: string;
  location: string;
  address: string;
  affiliateUrl: string;
  coordinates: { lat: number; lng: number };
  locationSelected: boolean;
  weeklyHours: FacilityWeeklyHoursFormRow[];
  isDefault: boolean;
  sortOrder: number | null;
};

type ResourceDraft = {
  id: string;
  persistedId: string | null;
  isNew: boolean;
  name: string;
  facilityDraftId: string;
  location: string;
  lat: string | number;
  long: string | number;
  locationSelected: boolean;
  sportIds: string[];
};

type FacilityDetailsSnapshot = {
  facilities: FacilityDraft[];
  resources: ResourceDraft[];
  selection: FacilityDetailsSelection | null;
};

type FacilityDetailsWorkspaceProps = {
  organization: Organization;
  facilities: Facility[];
  fields: Field[];
  canManage: boolean;
  onSwitchToSchedule: () => void;
  onSaved: () => Promise<void>;
};

const normalizeText = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const hasSelectedCoordinates = (lat: unknown, lng: unknown): boolean => {
  const normalizedLat = Number(lat);
  const normalizedLng = Number(lng);
  return Number.isFinite(normalizedLat)
    && Number.isFinite(normalizedLng)
    && !(normalizedLat === 0 && normalizedLng === 0);
};

const normalizeSportIds = (value: unknown): string[] => (
  Array.isArray(value)
    ? Array.from(new Set(value.map((entry) => String(entry).trim()).filter(Boolean)))
    : []
);

const facilityToDraft = (facility: Facility, index: number): FacilityDraft => {
  const coordinates = facilityCoordinatesToInput(facility.coordinates);
  const location = facility.location || facility.address || '';
  return {
    id: facility.$id,
    persistedId: facility.$id,
    isNew: false,
    name: facility.name || '',
    location,
    address: facility.address || '',
    affiliateUrl: facility.affiliateUrl || '',
    coordinates,
    locationSelected: Boolean(location.trim()) && hasFacilityCoordinates(coordinates),
    weeklyHours: facilityOperatingHoursToFormRows(facility.operatingHours),
    isDefault: Boolean(facility.isDefault),
    sortOrder: typeof facility.sortOrder === 'number' ? facility.sortOrder : index,
  };
};

const coordinateInput = (value: unknown): number | '' => (
  typeof value === 'number' && Number.isFinite(value) ? value : ''
);

const fieldToResourceDraft = (field: Field, fallbackFacilityId: string | null): ResourceDraft | null => {
  const facilityDraftId = getFieldFacilityId(field) ?? fallbackFacilityId;
  if (!facilityDraftId) {
    return null;
  }

  return {
    id: field.$id,
    persistedId: field.$id,
    isNew: false,
    name: field.name || '',
    facilityDraftId,
    location: field.location || '',
    lat: coordinateInput(field.lat),
    long: coordinateInput(field.long),
    locationSelected: Boolean((field.location || '').trim()) && hasSelectedCoordinates(field.lat, field.long),
    sportIds: normalizeSportIds(field.sportIds),
  };
};

const createFacilityDraft = (index: number): FacilityDraft => ({
  id: `draft_facility_${createId()}`,
  persistedId: null,
  isNew: true,
  name: '',
  location: '',
  address: '',
  affiliateUrl: '',
  coordinates: EMPTY_FACILITY_COORDINATES,
  locationSelected: false,
  weeklyHours: buildDefaultFacilityWeeklyHours(),
  isDefault: index === 0,
  sortOrder: index,
});

const createResourceDraft = (facilityDraftId: string): ResourceDraft => ({
  id: `draft_resource_${createId()}`,
  persistedId: null,
  isNew: true,
  name: '',
  facilityDraftId,
  location: '',
  lat: '',
  long: '',
  locationSelected: false,
  sportIds: [],
});

const buildInitialSnapshot = (
  facilities: Facility[],
  fields: Field[],
): FacilityDetailsSnapshot => {
  const facilityDrafts = facilities.map(facilityToDraft);
  const fallbackFacilityId = facilityDrafts[0]?.id ?? null;
  const resources = fields
    .map((field) => fieldToResourceDraft(field, fallbackFacilityId))
    .filter((draft): draft is ResourceDraft => Boolean(draft));

  return {
    facilities: facilityDrafts,
    resources,
    selection: facilityDrafts[0]
      ? { type: 'facility', id: facilityDrafts[0].id }
      : resources[0]
        ? { type: 'resource', id: resources[0].id }
        : null,
  };
};

const normalizeWeeklyHoursForComparison = (rows: FacilityWeeklyHoursFormRow[]) => (
  rows.map((row) => ({
    dayOfWeek: row.dayOfWeek,
    closed: Boolean(row.closed),
    openTime: row.openTime || '',
    closeTime: row.closeTime || '',
  }))
);

const facilityComparisonValue = (draft: FacilityDraft) => ({
  persistedId: draft.persistedId,
  name: draft.name.trim(),
  location: draft.location.trim(),
  address: draft.address.trim(),
  affiliateUrl: draft.affiliateUrl.trim(),
  coordinates: {
    lat: Number(draft.coordinates.lat) || 0,
    lng: Number(draft.coordinates.lng) || 0,
  },
  locationSelected: Boolean(draft.locationSelected),
  weeklyHours: normalizeWeeklyHoursForComparison(draft.weeklyHours),
  isDefault: Boolean(draft.isDefault),
  sortOrder: draft.sortOrder,
});

const resourceComparisonValue = (draft: ResourceDraft) => ({
  persistedId: draft.persistedId,
  name: draft.name.trim(),
  facilityDraftId: draft.facilityDraftId,
  location: draft.location.trim(),
  lat: draft.lat === '' ? '' : Number(draft.lat),
  long: draft.long === '' ? '' : Number(draft.long),
  locationSelected: Boolean(draft.locationSelected),
  sportIds: normalizeSportIds(draft.sportIds),
});

const serializeFacilityDraft = (draft: FacilityDraft): string => JSON.stringify(facilityComparisonValue(draft));
const serializeResourceDraft = (draft: ResourceDraft): string => JSON.stringify(resourceComparisonValue(draft));

const snapshotComparisonValue = (snapshot: FacilityDetailsSnapshot) => ({
  facilities: snapshot.facilities.map(facilityComparisonValue),
  resources: snapshot.resources.map(resourceComparisonValue),
});

const snapshotsEqual = (left: FacilityDetailsSnapshot, right: FacilityDetailsSnapshot): boolean => (
  JSON.stringify(snapshotComparisonValue(left)) === JSON.stringify(snapshotComparisonValue(right))
);

const getFacilityPendingLabel = (draft: FacilityDraft, baselineById: Map<string, FacilityDraft>): string | null => {
  if (draft.isNew) {
    return 'Draft';
  }
  const baseline = baselineById.get(draft.id);
  return baseline && serializeFacilityDraft(baseline) !== serializeFacilityDraft(draft) ? 'Edited' : null;
};

const getResourcePendingLabel = (draft: ResourceDraft, baselineById: Map<string, ResourceDraft>): string | null => {
  if (draft.isNew) {
    return 'Draft';
  }
  const baseline = baselineById.get(draft.id);
  return baseline && serializeResourceDraft(baseline) !== serializeResourceDraft(draft) ? 'Edited' : null;
};

const formatResourceSubtitle = (resource: ResourceDraft, facility?: FacilityDraft): string => (
  resource.location.trim() || facility?.location.trim() || 'No location set'
);

const validateFacilityDraft = (facility: FacilityDraft): string | null => {
  if (!facility.name.trim()) return 'Facility name is required.';
  if (!facility.location.trim()) return FACILITY_LOCATION_REQUIRED_ERROR;
  if (!facility.locationSelected || !facilityCoordinatesFromInput(facility.coordinates)) {
    return FACILITY_LOCATION_SELECTION_ERROR;
  }
  return null;
};

const validateResourceDraft = (resource: ResourceDraft, facilityIds: Set<string>): string | null => {
  if (!resource.name.trim()) return 'Resource name is required.';
  if (!facilityIds.has(resource.facilityDraftId)) return 'Choose a facility for every resource.';
  if (resource.location.trim() && !resource.locationSelected) {
    return 'Select a resource address from suggestions or the map, or leave it blank to use the facility location.';
  }
  return null;
};

const validateSnapshotForSave = (snapshot: FacilityDetailsSnapshot) => {
  const facilityOperatingHoursById = new Map<string, Facility['operatingHours'] | null>();
  for (const facility of snapshot.facilities) {
    const locationError = validateFacilityDraft(facility);
    if (locationError) return { facilityOperatingHoursById, error: locationError };
    const { operatingHours, error } = buildOperatingHoursFromFormRows(facility.weeklyHours);
    if (error) return { facilityOperatingHoursById, error };
    facilityOperatingHoursById.set(facility.id, operatingHours);
  }
  const facilityIds = new Set(snapshot.facilities.map((facility) => facility.id));
  for (const resource of snapshot.resources) {
    const error = validateResourceDraft(resource, facilityIds);
    if (error) return { facilityOperatingHoursById, error };
  }
  return { facilityOperatingHoursById, error: null };
};

const saveFacilityDraft = async (
  facility: FacilityDraft,
  operatingHours: Facility['operatingHours'] | null,
  organizationId: string,
) => {
  const coordinates = facilityCoordinatesFromInput(facility.coordinates);
  if (!coordinates) throw new Error(FACILITY_LOCATION_SELECTION_ERROR);
  const payload = {
    name: facility.name.trim(),
    location: facility.location.trim(),
    address: facility.address.trim() || null,
    affiliateUrl: facility.affiliateUrl.trim() || null,
    coordinates,
    operatingHours,
    isDefault: facility.isDefault,
    sortOrder: facility.sortOrder,
  };
  return facility.persistedId
    ? facilityService.updateFacility(facility.persistedId, payload)
    : facilityService.createFacility({ organizationId, ...payload });
};

const saveResourceDraft = async (
  resource: ResourceDraft,
  facilityId: string | undefined,
  organization: Organization,
) => {
  if (!facilityId) throw new Error('Choose a facility for every resource.');
  const location = resource.location.trim();
  const payload = {
    name: resource.name.trim(),
    location: location || null,
    lat: location && resource.lat !== '' ? Number(resource.lat) : undefined,
    long: location && resource.long !== '' ? Number(resource.long) : undefined,
    facilityId,
    sportIds: normalizeSportIds(resource.sportIds),
  };
  return resource.persistedId
    ? fieldService.updateField({ $id: resource.persistedId, ...payload })
    : fieldService.createField({ ...payload, organization });
};

const selectedResourceDraft = (snapshot: FacilityDetailsSnapshot) => {
  const selection = snapshot.selection;
  if (selection?.type !== 'resource') return null;
  return snapshot.resources.find((resource) => resource.id === selection.id) ?? null;
};

const selectedFacilityDetails = (snapshot: FacilityDetailsSnapshot) => {
  const facilitiesById = new Map(snapshot.facilities.map((facility) => [facility.id, facility]));
  const selectedResource = selectedResourceDraft(snapshot);
  const activeFacilityId = selectedResource?.facilityDraftId
    ?? (snapshot.selection?.type === 'facility' ? snapshot.selection.id : snapshot.facilities[0]?.id ?? null);
  const selectedFacility = activeFacilityId ? facilitiesById.get(activeFacilityId) ?? null : null;
  const visibleResources = activeFacilityId
    ? snapshot.resources.filter((resource) => resource.facilityDraftId === activeFacilityId)
    : [];
  return { selectedResource, activeFacilityId, selectedFacility, visibleResources };
};

export default function FacilityDetailsWorkspace({
  organization,
  facilities,
  fields,
  canManage,
  onSwitchToSchedule,
  onSaved,
}: FacilityDetailsWorkspaceProps) {
  const initialSnapshot = useMemo(() => buildInitialSnapshot(facilities, fields), [facilities, fields]);
  const initialSnapshotKey = useMemo(() => JSON.stringify(snapshotComparisonValue(initialSnapshot)), [initialSnapshot]);
  const [baselineSnapshot, setBaselineSnapshot] = useState<FacilityDetailsSnapshot>(initialSnapshot);
  const [snapshot, setSnapshot] = useState<FacilityDetailsSnapshot>(initialSnapshot);
  const [history, setHistory] = useState<FacilityDetailsSnapshot[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [sportsLoading, setSportsLoading] = useState(false);
  const [sportsError, setSportsError] = useState<string | null>(null);
  const [sportOptions, setSportOptions] = useState<ResourceSportOption[]>([]);
  const sourceSnapshotKeyRef = useRef(initialSnapshotKey);
  const lastHistoryChangeKeyRef = useRef<string | null>(null);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const pendingChangeCount = useMemo(() => {
    const baselineFacilitiesById = new Map(baselineSnapshot.facilities.map((facility) => [facility.id, facility]));
    const baselineResourcesById = new Map(baselineSnapshot.resources.map((resource) => [resource.id, resource]));
    const facilityCount = snapshot.facilities.filter((facility) => (
      getFacilityPendingLabel(facility, baselineFacilitiesById) !== null
    )).length;
    const resourceCount = snapshot.resources.filter((resource) => (
      getResourcePendingLabel(resource, baselineResourcesById) !== null
    )).length;
    return facilityCount + resourceCount;
  }, [baselineSnapshot, snapshot]);

  useEffect(() => {
    if (sourceSnapshotKeyRef.current === initialSnapshotKey) return;
    sourceSnapshotKeyRef.current = initialSnapshotKey;
    setBaselineSnapshot(initialSnapshot);
    setSnapshot(initialSnapshot);
    snapshotRef.current = initialSnapshot;
    setHistory([]);
    lastHistoryChangeKeyRef.current = null;
  }, [initialSnapshot, initialSnapshotKey]);

  useEffect(() => {
    let cancelled = false;
    setSportsLoading(true);
    setSportsError(null);

    sportsService.getAll()
      .then((sports) => {
        if (cancelled) {
          return;
        }
        setSportOptions(
          sports
            .filter((sport) => sport.$id || sport.name)
            .map((sport) => ({
              value: sport.$id || sport.name,
              label: sport.name || sport.$id,
            })),
        );
      })
      .catch((error) => {
        console.error('Failed to load sports for facility resource editor:', error);
        if (!cancelled) {
          setSportsError('Sports could not be loaded. You can save the resource and add sports later.');
          setSportOptions([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSportsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const baselineFacilitiesById = useMemo(
    () => new Map(baselineSnapshot.facilities.map((facility) => [facility.id, facility])),
    [baselineSnapshot.facilities],
  );
  const baselineResourcesById = useMemo(
    () => new Map(baselineSnapshot.resources.map((resource) => [resource.id, resource])),
    [baselineSnapshot.resources],
  );
  const { selectedResource, activeFacilityId, selectedFacility, visibleResources } = selectedFacilityDetails(snapshot);
  const facilityOptions = snapshot.facilities.map((facility) => ({
    value: facility.id,
    label: facility.name.trim() || 'New facility',
  }));
  const mergedSportOptions = useMemo(() => {
    const optionsByValue = new Map(sportOptions.map((option) => [option.value, option]));
    snapshot.resources.forEach((resource) => {
      resource.sportIds.forEach((sportId) => {
        if (!optionsByValue.has(sportId)) {
          optionsByValue.set(sportId, { value: sportId, label: sportId });
        }
      });
    });
    return Array.from(optionsByValue.values());
  }, [snapshot.resources, sportOptions]);

  const stageSnapshotChange = useCallback((
    updater: (current: FacilityDetailsSnapshot) => FacilityDetailsSnapshot,
    changeKey: string | null,
  ) => {
    const current = snapshotRef.current;
    const next = updater(current);
    const shouldRecordHistory = !(changeKey && lastHistoryChangeKeyRef.current === changeKey);
    setHistory((entries) => {
      return shouldRecordHistory ? [...entries, current] : entries;
    });
    lastHistoryChangeKeyRef.current = changeKey;
    setFormError(null);
    snapshotRef.current = next;
    setSnapshot(next);
  }, []);

  const handleUndo = useCallback(() => {
    setHistory((entries) => {
      const previous = entries[entries.length - 1];
      if (!previous) {
        return entries;
      }
      snapshotRef.current = previous;
      setSnapshot(previous);
      setFormError(null);
      lastHistoryChangeKeyRef.current = null;
      return entries.slice(0, -1);
    });
  }, []);

  const handleAddFacility = () => {
    const draft = createFacilityDraft(snapshot.facilities.length);
    stageSnapshotChange((current) => {
      return {
        facilities: [...current.facilities, draft],
        resources: current.resources,
        selection: { type: 'facility', id: draft.id },
      };
    }, `facility:create:${draft.id}`);
  };

  const handleAddResource = () => {
    if (!activeFacilityId) {
      return;
    }
    const draft = createResourceDraft(activeFacilityId);
    stageSnapshotChange((current) => {
      return {
        ...current,
        resources: [...current.resources, draft],
        selection: { type: 'resource', id: draft.id },
      };
    }, `resource:create:${draft.id}`);
  };

  const updateFacilityDraft = (
    facilityId: string,
    updater: (draft: FacilityDraft) => FacilityDraft,
    changeKey: string,
  ) => {
    stageSnapshotChange((current) => ({
      ...current,
      facilities: current.facilities.map((facility) => (
        facility.id === facilityId ? updater(facility) : facility
      )),
    }), changeKey);
  };

  const updateResourceDraft = (
    resourceId: string,
    updater: (draft: ResourceDraft) => ResourceDraft,
    changeKey: string,
  ) => {
    stageSnapshotChange((current) => ({
      ...current,
      resources: current.resources.map((resource) => (
        resource.id === resourceId ? updater(resource) : resource
      )),
    }), changeKey);
  };

  const buildSavedSnapshot = (
    savedFacilityByDraftId: Map<string, Facility>,
    savedResourceByDraftId: Map<string, Field>,
    facilityIdByDraftId: Map<string, string>,
  ): FacilityDetailsSnapshot => {
    const nextFacilities = snapshot.facilities.map((draft, index) => {
      const saved = savedFacilityByDraftId.get(draft.id);
      if (saved) {
        return facilityToDraft(saved, index);
      }
      const mappedId = facilityIdByDraftId.get(draft.id);
      return mappedId && mappedId !== draft.id
        ? { ...draft, id: mappedId, persistedId: mappedId, isNew: false }
        : draft;
    });

    const nextResources = snapshot.resources.map((draft) => {
      const saved = savedResourceByDraftId.get(draft.id);
      if (saved) {
        return fieldToResourceDraft(saved, facilityIdByDraftId.get(draft.facilityDraftId) ?? draft.facilityDraftId) ?? {
          ...draft,
          persistedId: saved.$id,
          id: saved.$id,
          isNew: false,
        };
      }
      const mappedFacilityId = facilityIdByDraftId.get(draft.facilityDraftId) ?? draft.facilityDraftId;
      return mappedFacilityId !== draft.facilityDraftId
        ? { ...draft, facilityDraftId: mappedFacilityId }
        : draft;
    });

    const selection = snapshot.selection
      ? snapshot.selection.type === 'facility'
        ? {
            type: 'facility' as const,
            id: facilityIdByDraftId.get(snapshot.selection.id) ?? snapshot.selection.id,
          }
        : {
            type: 'resource' as const,
            id: savedResourceByDraftId.get(snapshot.selection.id)?.$id ?? snapshot.selection.id,
          }
      : nextFacilities[0]
        ? { type: 'facility' as const, id: nextFacilities[0].id }
        : null;

    return {
      facilities: nextFacilities,
      resources: nextResources,
      selection,
    };
  };

  const handleSaveChanges = async () => {
    if (!canManage || saving || !pendingChangeCount) {
      return;
    }

    const validation = validateSnapshotForSave(snapshot);
    if (validation.error) {
      setFormError(validation.error);
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const facilityIdByDraftId = new Map<string, string>();
      snapshot.facilities.forEach((facility) => {
        if (facility.persistedId) {
          facilityIdByDraftId.set(facility.id, facility.persistedId);
        }
      });

      const changedFacilities = snapshot.facilities.filter((facility) => (
        getFacilityPendingLabel(facility, baselineFacilitiesById) !== null
      ));
      const savedFacilityByDraftId = new Map<string, Facility>();
      for (const facility of changedFacilities) {
        const saved = await saveFacilityDraft(
          facility, validation.facilityOperatingHoursById.get(facility.id) ?? null, organization.$id,
        );
        facilityIdByDraftId.set(facility.id, saved.$id);
        savedFacilityByDraftId.set(facility.id, saved);
      }

      const changedResources = snapshot.resources.filter((resource) => (
        getResourcePendingLabel(resource, baselineResourcesById) !== null
      ));
      const savedResourceByDraftId = new Map<string, Field>();
      for (const resource of changedResources) {
        const saved = await saveResourceDraft(
          resource, facilityIdByDraftId.get(resource.facilityDraftId), organization,
        );
        savedResourceByDraftId.set(resource.id, saved);
      }

      const nextSnapshot = buildSavedSnapshot(savedFacilityByDraftId, savedResourceByDraftId, facilityIdByDraftId);
      setBaselineSnapshot(nextSnapshot);
      setSnapshot(nextSnapshot);
      setHistory([]);
      notifications.show({ color: 'green', message: 'Facility changes saved.' });
      await onSaved();
    } catch (error) {
      console.error('Failed to save facility details:', error);
      setFormError(error instanceof Error ? error.message : 'Facility changes could not be saved. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const renderFacilityEditor = (facility: FacilityDraft) => {
    const locationErrorMessage = formError === FACILITY_LOCATION_REQUIRED_ERROR || formError === FACILITY_LOCATION_SELECTION_ERROR
      ? formError
      : undefined;
    const resourceCount = snapshot.resources.filter((resource) => resource.facilityDraftId === facility.id).length;
    const pendingLabel = getFacilityPendingLabel(facility, baselineFacilitiesById);
    const operatingHoursLabel = formatFacilityOperatingHours(
      buildOperatingHoursFromFormRows(facility.weeklyHours).operatingHours,
    );

    return (
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" wrap="wrap">
          <div>
            <Group gap="xs" align="center">
              <Title order={5}>{facility.name.trim() || 'New facility'}</Title>
              {pendingLabel ? <Badge size="sm" variant="light">{pendingLabel}</Badge> : null}
            </Group>
            <Text size="sm" c="dimmed">
              {resourceCount} resource{resourceCount === 1 ? '' : 's'}
              {operatingHoursLabel ? ` · ${operatingHoursLabel}` : ''}
            </Text>
          </div>
        </Group>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <TextInput
            label="Name"
            value={facility.name}
            onChange={(event) => updateFacilityDraft(facility.id, (draft) => ({
              ...draft,
              name: event.currentTarget.value,
            }), `facility:${facility.id}:name`)}
            placeholder="Downtown Sports Center"
            required
            disabled={!canManage || saving}
          />
          <TextInput
            label="Affiliate rental link"
            value={facility.affiliateUrl}
            onChange={(event) => updateFacilityDraft(facility.id, (draft) => ({
              ...draft,
              affiliateUrl: event.currentTarget.value,
            }), `facility:${facility.id}:affiliateUrl`)}
            placeholder="https://example.com/rentals"
            disabled={!canManage || saving}
          />
        </div>
        <LocationSelector
          label="Location"
          value={facility.location}
          coordinates={facility.coordinates}
          onChange={(location, lat, lng, address, meta?: LocationSelectionMeta) => {
            const nextSelected = Boolean(meta?.selected);
            updateFacilityDraft(facility.id, (draft) => ({
              ...draft,
              location,
              locationSelected: nextSelected,
              coordinates: nextSelected ? { lat, lng } : EMPTY_FACILITY_COORDINATES,
              address: nextSelected ? address ?? location : '',
            }), `facility:${facility.id}:location`);
          }}
          isValid={!locationErrorMessage}
          errorMessage={locationErrorMessage}
          required
          requireSelection
          selected={facility.locationSelected}
          selectionErrorMessage={FACILITY_LOCATION_SELECTION_ERROR}
          disabled={!canManage || saving}
        />

        <Stack gap="xs">
          <Text fw={600} size="sm">Operating hours</Text>
          <Stack gap={6}>
            {facility.weeklyHours.map((row) => {
              const day = FACILITY_DAY_OPTIONS.find((option) => option.dayOfWeek === row.dayOfWeek);
              const label = day?.longLabel ?? `Day ${row.dayOfWeek + 1}`;
              return (
                <div
                  key={row.dayOfWeek}
                  className="grid grid-cols-2 gap-2 rounded-md border border-slate-200 px-2 py-1.5 sm:grid-cols-[minmax(9.5rem,1fr)_minmax(7rem,8rem)_minmax(7rem,8rem)]"
                >
                  <Checkbox
                    className="col-span-2 self-center sm:col-span-1"
                    label={label}
                    checked={!row.closed}
                    disabled={!canManage || saving}
                    onChange={(event) => {
                      const isOpen = event.currentTarget.checked;
                      updateFacilityDraft(facility.id, (draft) => ({
                        ...draft,
                        weeklyHours: draft.weeklyHours.map((entry) => (
                          entry.dayOfWeek === row.dayOfWeek
                            ? {
                                ...entry,
                                closed: !isOpen,
                                openTime: isOpen ? entry.openTime || DEFAULT_FACILITY_OPEN_TIME : entry.openTime,
                                closeTime: isOpen ? entry.closeTime || DEFAULT_FACILITY_CLOSE_TIME : entry.closeTime,
                              }
                            : entry
                        )),
                      }), `facility:${facility.id}:hours:${row.dayOfWeek}:open-toggle`);
                    }}
                  />
                  <TextInput
                    aria-label={`${label} opens`}
                    type="time"
                    value={row.openTime}
                    disabled={!canManage || saving || row.closed}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      updateFacilityDraft(facility.id, (draft) => ({
                        ...draft,
                        weeklyHours: draft.weeklyHours.map((entry) => (
                          entry.dayOfWeek === row.dayOfWeek ? { ...entry, openTime: value } : entry
                        )),
                      }), `facility:${facility.id}:hours:${row.dayOfWeek}:open`);
                    }}
                    size="xs"
                    style={{ minWidth: 0 }}
                  />
                  <TextInput
                    aria-label={`${label} closes`}
                    type="time"
                    value={row.closeTime}
                    disabled={!canManage || saving || row.closed}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      updateFacilityDraft(facility.id, (draft) => ({
                        ...draft,
                        weeklyHours: draft.weeklyHours.map((entry) => (
                          entry.dayOfWeek === row.dayOfWeek ? { ...entry, closeTime: value } : entry
                        )),
                      }), `facility:${facility.id}:hours:${row.dayOfWeek}:close`);
                    }}
                    size="xs"
                    style={{ minWidth: 0 }}
                  />
                </div>
              );
            })}
          </Stack>
        </Stack>
      </Stack>
    );
  };

  const renderResourceHeading = (resource: ResourceDraft) => {
    const facility = snapshot.facilities.find((entry) => entry.id === resource.facilityDraftId);
    const pendingLabel = getResourcePendingLabel(resource, baselineResourcesById);
    return (
        <Group justify="space-between" align="flex-start" wrap="wrap">
          <div>
            <Group gap="xs" align="center">
              <Title order={5}>{resource.name.trim() || 'New resource'}</Title>
              {pendingLabel ? <Badge size="sm" variant="light">{pendingLabel}</Badge> : null}
            </Group>
            <Text size="sm" c="dimmed">
              {facility?.name.trim() || 'Facility required'}
            </Text>
          </div>
        </Group>
    );
  };

  const renderResourceLocation = (resource: ResourceDraft) => {
    const isLocationValid = !resource.location.trim() || resource.locationSelected;
    return (
        <LocationSelector
          value={resource.location}
          coordinates={{
            lat: resource.lat === '' ? 0 : Number(resource.lat),
            lng: resource.long === '' ? 0 : Number(resource.long),
          }}
          label="Location (optional, defaults to Facility location)"
          onChange={(location, lat, lng, _address, meta?: LocationSelectionMeta) => {
            const nextSelected = Boolean(meta?.selected);
            updateResourceDraft(resource.id, (draft) => ({
              ...draft,
              location,
              lat: nextSelected ? lat : '',
              long: nextSelected ? lng : '',
              locationSelected: nextSelected,
            }), `resource:${resource.id}:location`);
          }}
          isValid={isLocationValid}
          errorMessage="Select a resource address from suggestions or the map, or leave it blank to use the facility location."
          requireSelection
          selected={resource.locationSelected}
          selectionErrorMessage="Select a resource address from suggestions or the map, or leave it blank to use the facility location."
          disabled={!canManage || saving}
        />
    );
  };

  const renderResourceEditor = (resource: ResourceDraft) => {

    return (
      <Stack gap="md">
        {renderResourceHeading(resource)}

        <div className="grid gap-3 lg:grid-cols-3">
          <TextInput
            label="Name"
            placeholder="Court 1, Pitch A, Turf 2, etc."
            value={resource.name}
            onChange={(event) => updateResourceDraft(resource.id, (draft) => ({
              ...draft,
              name: event.currentTarget.value,
            }), `resource:${resource.id}:name`)}
            required
            disabled={!canManage || saving}
          />
          <Select
            label="Facility"
            data={facilityOptions}
            value={resource.facilityDraftId}
            onChange={(value) => {
              if (!value) {
                return;
              }
              updateResourceDraft(resource.id, (draft) => ({
                ...draft,
                facilityDraftId: value,
              }), `resource:${resource.id}:facility`);
            }}
            searchable
            allowDeselect={false}
            required
            disabled={!canManage || saving || facilityOptions.length === 0}
          />
          <ResourceSportsInput
            value={resource.sportIds}
            options={mergedSportOptions}
            loading={sportsLoading}
            disabled={!canManage || saving || (sportsLoading && mergedSportOptions.length === 0)}
            onChange={(values) => updateResourceDraft(resource.id, (draft) => ({
              ...draft,
              sportIds: values,
            }), `resource:${resource.id}:sports`)}
          />
        </div>
        {sportsError ? (
          <Alert color="yellow" radius="md">
            {sportsError}
          </Alert>
        ) : null}
        {renderResourceLocation(resource)}
      </Stack>
    );
  };

  const renderWorkspaceActions = () => (
        <Group gap="xs" justify="flex-end">
          <Button size="xs" variant="light" onClick={onSwitchToSchedule}>
            <ArrowLeft size={15} aria-hidden="true" />
            Back to schedule
          </Button>
          <Button size="xs" variant="light" onClick={handleAddFacility} disabled={!canManage || saving}>
            + Facility
          </Button>
          <Button
            size="xs"
            onClick={handleAddResource}
            disabled={!canManage || saving || !activeFacilityId}
          >
            + Resource
          </Button>
          <Button
            size="xs"
            variant="default"
            onClick={handleUndo}
            disabled={!history.length || saving}
          >
            Undo
          </Button>
          <Button
            size="xs"
            onClick={() => void handleSaveChanges()}
            loading={saving}
            disabled={!pendingChangeCount || !canManage}
          >
            {pendingChangeCount ? `Save changes (${pendingChangeCount})` : 'Save changes'}
          </Button>
        </Group>
  );

  const selectedDetailNode = selectedResource
    ? renderResourceEditor(selectedResource)
    : selectedFacility
      ? renderFacilityEditor(selectedFacility)
      : (
          <Stack gap="xs">
            <Title order={5}>Facility details</Title>
            <Text size="sm" c="dimmed">Create a facility to start adding resources.</Text>
          </Stack>
        );

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <div>
          <Title order={5}>Facility details</Title>
          <Text size="sm" c="dimmed">
            Manage facilities and the resources assigned to each one.
          </Text>
        </div>
        {renderWorkspaceActions()}
      </Group>

      {formError ? (
        <Alert color="red" radius="md">
          {formError}
        </Alert>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(13rem,0.58fr)_minmax(13rem,0.62fr)_minmax(28rem,1.35fr)]">
        <Paper withBorder p={0} radius="md" className="overflow-hidden">
          <div className="border-b border-slate-200 px-3 py-2">
            <Text fw={700} size="sm">Facilities</Text>
            <Text size="xs" c="dimmed">
              {snapshot.facilities.length} total
            </Text>
          </div>
          <ScrollArea.Autosize mah={680} type="auto">
            <Stack gap={0}>
              {snapshot.facilities.length ? snapshot.facilities.map((facility) => {
                const selected = activeFacilityId === facility.id && !selectedResource;
                const pendingLabel = getFacilityPendingLabel(facility, baselineFacilitiesById);
                const resourceCount = snapshot.resources.filter((resource) => resource.facilityDraftId === facility.id).length;
                return (
                  <button
                    key={facility.id}
                    type="button"
                    className={[
                      'w-full border-b border-slate-100 px-3 py-2 text-left transition-colors hover:bg-slate-50',
                      selected ? 'bg-blue-50' : 'bg-white',
                    ].join(' ')}
                    onClick={() => setSnapshot((current) => ({
                      ...current,
                      selection: { type: 'facility', id: facility.id },
                    }))}
                  >
                    <Group gap="xs" justify="space-between" align="flex-start" wrap="nowrap">
                      <div className="min-w-0">
                        <Text fw={700} size="sm" truncate>
                          {facility.name.trim() || 'New facility'}
                        </Text>
                        <Text size="xs" c="dimmed" truncate>
                          {facility.location.trim() || 'Location required'}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {resourceCount} resource{resourceCount === 1 ? '' : 's'}
                        </Text>
                      </div>
                      {pendingLabel ? <Badge size="xs" variant="light">{pendingLabel}</Badge> : null}
                    </Group>
                  </button>
                );
              }) : (
                <div className="px-3 py-4">
                  <Text size="sm" c="dimmed">No facilities yet.</Text>
                </div>
              )}
            </Stack>
          </ScrollArea.Autosize>
        </Paper>

        <Paper withBorder p={0} radius="md" className="overflow-hidden">
          <div className="border-b border-slate-200 px-3 py-2">
            <Text fw={700} size="sm">Resources</Text>
            <Text size="xs" c="dimmed">
              {selectedFacility ? selectedFacility.name.trim() || 'New facility' : 'Select a facility'}
            </Text>
          </div>
          <ScrollArea.Autosize mah={680} type="auto">
            <Stack gap={0}>
              {visibleResources.length ? visibleResources.map((resource) => {
                const selected = snapshot.selection?.type === 'resource' && snapshot.selection.id === resource.id;
                const pendingLabel = getResourcePendingLabel(resource, baselineResourcesById);
                return (
                  <button
                    key={resource.id}
                    type="button"
                    className={[
                      'w-full border-b border-slate-100 px-3 py-2 text-left transition-colors hover:bg-slate-50',
                      selected ? 'bg-blue-50' : 'bg-white',
                    ].join(' ')}
                    onClick={() => setSnapshot((current) => ({
                      ...current,
                      selection: { type: 'resource', id: resource.id },
                    }))}
                  >
                    <Group gap="xs" justify="space-between" align="flex-start" wrap="nowrap">
                      <div className="min-w-0">
                        <Text fw={700} size="sm" truncate>
                          {resource.name.trim() || 'New resource'}
                        </Text>
                        <Text size="xs" c="dimmed" truncate>
                          {formatResourceSubtitle(resource, selectedFacility ?? undefined)}
                        </Text>
                        {resource.sportIds.length ? (
                          <Text size="xs" c="dimmed" truncate>
                            {resource.sportIds.length} sport{resource.sportIds.length === 1 ? '' : 's'}
                          </Text>
                        ) : null}
                      </div>
                      {pendingLabel ? <Badge size="xs" variant="light">{pendingLabel}</Badge> : null}
                    </Group>
                  </button>
                );
              }) : (
                <div className="px-3 py-4">
                  <Text size="sm" c="dimmed">
                    {activeFacilityId ? 'No resources in this facility.' : 'Create a facility first.'}
                  </Text>
                </div>
              )}
            </Stack>
          </ScrollArea.Autosize>
        </Paper>

        <Paper withBorder p="md" radius="md" className="min-w-0 xl:sticky xl:top-24 xl:self-start">
          <ScrollArea.Autosize mah={720} type="auto">
            {selectedDetailNode}
          </ScrollArea.Autosize>
        </Paper>
      </div>
    </Stack>
  );
}
