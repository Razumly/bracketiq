import type {
  AffiliateAgentTargetKind,
  AffiliateSourceDraft,
  ModelRevision,
} from './agentContracts';
import { affiliateSourceDraftV2Schema } from './agentContracts';
import {
  affiliateHumanSportResolutionSchema,
  type AffiliateHumanSportResolution,
} from './affiliateSportDetermination';
import {
  affiliateSportsCatalogSnapshotSchema,
  type AffiliateSportsCatalogSnapshot,
} from './affiliateSportsCatalog';
import { z } from 'zod';

export type AffiliateMappingJobArtifact = {
  artifactId?: string;
  kind: string;
  sha256: string;
  pageUrl: string;
  byteLength?: number;
  intakeId?: string;
  runId?: string;
};

type AffiliateMappingJobContextV1 = {
  jobId: string;
  intakeId: string;
  sourceKey: string;
  runId: string;
  evidenceRunIds?: string[];
  policyDisposition: 'ALLOWED' | 'BLOCKED' | 'NEEDS_REVIEW';
  targetKindHints: AffiliateAgentTargetKind[];
  artifacts: AffiliateMappingJobArtifact[];
  evidenceExcerpts?: Array<{
    kind: string;
    sha256: string;
    pageUrl: string;
    content: string;
    truncated: boolean;
  }>;
  repositoryExcerpts?: Array<{
    path: string;
    content: string;
    truncated: boolean;
  }>;
  instructionsRevision: string;
};

export type AffiliateMappingJobContextV2 = {
  contextContractVersion: 2;
  jobId: string;
  intakeId: string;
  sourceKey: string;
  workerId: string;
  claimedAt: string;
  runId: string;
  evidenceRunIds: [string];
  sportsCatalog: AffiliateSportsCatalogSnapshot;
  humanSportResolution?: AffiliateHumanSportResolution;
  policyDisposition: 'ALLOWED' | 'BLOCKED' | 'NEEDS_REVIEW';
  targetKindHints: AffiliateAgentTargetKind[];
  artifacts: Array<AffiliateMappingJobArtifact & {
    artifactId: string;
    intakeId: string;
    runId: string;
  }>;
  evidenceExcerpts?: Array<{
    kind: string;
    sha256: string;
    pageUrl: string;
    content: string;
    truncated: boolean;
  }>;
  repositoryExcerpts?: Array<{
    path: string;
    content: string;
    truncated: boolean;
  }>;
  instructionsRevision: string;
};

export type AffiliateMappingJobContext = AffiliateMappingJobContextV1 | AffiliateMappingJobContextV2;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i, 'Expected a SHA-256 hash.');
const nonEmptyStringSchema = z.string().trim().min(1);
const artifactSchemaV2 = z.object({
  artifactId: nonEmptyStringSchema,
  kind: nonEmptyStringSchema,
  sha256: sha256Schema,
  pageUrl: z.string().url(),
  byteLength: z.number().int().nonnegative().optional(),
  intakeId: nonEmptyStringSchema,
  runId: nonEmptyStringSchema,
}).strict();
const excerptSchema = z.object({
  kind: nonEmptyStringSchema,
  sha256: sha256Schema,
  pageUrl: z.string().url(),
  content: z.string(),
  truncated: z.boolean(),
}).strict();

export const affiliateMappingJobContextV2Schema = z.object({
  contextContractVersion: z.literal(2),
  jobId: nonEmptyStringSchema,
  intakeId: nonEmptyStringSchema,
  sourceKey: nonEmptyStringSchema,
  workerId: nonEmptyStringSchema,
  claimedAt: z.string().datetime({ offset: true }),
  runId: nonEmptyStringSchema,
  evidenceRunIds: z.tuple([nonEmptyStringSchema]),
  sportsCatalog: affiliateSportsCatalogSnapshotSchema,
  humanSportResolution: affiliateHumanSportResolutionSchema.optional(),
  policyDisposition: z.enum(['ALLOWED', 'BLOCKED', 'NEEDS_REVIEW']),
  targetKindHints: z.array(z.enum(['EVENT', 'RENTAL', 'CLUB'])),
  artifacts: z.array(artifactSchemaV2).min(1),
  evidenceExcerpts: z.array(excerptSchema).optional(),
  repositoryExcerpts: z.array(z.object({
    path: nonEmptyStringSchema,
    content: z.string(),
    truncated: z.boolean(),
  }).strict()).optional(),
  instructionsRevision: nonEmptyStringSchema,
}).strict().superRefine((context, refinement) => {
  if (context.runId !== context.evidenceRunIds[0]) {
    refinement.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['evidenceRunIds'],
      message: 'A v2 context must carry exactly one evidence run matching runId.',
    });
  }
  for (const [index, artifact] of context.artifacts.entries()) {
    if (artifact.intakeId !== context.intakeId || artifact.runId !== context.runId) {
      refinement.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['artifacts', index],
        message: 'Every artifact must belong to the context intake and evidence run.',
      });
    }
  }
});

export const isAffiliateMappingJobContextV2 = (
  context: AffiliateMappingJobContext,
): context is AffiliateMappingJobContextV2 => (
  'contextContractVersion' in context && context.contextContractVersion === 2
);

export const assertAffiliateMappingJobContextV2 = (
  context: unknown,
): AffiliateMappingJobContextV2 => affiliateMappingJobContextV2Schema.parse(context);

export interface AffiliateMappingModelClient {
  modelRevision(): Promise<ModelRevision>;
  createDraft(input: AffiliateMappingJobContext): Promise<AffiliateSourceDraft | unknown>;
}

export class FixtureAffiliateMappingModelClient implements AffiliateMappingModelClient {
  constructor(
    private readonly revision: ModelRevision,
    private readonly draftsByJobId: ReadonlyMap<string, unknown>,
  ) {}

  async modelRevision(): Promise<ModelRevision> {
    return this.revision;
  }

  async createDraft(input: AffiliateMappingJobContext): Promise<unknown> {
    if (!this.draftsByJobId.has(input.jobId)) {
      throw new Error(`Fixture draft not found for job ${input.jobId}.`);
    }
    return this.draftsByJobId.get(input.jobId);
  }
}

type OpenAICompatibleChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

export const AFFILIATE_MAPPING_SYSTEM_PROMPT = [
  'You are the BracketIQ affiliate source mapping worker.',
  'The supplied contextContractVersion must be 2. Return exactly one JSON AffiliateSourceDraft schema-version-2 object.',
  'Use only supplied artifact and repository excerpts; the sportsCatalog in the context is the only catalog authority.',
  'Record exact source terminology and one evidence-backed sportDetermination per conclusion, with artifact citations.',
  'A resolved canonical sport must exactly match a name in the supplied sportsCatalog; never use compiled defaults or discovery sportHints.',
  'The only supported target kinds are EVENT, RENTAL, and CLUB.',
  'Never create a TEAM mapping or TEAM candidate; represent an organization or its programs as CLUB or EVENT as supported by evidence.',
  'Never invent dates, action URLs, locations, prices, divisions, tags, or logos.',
  'Every executable candidate sportName and every value in sportNames must exactly match a current sportsCatalog name, including capitalization and surface.',
  'Cheerleading, Dance, Running, Swimming, Track and Field, and Golf are blacklisted. Never emit them as executable sport values; preserve the source label in evidence and use a BLACKLISTED determination.',
  'A generic Soccer or Volleyball label without usable surface evidence is VARIANT_UNRESOLVED; do not guess Indoor, Grass, or Beach.',
  'An evidenced activity without an exact catalog entry is UNSUPPORTED. An exact blacklisted activity is BLACKLISTED. Refusal determinations still require stored first-party citations.',
  'For a regular or weekly event containing several source-backed sports, set sportNames to the complete canonical list and record all resolved names.',
  'For BLOCKED policy return BLOCKED with no mapping. For missing evidence return INSUFFICIENT_EVIDENCE with no mapping.',
  'Use official source action URLs, never BracketIQ URLs.',
  'A real organization logo must be an official stored asset, an official screenshot crop, missing, or manual review; never generate one.',
  'Prefer GENERIC_MAPPING or MANUAL_CANDIDATES. Request CUSTOM_EXTRACTOR_REQUIRED without code when the mapping contract is insufficient.',
].join('\n');

export class OpenAICompatibleAffiliateMappingModelClient implements AffiliateMappingModelClient {
  private readonly endpoint: string;
  private readonly bearerToken: string;
  private readonly model: string;
  private readonly revision: ModelRevision;
  private readonly timeoutMs: number;

  constructor(input: {
    endpoint: string;
    bearerToken: string;
    model: string;
    revision: ModelRevision;
    timeoutMs?: number;
  }) {
    const endpoint = new URL(input.endpoint);
    if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) {
      throw new Error('Model endpoint must be an HTTP(S) URL without embedded credentials.');
    }
    if (!input.bearerToken.trim()) throw new Error('Model endpoint bearer token is required.');
    if (!input.model.trim()) throw new Error('Model endpoint model id is required.');
    this.endpoint = endpoint.toString().replace(/\/$/, '');
    this.bearerToken = input.bearerToken;
    this.model = input.model;
    this.revision = input.revision;
    this.timeoutMs = input.timeoutMs ?? 20 * 60 * 1000;
  }

  async modelRevision(): Promise<ModelRevision> {
    return this.revision;
  }

  async createDraft(input: AffiliateMappingJobContext): Promise<AffiliateSourceDraft> {
    const context = assertAffiliateMappingJobContextV2(input);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.endpoint}/v1/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${this.bearerToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          max_tokens: 4096,
          messages: [
            { role: 'system', content: AFFILIATE_MAPPING_SYSTEM_PROMPT },
            { role: 'user', content: JSON.stringify(context) },
          ],
          response_format: {
            type: 'json_schema',
            schema: z.toJSONSchema(affiliateSourceDraftV2Schema),
          },
        }),
      });
      if (!response.ok) throw new Error(`Model endpoint returned HTTP ${response.status}.`);
      const body = await response.json() as OpenAICompatibleChatResponse;
      const content = body.choices?.[0]?.message?.content;
      if (!content) throw new Error('Model endpoint returned no draft content.');
      let value: unknown;
      try {
        value = JSON.parse(content);
      } catch {
        throw new Error('Model endpoint returned non-JSON draft content.');
      }
      return affiliateSourceDraftV2Schema.parse(value);
    } finally {
      clearTimeout(timeout);
    }
  }
}
