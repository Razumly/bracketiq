import { readFile, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { prisma } from '../src/lib/prisma';

const baselinePath = 'test-results/issue-51-graph-baseline.json';
const sortRows = <T>(rows: T[]): T[] => rows.sort((left, right) =>
  JSON.stringify(left).localeCompare(JSON.stringify(right)));

function assertIsolatedDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/bracketiq_e2e_51_samue') {
    throw new Error('Use the isolated local issue 51 database.');
  }
}

async function main() {
  assertIsolatedDatabase();
  const session = JSON.parse(await readFile('test-results/issue-51-session.json', 'utf8')) as { eventIds: string[] };
  const eventId = session.eventIds.find((id) => id.endsWith('-league'));
  if (!eventId?.startsWith('issue-51-')) throw new Error('The issue 51 League fixture is missing.');
  const state = JSON.parse(JSON.stringify({
    matches: sortRows(await prisma.matches.findMany({ where: { eventId } })),
    phases: sortRows(await prisma.divisions.findMany({ where: { eventId, role: 'PHASE' } })),
    sources: sortRows(await prisma.eventDivisionPhaseSources.findMany({ where: { eventId } })),
    participants: sortRows(await prisma.eventDivisionPhaseParticipants.findMany({ where: { eventId } })),
  }));
  if (!state.matches.length || !state.phases.length) throw new Error('The fixture needs Matches and Phase Divisions.');
  if (process.argv[2] === 'snapshot') {
    await writeFile(baselinePath, JSON.stringify(state));
    console.log('Recorded the issue 51 Match Graph baseline.');
    return;
  }
  if (process.argv[2] !== 'verify') throw new Error('Use snapshot or verify.');
  const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
  if (!isDeepStrictEqual(state, baseline)) throw new Error('Event Type Save changed the Match Graph or phase ownership.');
  console.log('Match rows, Phase Divisions, sources, and rosters are unchanged.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
