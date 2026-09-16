export type SportCategoryRow = {
  id: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  name: string;
  sportIds?: string[] | null;
  displayOrder?: number | null;
};

type SportIdentity = {
  id: string;
  name?: string | null;
};

type SportCategoryCreateInput = {
  id: string;
  name: string;
  sportIds: string[];
  displayOrder: number;
};

type SportCategoriesClientLike = {
  sportCategories: {
    findMany: (args?: any) => Promise<SportCategoryRow[]>;
    createMany: (args: { data: SportCategoryCreateInput[]; skipDuplicates?: boolean }) => Promise<unknown>;
  };
};

export type DefaultSportCategorySeed = {
  id: string;
  name: string;
  displayOrder: number;
  sportNames: readonly string[];
};

export const DEFAULT_SPORT_CATEGORY_SEEDS: readonly DefaultSportCategorySeed[] = [
  {
    id: 'soccer',
    name: 'Soccer',
    displayOrder: 10,
    sportNames: ['Indoor Soccer', 'Grass Soccer', 'Beach Soccer', 'Futsal'],
  },
  {
    id: 'volleyball',
    name: 'Volleyball',
    displayOrder: 20,
    sportNames: ['Indoor Volleyball', 'Beach Volleyball', 'Grass Volleyball'],
  },
  {
    id: 'football',
    name: 'Football',
    displayOrder: 30,
    sportNames: ['Football', 'Flag Football', 'Australian Football'],
  },
  {
    id: 'hockey',
    name: 'Hockey',
    displayOrder: 40,
    sportNames: ['Hockey', 'Field Hockey', 'Ball Hockey'],
  },
  {
    id: 'baseball',
    name: 'Baseball',
    displayOrder: 50,
    sportNames: ['Baseball', 'Softball'],
  },
];

const normalizeName = (value: unknown): string => String(value ?? '').trim().toLowerCase();

const categoryOrder = [{ displayOrder: 'asc' }, { name: 'asc' }];

const buildCategoryInput = (
  seed: DefaultSportCategorySeed,
  sportsByName: ReadonlyMap<string, SportIdentity>,
): SportCategoryCreateInput => ({
  id: seed.id,
  name: seed.name,
  sportIds: seed.sportNames.flatMap((name) => {
    const sport = sportsByName.get(normalizeName(name));
    return sport?.id ? [sport.id] : [];
  }),
  displayOrder: seed.displayOrder,
});

export const ensureDefaultSportCategories = async (
  client: SportCategoriesClientLike,
  sports: readonly SportIdentity[],
): Promise<SportCategoryRow[]> => {
  let categories = await client.sportCategories.findMany({ orderBy: categoryOrder });
  const sportsByName = new Map(
    sports
      .map((sport) => [normalizeName(sport.name), sport] as const)
      .filter(([name, sport]) => Boolean(name) && Boolean(sport.id)),
  );
  const existingById = new Map(categories.map((category) => [category.id, category]));
  const existingByName = new Map(
    categories
      .map((category) => [normalizeName(category.name), category] as const)
      .filter(([name]) => Boolean(name)),
  );
  const missing = DEFAULT_SPORT_CATEGORY_SEEDS
    .filter((seed) => !existingById.has(seed.id) && !existingByName.has(normalizeName(seed.name)))
    .map((seed) => buildCategoryInput(seed, sportsByName));

  if (missing.length > 0) {
    await client.sportCategories.createMany({ data: missing, skipDuplicates: true });
    categories = await client.sportCategories.findMany({ orderBy: categoryOrder });
  }

  return categories;
};
