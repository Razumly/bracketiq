import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Alert,
  Button,
  Group,
  Loader,
  MultiSelect,
  NumberInput,
  Stack,
  Text,
} from "@/components/organization/organization-operation-ui";

export type DivisionOption = { id: string; name: string };
type DivisionTypePayload = {
  genders?: DivisionOption[];
  ages?: DivisionOption[];
  sportSkills?: SportSkillGroup[];
};

export type SportSkillGroup = {
  sportId: string;
  sportName?: string;
  skills: DivisionOption[];
};

export type DivisionDiscoveryFilterValue = {
  genders: string[];
  skillDivisionTypeIds: string[];
  ageDivisionTypeIds: string[];
  priceMinDollars: number | null;
  priceMaxDollars: number | null;
};

type Props = {
  value: DivisionDiscoveryFilterValue;
  onChange: (value: DivisionDiscoveryFilterValue) => void;
  selectedSports?: string[];
  options?: DivisionDiscoveryFilterOptions;
};
type DivisionTypeLoadState =
  | { status: "loading"; types: DivisionTypePayload }
  | { status: "ready"; types: DivisionTypePayload }
  | { status: "error"; types: DivisionTypePayload; message: string };

export type DivisionDiscoveryFilterOptions = {
  loading: boolean;
  error: string | null;
  genders: DivisionOption[];
  ages: DivisionOption[];
  skillOptions: Array<{ value: string; label: string }>;
  retry?: () => void;
};

const normalize = (value: string): string => value.trim().toLowerCase();

export const getSingleSelectedSportKey = (
  selectedSports: string[],
): string | null => {
  const selectedSportKeys = new Set(
    selectedSports.map(normalize).filter(Boolean),
  );
  return selectedSportKeys.size === 1
    ? (selectedSportKeys.values().next().value ?? null)
    : null;
};

export const buildSportSkillFilterOptions = (
  groups: SportSkillGroup[],
  selectedSports: string[],
): Array<{ value: string; label: string }> => {
  const selectedSportKey = getSingleSelectedSportKey(selectedSports);
  if (!selectedSportKey) return [];
  const eligibleGroups = groups
    .filter(
      (group) =>
        normalize(group.sportId) === selectedSportKey ||
        normalize(group.sportName ?? "") === selectedSportKey,
    )
    .map((group) => ({
      ...group,
      displayName: group.sportName?.trim() || group.sportId.trim(),
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName));

  const bySkillId = new Map<string, { name: string; sports: string[] }>();
  eligibleGroups.forEach((group) => {
    group.skills.forEach((skill) => {
      const id = skill.id.trim().toLowerCase();
      if (!id) return;
      const current = bySkillId.get(id) ?? {
        name: skill.name.trim() || skill.id,
        sports: [],
      };
      if (group.displayName && !current.sports.includes(group.displayName)) {
        current.sports.push(group.displayName);
      }
      bySkillId.set(id, current);
    });
  });

  const labelSports = eligibleGroups.length > 1;
  return Array.from(bySkillId, ([value, option]) => ({
    value,
    name: option.name,
    firstSport: option.sports[0] ?? "",
    label:
      labelSports && option.sports.length > 0
        ? `${option.sports.join(", ")} · ${option.name}`
        : option.name,
  }))
    .sort(
      (left, right) =>
        left.firstSport.localeCompare(right.firstSport) ||
        left.name.localeCompare(right.name),
    )
    .map(({ value, label }) => ({ value, label }));
};

export function useDivisionDiscoveryOptions(
  selectedSports: string[] = [],
  enabled = true,
): DivisionDiscoveryFilterOptions {
  const [loadState, setLoadState] = useState<DivisionTypeLoadState>({
    status: "loading",
    types: {},
  });
  const [requestVersion, setRequestVersion] = useState(0);
  const retry = useCallback(() => {
    setLoadState({ status: "loading", types: {} });
    setRequestVersion((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetch("/api/division-types", { signal: controller.signal })
      .then((response) =>
        response.ok
          ? response.json()
          : Promise.reject(new Error("Failed to load division filters")),
      )
      .then((body) => {
        if (controller.signal.aborted) {
          return;
        }
        setLoadState({ status: "ready", types: body ?? {} });
      })
      .catch((loadError) => {
        if (controller.signal.aborted || loadError.name === "AbortError") {
          return;
        }
        setLoadState({
          status: "error",
          types: {},
          message: "Unable to load division filters.",
        });
      });
    return () => controller.abort();
  }, [enabled, requestVersion]);

  const { types } = loadState;
  const loading = loadState.status === "loading";
  const error = loadState.status === "error" ? loadState.message : null;
  const skillOptions = useMemo(
    () => buildSportSkillFilterOptions(types.sportSkills ?? [], selectedSports),
    [selectedSports, types.sportSkills],
  );

  return {
    loading,
    error,
    genders: types.genders ?? [],
    ages: types.ages ?? [],
    skillOptions,
    retry,
  };
}

export function DivisionDiscoveryFilterContent({
  options,
  children,
}: {
  options: DivisionDiscoveryFilterOptions;
  children?: ReactNode;
}) {
  if (options.loading)
    return <Loader size="sm" aria-label="Loading division filters" />;
  if (options.error) {
    return (
      <Alert color="red">
        <Stack gap="sm">
          <Text size="sm">{options.error}</Text>
          {options.retry ? (
            <Button variant="outline" size="sm" onClick={options.retry}>
              Retry division filters
            </Button>
          ) : (
            <Text size="sm">Reload this page to try again.</Text>
          )}
        </Stack>
      </Alert>
    );
  }
  return <>{children}</>;
}

export default function DivisionDiscoveryFilters({
  value,
  onChange,
  selectedSports = [],
  options,
}: Props) {
  const loadedOptions = useDivisionDiscoveryOptions(selectedSports, !options);
  const resolvedOptions = options ?? loadedOptions;
  const { loading, error, genders, ages, skillOptions } = resolvedOptions;
  const hasSingleSport = getSingleSelectedSportKey(selectedSports) !== null;

  useEffect(() => {
    if (hasSingleSport && (loading || error)) return;
    const availableSkillIds = new Set(
      hasSingleSport ? skillOptions.map((option) => normalize(option.value)) : [],
    );
    const nextSkillIds = value.skillDivisionTypeIds.filter((id) =>
      availableSkillIds.has(normalize(id)),
    );
    if (
      nextSkillIds.length !== value.skillDivisionTypeIds.length ||
      nextSkillIds.some((id, index) => id !== value.skillDivisionTypeIds[index])
    ) {
      onChange({ ...value, skillDivisionTypeIds: nextSkillIds });
    }
  }, [error, hasSingleSport, loading, onChange, skillOptions, value]);

  if (loading || error)
    return <DivisionDiscoveryFilterContent options={resolvedOptions} />;

  return (
    <Stack gap="sm">
      <Text size="xs" fw={700} c="dimmed" tt="uppercase">
        Division
      </Text>
      <MultiSelect
        label="Gender"
        placeholder="Any gender"
        data={genders.map((option) => ({
          value: option.id,
          label: option.name,
        }))}
        value={value.genders}
        clearable
        onChange={(genders) => onChange({ ...value, genders })}
      />
      <MultiSelect
        label="Age group"
        placeholder="Any age group"
        data={ages.map((option) => ({
          value: option.id,
          label: option.name,
        }))}
        value={value.ageDivisionTypeIds}
        searchable
        clearable
        onChange={(ageDivisionTypeIds) =>
          onChange({ ...value, ageDivisionTypeIds })
        }
      />
      {hasSingleSport && <MultiSelect
        label="Skill level"
        placeholder="Any skill level"
        data={skillOptions}
        value={value.skillDivisionTypeIds}
        searchable
        clearable
        onChange={(skillDivisionTypeIds) =>
          onChange({ ...value, skillDivisionTypeIds })
        }
      />}
      <Group grow align="flex-start">
        <NumberInput
          label="Minimum price"
          prefix="$"
          min={0}
          decimalScale={2}
          value={value.priceMinDollars ?? ""}
          onChange={(next) =>
            onChange({
              ...value,
              priceMinDollars:
                typeof next === "number" && Number.isFinite(next) ? next : null,
            })
          }
        />
        <NumberInput
          label="Maximum price"
          prefix="$"
          min={0}
          decimalScale={2}
          value={value.priceMaxDollars ?? ""}
          onChange={(next) =>
            onChange({
              ...value,
              priceMaxDollars:
                typeof next === "number" && Number.isFinite(next) ? next : null,
            })
          }
        />
      </Group>
      <Text size="xs" c="dimmed">
        All selected division filters must match the same division.
      </Text>
    </Stack>
  );
}

