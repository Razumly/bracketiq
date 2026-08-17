import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const WORKBOOK_URL = 'https://www2.census.gov/programs-surveys/popest/tables/2020-2025/cities/totals/SUB-IP-EST2025-ANNRNK.xlsx';
const GAZETTEER_URL = 'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_Gaz_place_national.zip';
const CENSUS_VINTAGE = 2025;
const THRESHOLD_POPULATION = 178_618;

const STATE_CODES: Record<string, string> = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO',
  Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID',
  Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA',
  Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN',
  Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR',
  Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD',
  Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA',
  'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY', 'District of Columbia': 'DC',
};

type RankedRow = { rank: number; censusName: string; city: string; state: string; population: number };
type GazetteerRow = { USPS: string; GEOID: string; NAME: string };

type CatalogCity = RankedRow & {
  placeGeoid: string;
  stateCode: string;
  marketKey: string;
  marketName: string;
  cohort: 'WEST_COAST_CORE' | 'WEST_COAST_EXPANSION' | 'NATIONAL';
  populationWeight: number;
};

const decodeXml = (value: string): string => value
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));

const unzipText = (archive: string, member: string): string => execFileSync(
  'unzip', ['-p', archive, member], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
);

const cellValue = (cell: string, sharedStrings: string[]): string => {
  const type = /\bt="([^"]+)"/.exec(cell)?.[1];
  const value = /<v[^>]*>([\s\S]*?)<\/v>/.exec(cell)?.[1] ?? '';
  if (type === 's' && value) return sharedStrings[Number(value)] ?? '';
  return decodeXml(value);
};

const parseWorkbook = (archive: string): RankedRow[] => {
  const sharedStringsXml = unzipText(archive, 'xl/sharedStrings.xml');
  const sharedStrings = [...sharedStringsXml.matchAll(/<si\b[\s\S]*?<\/si>/g)].map((match) => (
    [...match[0].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
      .map((text) => decodeXml(text[1]))
      .join('')
  ));
  const worksheetXml = unzipText(archive, 'xl/worksheets/sheet1.xml');
  const rows = [...worksheetXml.matchAll(/<row\b[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)];
  return rows.filter((match) => Number(match[1]) >= 5)
    .map((match) => {
      const values: Record<string, string> = {};
      for (const cellMatch of match[2].matchAll(/<c\b[^>]*r="([A-Z]+)\d+"[^>]*>([\s\S]*?)<\/c>/g)) {
        values[cellMatch[1]] = cellValue(cellMatch[0], sharedStrings);
      }
      const censusName = values.B ?? '';
      const [city] = censusName.split(/,\s*(?=[^,]+$)/);
      const state = censusName.slice(city.length).replace(/^,\s*/, '');
      return {
        rank: Number(values.A),
        censusName,
        city,
        state,
        population: Number(values.I),
      };
    });
};

const parseGazetteer = (archive: string): GazetteerRow[] => {
  const text = unzipText(archive, '2025_Gaz_place_national.txt').replace(/^\uFEFF/, '');
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const fields = header.split('|');
  return lines.map((line) => {
    const values = line.split('|');
    return {
      USPS: values[fields.indexOf('USPS')] ?? '',
      GEOID: values[fields.indexOf('GEOID')] ?? '',
      NAME: values[fields.indexOf('NAME')] ?? '',
    };
  });
};

const slug = (value: string): string => value
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

const displayCity = (value: string): string => value
  .replace(/\s+city(?:\s*\(balance\))?$/i, '')
  .replace(/\s+town$/i, '')
  .replace(/\s+CDP$/i, '')
  .replace(/\s+municipality$/i, '')
  .replace(/\s+urban county$/i, '')
  .trim();

const populationWeight = (population: number): number => {
  if (population >= 1_000_000) return 1;
  if (population >= 500_000) return 0.85;
  if (population >= 250_000) return 0.7;
  return 0.55;
};

const rankMarketKey: Record<number, string> = {
  1: 'new-york', 2: 'greater-los-angeles', 3: 'chicago', 4: 'houston', 5: 'phoenix',
  6: 'philadelphia', 7: 'san-antonio', 8: 'san-diego', 9: 'dallas-fort-worth', 10: 'dallas-fort-worth',
  11: 'jacksonville', 12: 'austin', 13: 'san-francisco-bay', 14: 'charlotte',
  15: 'columbus', 16: 'indianapolis', 17: 'san-francisco-bay', 18: 'seattle-tacoma', 19: 'denver',
  20: 'nashville', 21: 'oklahoma-city', 22: 'washington-dc', 23: 'el-paso',
  24: 'las-vegas', 25: 'boston', 26: 'detroit', 27: 'louisville',
  28: 'portland-vancouver', 29: 'memphis', 30: 'baltimore', 31: 'milwaukee',
  32: 'albuquerque', 33: 'fresno', 34: 'tucson', 35: 'sacramento', 36: 'atlanta',
  37: 'kansas-city', 38: 'phoenix', 39: 'raleigh', 40: 'colorado-springs', 41: 'miami', 42: 'omaha',
  43: 'hampton-roads', 44: 'greater-los-angeles', 45: 'san-francisco-bay', 46: 'minneapolis-st-paul',
  47: 'bakersfield', 48: 'tulsa', 49: 'tampa', 50: 'denver',
};

const extraMarketKey = (row: RankedRow): string | null => {
  const key = `${displayCity(row.city)}|${row.state}`;
  const grouped: Record<string, string> = {
    'Anaheim|California': 'greater-los-angeles',
    'Irvine|California': 'greater-los-angeles',
    'Santa Ana|California': 'greater-los-angeles',
    'Santa Clarita|California': 'greater-los-angeles',
    'Huntington Beach|California': 'greater-los-angeles',
    'Glendale|California': 'greater-los-angeles',
    'Chula Vista|California': 'san-diego',
    'Fremont|California': 'san-francisco-bay',
    'Elk Grove|California': 'sacramento',
    'Vancouver|Washington': 'portland-vancouver',
    'Tacoma|Washington': 'seattle-tacoma',
    'Riverside|California': 'inland-empire',
    'San Bernardino|California': 'inland-empire',
    'Fontana|California': 'inland-empire',
    'Moreno Valley|California': 'inland-empire',
    'Ontario|California': 'inland-empire',
  };
  return grouped[key] ?? null;
};

const marketNames: Record<string, string> = {
  'new-york': 'New York Metro Sports Sources',
  'greater-los-angeles': 'Greater Los Angeles Sports Sources',
  chicago: 'Chicago Metro Sports Sources',
  houston: 'Houston Metro Sports Sources',
  phoenix: 'Phoenix Metro Sports Sources',
  philadelphia: 'Philadelphia Metro Sports Sources',
  'san-antonio': 'San Antonio Metro Sports Sources',
  'san-diego': 'San Diego Metro Sports Sources',
  'dallas-fort-worth': 'Dallas-Fort Worth Metro Sports Sources',
  jacksonville: 'Jacksonville Metro Sports Sources',
  austin: 'Austin Metro Sports Sources',
  'san-francisco-bay': 'San Francisco Bay Area Sports Sources',
  charlotte: 'Charlotte Metro Sports Sources',
  columbus: 'Columbus Metro Sports Sources',
  indianapolis: 'Indianapolis Metro Sports Sources',
  'seattle-tacoma': 'Seattle-Tacoma Metro Sports Sources',
  denver: 'Denver Metro Sports Sources',
  nashville: 'Nashville Metro Sports Sources',
  'oklahoma-city': 'Oklahoma City Metro Sports Sources',
  'washington-dc': 'Washington DC Metro Sports Sources',
  'el-paso': 'El Paso Metro Sports Sources',
  'las-vegas': 'Las Vegas Metro Sports Sources',
  boston: 'Boston Metro Sports Sources',
  detroit: 'Detroit Metro Sports Sources',
  louisville: 'Louisville Metro Sports Sources',
  'portland-vancouver': 'Portland-Vancouver Metro Sports Sources',
  memphis: 'Memphis Metro Sports Sources',
  baltimore: 'Baltimore Metro Sports Sources',
  milwaukee: 'Milwaukee Metro Sports Sources',
  albuquerque: 'Albuquerque Metro Sports Sources',
  fresno: 'Fresno Metro Sports Sources',
  tucson: 'Tucson Metro Sports Sources',
  sacramento: 'Sacramento Metro Sports Sources',
  atlanta: 'Atlanta Metro Sports Sources',
  'kansas-city': 'Kansas City Metro Sports Sources',
  raleigh: 'Raleigh Metro Sports Sources',
  'colorado-springs': 'Colorado Springs Metro Sports Sources',
  miami: 'Miami Metro Sports Sources',
  omaha: 'Omaha Metro Sports Sources',
  'hampton-roads': 'Hampton Roads Metro Sports Sources',
  'minneapolis-st-paul': 'Minneapolis-St. Paul Metro Sports Sources',
  bakersfield: 'Bakersfield Sports Sources',
  tulsa: 'Tulsa Sports Sources',
  tampa: 'Tampa Metro Sports Sources',
  'inland-empire': 'Inland Empire Sports Sources',
};

const marketFor = (row: RankedRow): string => rankMarketKey[row.rank] ?? extraMarketKey(row) ?? slug(`${displayCity(row.city)}-${row.state}`);

const cohortFor = (marketKey: string, stateCode: string): CatalogCity['cohort'] => {
  if (marketKey === 'portland-vancouver' || marketKey === 'seattle-tacoma') return 'WEST_COAST_CORE';
  if (['CA', 'OR', 'WA'].includes(stateCode)) return 'WEST_COAST_EXPANSION';
  return 'NATIONAL';
};

const canonicalJson = (value: unknown): string => JSON.stringify(value);

const parseArgs = (): { output: string; workbook?: string; gazetteer?: string; thresholdPopulation?: number } => {
  const args = process.argv.slice(2);
  const get = (name: string): string | undefined => {
    const exactIndex = args.indexOf(name);
    if (exactIndex >= 0) return args[exactIndex + 1];
    const inline = args.find((argument) => argument.startsWith(`${name}=`));
    return inline?.slice(name.length + 1);
  };
  const thresholdValue = get('--threshold-population');
  return {
    output: get('--output') ?? 'data/affiliate-coverage/us-incorporated-cities-2025.json',
    workbook: get('--workbook'),
    gazetteer: get('--gazetteer'),
    thresholdPopulation: thresholdValue === undefined ? undefined : Number(thresholdValue),
  };
};

const download = async (url: string, destination: string): Promise<void> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed (${response.status}) for ${url}`);
  await fs.writeFile(destination, Buffer.from(await response.arrayBuffer()));
};

const main = async (): Promise<void> => {
  const args = parseArgs();
  const thresholdPopulation = args.thresholdPopulation ?? THRESHOLD_POPULATION;
  if (!Number.isInteger(thresholdPopulation) || thresholdPopulation <= 0) {
    throw new Error('The population threshold must be a positive integer.');
  }
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'affiliate-coverage-census-'));
  const workbookPath = args.workbook ?? path.join(temporaryDirectory, 'ranked.xlsx');
  const gazetteerPath = args.gazetteer ?? path.join(temporaryDirectory, 'gazetteer.zip');
  if (!args.workbook) await download(WORKBOOK_URL, workbookPath);
  if (!args.gazetteer) await download(GAZETTEER_URL, gazetteerPath);
  const rankedRows = parseWorkbook(workbookPath)
    .filter((row) => row.rank > 0 && row.population >= thresholdPopulation)
    .sort((left, right) => left.rank - right.rank);
  if (!rankedRows.length) throw new Error('Census ranked workbook contains no city at the configured population threshold.');
  const gazetteer = parseGazetteer(gazetteerPath);
  const cities: CatalogCity[] = rankedRows.map((row) => {
    const stateCode = STATE_CODES[row.state];
    if (!stateCode) throw new Error(`Unknown state ${row.state} for rank ${row.rank}.`);
    const matches = gazetteer.filter((entry) => entry.NAME === row.city && entry.USPS === stateCode);
    if (matches.length !== 1) throw new Error(`Expected one Gazetteer match for ${row.censusName}; found ${matches.length}.`);
    const marketKey = marketFor(row);
    const city = displayCity(row.city);
    return {
      ...row,
      city,
      placeGeoid: matches[0].GEOID,
      stateCode,
      marketKey,
      marketName: marketNames[marketKey] ?? `${city} Sports Sources`,
      cohort: cohortFor(marketKey, stateCode),
      populationWeight: populationWeight(row.population),
    };
  });
  const base = {
    schemaVersion: 1,
    censusVintage: CENSUS_VINTAGE,
    estimateDate: '2025-07-01',
    thresholdCity: 'Eugene, Oregon',
    thresholdPopulation,
    source: { workbookUrl: WORKBOOK_URL, gazetteerUrl: GAZETTEER_URL },
    cities,
  };
  const ranks = new Set(cities.map((city) => city.rank));
  const geoids = new Set(cities.map((city) => city.placeGeoid));
  if (ranks.size !== cities.length || cities.some((city, index) => city.rank !== index + 1)) {
    throw new Error(`Census ranked workbook must contain each rank from 1 through ${cities.length} exactly once.`);
  }
  if (geoids.size !== cities.length) throw new Error('Census Gazetteer place GEOIDs must be unique.');
  if (cities.some((city) => city.population < thresholdPopulation)) {
    throw new Error('Census ranked workbook contains a city below the configured population threshold.');
  }
  const stateCounts = cities.reduce<Record<string, number>>((counts, city) => {
    counts[city.stateCode] = (counts[city.stateCode] ?? 0) + 1;
    return counts;
  }, {});
  const checksum = createHash('sha256').update(canonicalJson(base)).digest('hex');
  const output = `${JSON.stringify({ ...base, checksum }, null, 2)}\n`;
  await fs.mkdir(path.dirname(path.resolve(args.output)), { recursive: true });
  await fs.writeFile(args.output, output, 'utf8');
  console.log(JSON.stringify({
    output: path.resolve(args.output),
    checksum,
    censusVintage: CENSUS_VINTAGE,
    thresholdCity: 'Eugene, Oregon',
    thresholdPopulation,
    cityCount: cities.length,
    westCoastCityCount: cities.filter((city) => city.cohort !== 'NATIONAL').length,
    marketCount: new Set(cities.map((city) => city.marketKey)).size,
    californiaCityCount: stateCounts.CA ?? 0,
    oregonCityCount: stateCounts.OR ?? 0,
    washingtonCityCount: stateCounts.WA ?? 0,
  }, null, 2));
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
