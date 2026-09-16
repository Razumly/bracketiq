import type { SportCategory } from '@/types';

export type SportFilterOption = string | {
  value?: unknown;
  label?: unknown;
  id?: unknown;
  $id?: unknown;
  name?: unknown;
};

export type NormalizedSportFilterOption = {
  id: string;
  name: string;
};

export type SportCategoryGroup = {
  category: SportCategory;
  sports: NormalizedSportFilterOption[];
};

const normalizeKey = (value: unknown): string => String(value ?? '').trim().toLowerCase();

const readOptionValue = (option: SportFilterOption, keys: readonly string[]): string => {
  if (typeof option === 'string') return option.trim();
  for (const key of keys) {
    const value = option[key as keyof typeof option];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
};

export const getSportOptionId = (option: SportFilterOption): string => (
  readOptionValue(option, ['$id', 'id', 'value', 'name', 'label'])
);

export const getSportOptionName = (option: SportFilterOption): string => (
  readOptionValue(option, ['name', 'label', 'value', '$id', 'id'])
);

export const normalizeSportFilterOptions = (
  options: ReadonlyArray<SportFilterOption>,
): NormalizedSportFilterOption[] => {
  const seen = new Set<string>();
  return options.flatMap((option) => {
    const id = getSportOptionId(option);
    const name = getSportOptionName(option);
    const key = normalizeKey(name || id);
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [{ id: id || name, name: name || id }];
  });
};

const sortedCategories = (categories: ReadonlyArray<SportCategory>): SportCategory[] => (
  categories
    .filter((category) => Boolean(category?.name?.trim()))
    .slice()
    .sort((left, right) => (
      (left.displayOrder - right.displayOrder)
      || left.name.localeCompare(right.name)
      || left.$id.localeCompare(right.$id)
    ))
);

const optionMatchesMemberId = (
  option: NormalizedSportFilterOption,
  memberId: unknown,
): boolean => {
  const key = normalizeKey(memberId);
  return Boolean(key) && (normalizeKey(option.id) === key || normalizeKey(option.name) === key);
};

export const buildSportCategoryGroups = (
  options: ReadonlyArray<SportFilterOption>,
  categories: ReadonlyArray<SportCategory>,
): SportCategoryGroup[] => {
  const normalizedOptions = normalizeSportFilterOptions(options);
  return sortedCategories(categories).flatMap((category) => {
    const members = Array.isArray(category.sportIds) ? category.sportIds : [];
    const sports = normalizedOptions.filter((option) => (
      members.some((memberId) => optionMatchesMemberId(option, memberId))
    ));
    if (sports.length === 0) return [];
    return [{ category, sports }];
  });
};

export const getUngroupedSportOptions = (
  options: ReadonlyArray<SportFilterOption>,
  categories: ReadonlyArray<SportCategory>,
): NormalizedSportFilterOption[] => {
  const normalizedOptions = normalizeSportFilterOptions(options);
  const groupedKeys = new Set(
    buildSportCategoryGroups(options, categories)
      .flatMap((group) => group.sports.flatMap((sport) => [normalizeKey(sport.id), normalizeKey(sport.name)])),
  );
  return normalizedOptions.filter((sport) => (
    !groupedKeys.has(normalizeKey(sport.id)) && !groupedKeys.has(normalizeKey(sport.name))
  ));
};

const selectedKeys = (selected: ReadonlyArray<string>): Set<string> => (
  new Set(selected.map(normalizeKey).filter(Boolean))
);

const isSelected = (
  selected: ReadonlySet<string>,
  sport: NormalizedSportFilterOption,
): boolean => selected.has(normalizeKey(sport.name)) || selected.has(normalizeKey(sport.id));

const getGroupForCategory = (
  category: SportCategory,
  options: ReadonlyArray<SportFilterOption>,
): SportCategoryGroup | undefined => (
  buildSportCategoryGroups(options, [category]).find((group) => group.category.$id === category.$id)
);

export const isSportCategorySelected = (
  category: SportCategory,
  selected: ReadonlyArray<string>,
  options: ReadonlyArray<SportFilterOption>,
): boolean => {
  const group = getGroupForCategory(category, options);
  if (!group || group.sports.length === 0) return false;
  const keys = selectedKeys(selected);
  return group.sports.every((sport) => isSelected(keys, sport));
};

export const isSportCategoryPartiallySelected = (
  category: SportCategory,
  selected: ReadonlyArray<string>,
  options: ReadonlyArray<SportFilterOption>,
): boolean => {
  const group = getGroupForCategory(category, options);
  if (!group || group.sports.length === 0) return false;
  const keys = selectedKeys(selected);
  const selectedCount = group.sports.filter((sport) => isSelected(keys, sport)).length;
  return selectedCount > 0 && selectedCount < group.sports.length;
};

export const toggleSportCategorySelection = (
  selected: ReadonlyArray<string>,
  category: SportCategory,
  options: ReadonlyArray<SportFilterOption>,
): string[] => {
  const group = getGroupForCategory(category, options);
  if (!group || group.sports.length === 0) return Array.from(selected);

  const keys = selectedKeys(selected);
  const allSelected = group.sports.every((sport) => isSelected(keys, sport));
  const memberKeys = new Set(
    group.sports.flatMap((sport) => [normalizeKey(sport.id), normalizeKey(sport.name)]),
  );
  if (allSelected) {
    return selected.filter((value) => !memberKeys.has(normalizeKey(value)));
  }

  const next = Array.from(selected);
  const nextKeys = selectedKeys(next);
  group.sports.forEach((sport) => {
    const sportKey = normalizeKey(sport.name);
    if (!nextKeys.has(sportKey)) {
      next.push(sport.name);
      nextKeys.add(sportKey);
    }
  });
  return next;
};

export const toggleSportSelection = (
  selected: ReadonlyArray<string>,
  sportName: string,
): string[] => {
  const key = normalizeKey(sportName);
  if (!key) return Array.from(selected);
  const alreadySelected = selected.some((value) => normalizeKey(value) === key);
  return alreadySelected
    ? selected.filter((value) => normalizeKey(value) !== key)
    : [...selected, sportName];
};

export const getSportSelectionLabels = (
  selected: ReadonlyArray<string>,
  options: ReadonlyArray<SportFilterOption>,
  categories: ReadonlyArray<SportCategory>,
): string[] => {
  const groups = buildSportCategoryGroups(options, categories);
  const selectedValues = Array.from(selected);
  const selectedValueKeys = selectedKeys(selectedValues);
  const coveredKeys = new Set<string>();
  const labels: string[] = [];

  groups.forEach((group) => {
    if (!group.sports.every((sport) => isSelected(selectedValueKeys, sport))) return;
    labels.push(group.category.name);
    group.sports.forEach((sport) => {
      coveredKeys.add(normalizeKey(sport.name));
      coveredKeys.add(normalizeKey(sport.id));
    });
  });

  selectedValues.forEach((value) => {
    if (!coveredKeys.has(normalizeKey(value))) {
      labels.push(value);
    }
  });

  return labels;
};
