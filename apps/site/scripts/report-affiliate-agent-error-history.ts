import dotenv from "dotenv";

import { configureAffiliateLiveDatabaseEnvironment } from "../src/server/affiliateImports/agentRepository";
import {
  AffiliateAgentErrorHistoryInputError,
  AFFILIATE_AGENT_ERROR_HISTORY_DEFAULT_MAX_RESULTS,
  AFFILIATE_AGENT_ERROR_HISTORY_MAX_RESULTS,
  loadAffiliateAgentErrorHistoryReport,
  parseAffiliateAgentErrorHistoryFilters,
  withAffiliateAgentErrorHistoryReadOnly,
} from "../src/server/affiliateImports/affiliateAgentErrorHistory";
import type {
  AffiliateAgentErrorHistoryFilters,
  AffiliateAgentErrorHistoryReadOnlyClient,
  AffiliateAgentErrorHistoryReadClient,
} from "../src/server/affiliateImports/affiliateAgentErrorHistory";

dotenv.config({ quiet: true });
dotenv.config({ path: ".env.local", override: false, quiet: true });

export const AFFILIATE_AGENT_ERROR_HISTORY_REPORT_USAGE = `Affiliate agent error history report (read-only)

Usage:
  npm run affiliate:agent-errors:report
  npm run affiliate:agent-errors:report -- --claim-id=<claim-id>
  npm run affiliate:agent-errors:report -- --job-id=<job-id> --source-id=<supply-source-id>
  npm run affiliate:agent-errors:report -- --max-results=<1-${AFFILIATE_AGENT_ERROR_HISTORY_MAX_RESULTS}>
  npm run affiliate:agent-errors:report -- --live --max-results=50

Options:
  --claim-id <id>       Limit rows to one stored claim.
  --job-id <id>         Limit rows to one stored job.
  --source-id <id>      Limit rows to one stored Supply Source.
  --max-results <n>     Return at most n records (default ${AFFILIATE_AGENT_ERROR_HISTORY_DEFAULT_MAX_RESULTS}).
  --live                Use DATABASE_URL_LIVE after the normal operator guard.
  --help, -h            Print this help without opening a database connection.

The command always runs inside a PostgreSQL SET TRANSACTION READ ONLY guard.
It emits JSON and never writes, retries, changes instructions, or controls a runtime.`;

export type ParsedAffiliateAgentErrorHistoryReportCliOptions = Readonly<{
  help: boolean;
  live: boolean;
  filters: AffiliateAgentErrorHistoryFilters;
}>;

const valueFor = (
  argv: readonly string[],
  flag: string,
): string | undefined => {
  const prefix = `${flag}=`;
  const inline = argv.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = argv.indexOf(flag);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new AffiliateAgentErrorHistoryInputError(`${flag} requires a value.`);
  }
  return value;
};

const hasFlag = (argv: readonly string[], flag: string): boolean => (
  argv.includes(flag) || argv.some((argument) => argument.startsWith(`${flag}=`))
);

const ensureKnownArguments = (argv: readonly string[]): void => {
  const valueFlags = new Set(["--claim-id", "--job-id", "--source-id", "--max-results"]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h" || argument === "--live") continue;
    const equalsIndex = argument.indexOf("=");
    const flag = equalsIndex >= 0 ? argument.slice(0, equalsIndex) : argument;
    if (valueFlags.has(flag)) {
      if (equalsIndex < 0) index += 1;
      continue;
    }
    throw new AffiliateAgentErrorHistoryInputError(`Unknown option: ${argument}`);
  }
};

export const parseAffiliateAgentErrorHistoryReportCliArgs = (
  argv: readonly string[],
): ParsedAffiliateAgentErrorHistoryReportCliOptions => {
  const help = argv.includes("--help") || argv.includes("-h");
  if (help) return { help: true, live: false, filters: {} };
  ensureKnownArguments(argv);
  const valueFlags = ["--claim-id", "--job-id", "--source-id", "--max-results"];
  for (const flag of valueFlags) {
    const occurrences = argv.filter((argument) => (
      argument === flag || argument.startsWith(`${flag}=`)
    )).length;
    if (occurrences > 1) {
      throw new AffiliateAgentErrorHistoryInputError(`${flag} must be supplied once.`);
    }
  }
  const maxResultsText = valueFor(argv, "--max-results");
  const maxResults = maxResultsText === undefined
    ? undefined
    : Number(maxResultsText);
  if (maxResultsText !== undefined && !Number.isSafeInteger(maxResults)) {
    throw new AffiliateAgentErrorHistoryInputError("The maximum result count must be an integer.");
  }
  return {
    help: false,
    live: hasFlag(argv, "--live"),
    filters: parseAffiliateAgentErrorHistoryFilters({
      claimId: valueFor(argv, "--claim-id"),
      jobId: valueFor(argv, "--job-id"),
      sourceId: valueFor(argv, "--source-id"),
      ...(maxResults === undefined ? {} : { maxResults }),
    }),
  };
};

export const runAffiliateAgentErrorHistoryReport = async (
  options: ParsedAffiliateAgentErrorHistoryReportCliOptions,
): Promise<void> => {
  if (options.help) {
    process.stdout.write(`${AFFILIATE_AGENT_ERROR_HISTORY_REPORT_USAGE}\n`);
    return;
  }
  if (options.live) configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE);
  // Keep Prisma initialization out of --help, which must work without database access.
  const { prisma } = await import("../src/lib/prisma");
  try {
    const report = await withAffiliateAgentErrorHistoryReadOnly(
      prisma as unknown as Readonly<{
        $transaction: <T>(callback: (transaction: AffiliateAgentErrorHistoryReadOnlyClient) => Promise<T>) => Promise<T>;
      }>,
      (transaction) => loadAffiliateAgentErrorHistoryReport(
        transaction as unknown as AffiliateAgentErrorHistoryReadClient,
        options.filters,
      ),
    );
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
};
const isMainModule = process.argv[1]?.endsWith("report-affiliate-agent-error-history.ts") === true;
if (isMainModule) {
  try {
    const options = parseAffiliateAgentErrorHistoryReportCliArgs(process.argv.slice(2));
    void runAffiliateAgentErrorHistoryReport(options).catch((error: unknown) => {
      console.error("[affiliate:agent-errors:report] failed", error);
      process.exitCode = 1;
    });
  } catch (error: unknown) {
    console.error("[affiliate:agent-errors:report] failed", error);
    process.exitCode = 1;
  }
}
