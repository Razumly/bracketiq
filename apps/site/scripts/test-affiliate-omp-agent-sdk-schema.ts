import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fromJsonSchema } from "@oh-my-pi/omptype/from-json-schema";
import { TERMINAL_TOOL_RESULT_ABORT_REASON } from "@oh-my-pi/pi-agent-core";
import type { AssistantMessage } from "@oh-my-pi/pi-ai";
import {
  AuthStorage,
  type AgentSession,
  type CustomTool,
  ModelRegistry,
  SessionManager,
  Settings,
  createAgentSession,
} from "@oh-my-pi/pi-coding-agent";
import { getBundledModel } from "@oh-my-pi/pi-catalog";
import { toolWireSchema } from "@oh-my-pi/pi-ai/utils/schema";
import { z } from "zod";
import {
  AFFILIATE_AGENT_ROLE_CONTRACTS,
  affiliateAgentClaimEnvelopeSchema,
  hashAffiliateAgentValue,
} from "../src/server/affiliateImports/agentGatewayContracts";
import {
  createAffiliateOmpGatewayTools,
  type AffiliateOmpToolResult,
} from "../src/server/affiliateImports/affiliateOmpGatewayTools";
import {
  enableAffiliateOmpExecuteCommandLenientArgValidation,
} from "./run-affiliate-omp-agent";
import type { AffiliateAgentCommandRejectionDiagnostic } from "../src/server/affiliateImports/affiliateAgentCommandDiagnostics";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`SDK_SCHEMA_DIAGNOSTIC_BYPASS: ${message}`);
}

const claimForProbe = () => {
  const role = "MAPPING_PRODUCER" as const;
  const roleContract = AFFILIATE_AGENT_ROLE_CONTRACTS[role];
  const manifest = { schemaVersion: 1 as const, entries: [] as const };
  return affiliateAgentClaimEnvelopeSchema.parse({
    schemaVersion: 1,
    jobId: "job-sdk-schema-probe",
    claimId: "claim-sdk-schema-probe",
    supplySourceId: "supply-sdk-schema-probe",
    claimGeneration: 1,
    lifecycleGeneration: 1,
    deploymentContractVersion: 1,
    deploymentContractHash: "a".repeat(64),
    supplyContractVersion: 1,
    supplyContractHash: "b".repeat(64),
    roleContractVersion: roleContract.version,
    roleContractHash: roleContract.hash,
    promptTemplateVersion: roleContract.promptTemplateVersion,
    promptTemplateHash: roleContract.promptTemplateHash,
    executionClass: "PRODUCTION_OMP",
    workerId: "worker-sdk-schema-probe",
    invocationId: "invocation-sdk-schema-probe",
    workspaceId: "workspace-sdk-schema-probe",
    claimedAt: "2026-09-07T12:00:00.000Z",
    expiresAt: "2026-09-07T12:05:00.000Z",
    evidenceManifest: { ...manifest, hash: hashAffiliateAgentValue(manifest) },
    permittedCommands: roleContract.permittedCommands,
    role,
    queue: "AFFILIATE_MAPPING",
    lane: "MAPPING_PRODUCTION",
    subject: {
      type: role,
      supplySourceId: "supply-sdk-schema-probe",
      mappingJobId: "mapping-sdk-schema-probe",
      listingKind: "EVENT",
      pass: 1,
    },
  });
};

const zeroUsage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

const modelForProbe = () => {
  const model = getBundledModel("openai-codex", "gpt-5.6-luna");
  if (!model || !model.input.includes("text") || model.supportsTools === false) {
    throw new Error("The bundled openai-codex/gpt-5.6-luna model is unavailable for the SDK probe.");
  }
  return model;
};

const run = async (): Promise<void> => {
  if (process.versions.bun !== "1.3.14") throw new Error("This probe requires pinned Bun 1.3.14.");

  const workspace = await mkdtemp(join(tmpdir(), "affiliate-omp-sdk-schema-"));
  let networkGuardCalls = 0;
  let authStorage: AuthStorage | undefined;
  let session: AgentSession | undefined;
  const originalFetch = globalThis.fetch;
  const networkGuard: typeof fetch = () => {
    networkGuardCalls += 1;
    throw new Error("SDK schema probe network access is forbidden.");
  };
  globalThis.fetch = networkGuard;
  try {
    const claim = claimForProbe();
    const model = { ...modelForProbe(), baseUrl: "" };
    const agentDir = join(workspace, ".omp", "agent");
    const settings = Settings.isolated({
      "advisor.enabled": false,
      "autolearn.enabled": false,
      "autolearn.autoContinue": false,
      "compaction.enabled": false,
      "memory.backend": "off",
      "retry.enabled": false,
      "title.refreshOnReplan": false,
    }, { storage: null });
    const createdAuthStorage = await AuthStorage.create(":memory:", { configValueResolver: async () => undefined });
    authStorage = createdAuthStorage;
    const modelRegistry = new ModelRegistry(createdAuthStorage, undefined, {
      settings,
      ignoreLocalModelConfig: true,
      cacheDbPath: ":memory:",
    });
    const gatewayCalls: unknown[] = [];
    const diagnostics: AffiliateAgentCommandRejectionDiagnostic[] = [];
    let providerGuardCalls = 0;
    let activeSession: AgentSession | undefined;
    const bridge = createAffiliateOmpGatewayTools({
      claim,
      token: "private-sdk-schema-probe-token",
      gateway: {
        async perform(operation) {
          gatewayCalls.push(operation);
          throw new Error("Gateway.perform must not receive malformed input.");
        },
      },
      onTerminal: () => {
        throw new Error("Malformed input must not submit a terminal result.");
      },
      onCommandRejection: (diagnostic) => {
        diagnostics.push(diagnostic);
        activeSession?.agent.abort(TERMINAL_TOOL_RESULT_ABORT_REASON);
      },
    });
    const customTools: CustomTool[] = bridge.definitions.map((definition) => ({
      name: definition.name,
      label: definition.name,
      description: definition.description,
      parameters: fromJsonSchema(z.toJSONSchema(definition.parameters)),
      strict: false,
      async execute(_toolCallId, params, _onUpdate, _context, signal): Promise<AffiliateOmpToolResult> {
        return bridge.execute(definition.name, params, signal);
      },
    }));
    const toolNames = customTools.map((tool) => tool.name);
    const sessionManager = SessionManager.inMemory(workspace);
    const created = await createAgentSession({
      cwd: workspace,
      agentDir,
      authStorage: createdAuthStorage,
      modelRegistry,
      model,
      rebindModelAfterDiscovery: false,
      settings,
      sessionManager,
      systemPrompt: ["SDK schema diagnostic probe."],
      providerSessionId: "sdk-schema-probe",
      customTools,
      toolNames,
      restrictToolNames: true,
      allowRestrictedCustomTools: true,
      disableExtensionDiscovery: true,
      extensions: [],
      additionalExtensionPaths: [],
      preloadedCustomToolPaths: [],
      skills: [],
      rules: [],
      contextFiles: [],
      promptTemplates: [],
      slashCommands: [],
      enableMCP: false,
      enableLsp: false,
      enableIrc: false,
      skipPythonPreflight: true,
      requireYieldTool: false,
      hasUI: false,
      interactivePrompts: false,
      autoApprove: true,
    });
    session = created.session;
    activeSession = session;

    const executeCommandTool = session.agent.state.tools.find((tool) => tool.name === "execute_command");
    assert(executeCommandTool !== undefined, "production tool activation did not expose execute_command");
    const advertisedSchemaBefore = JSON.stringify(toolWireSchema(executeCommandTool));
    enableAffiliateOmpExecuteCommandLenientArgValidation(session);
    const executeCommandToolAfter = session.agent.state.tools.find((tool) => tool.name === "execute_command");
    assert(executeCommandToolAfter === executeCommandTool, "helper did not mutate the final registered wrapper");
    assert(executeCommandToolAfter.lenientArgValidation === true, "execute_command wrapper is not lenient");
    assert(
      session.agent.state.tools
        .filter((tool) => tool.name !== "execute_command")
        .every((tool) => tool.lenientArgValidation !== true),
      "helper changed a non-execute_command tool",
    );
    assert(
      JSON.stringify(toolWireSchema(executeCommandToolAfter)) === advertisedSchemaBefore,
      "execute_command advertised schema changed",
    );

    const malformedAssistantTail: AssistantMessage = {
      role: "assistant",
      content: [{
        type: "toolCall",
        id: "call-sdk-schema-probe",
        name: "execute_command",
        arguments: {
          command: {
            type: "CAPTURE_CLAIM_URL",
            data: { urlRef: "", captureProfileRef: "profile-sdk-schema-probe" },
          },
        },
      }],
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage: zeroUsage,
      stopReason: "toolUse",
      timestamp: Date.now(),
    };
    session.agent.replaceMessages([malformedAssistantTail]);
    session.agent.streamFn = () => {
      providerGuardCalls += 1;
      throw new Error("Provider stream must not be reached by this probe.");
    };

    await session.agent.continue();
    assert(diagnostics.length === 1, `expected one local diagnostic, got ${diagnostics.length}`);
    assert(diagnostics[0]?.stage === "LOCAL_SCHEMA", "malformed input did not produce a LOCAL_SCHEMA diagnostic");
    assert(diagnostics[0]?.errorCode === "COMMAND_SCHEMA_INVALID", "diagnostic error code was not local schema invalid");
    assert(gatewayCalls.length === 0, `Gateway.perform was called ${gatewayCalls.length} time(s)`);
    assert(providerGuardCalls === 0, `provider guard was called ${providerGuardCalls} time(s)`);
    assert(networkGuardCalls === 0, `network guard was called ${networkGuardCalls} time(s)`);
    process.stdout.write("affiliate OMP SDK schema probe passed (no provider call).\n");
  } finally {
    try {
      await session?.dispose();
    } finally {
      try {
        authStorage?.close();
      } finally {
        try {
          await rm(workspace, { recursive: true, force: true });
        } finally {
          globalThis.fetch = originalFetch;
        }
      }
    }
  }
};

if (basename(process.argv[1] ?? "") === "test-affiliate-omp-agent-sdk-schema.ts") {
  run().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
