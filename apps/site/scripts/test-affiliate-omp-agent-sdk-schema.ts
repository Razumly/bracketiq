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
  enableAffiliateOmpBridgeArgValidation,
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
    executionBudget: "SINGLE_CLAIM",
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

const runScenario = async (toolName: "execute_command" | "check_result" | "submit_result"): Promise<void> => {
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
    let observedToolResult: AffiliateOmpToolResult | undefined;
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
        const result = await bridge.execute(definition.name, params, signal);
        observedToolResult = result;
        activeSession?.agent.abort(TERMINAL_TOOL_RESULT_ABORT_REASON);
        return result;
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

    const delegatedNames = ["execute_command", "check_result", "submit_result"];
    const advertisedSchemas = new Map(session.agent.state.tools.map(tool => [
      tool.name, JSON.stringify(toolWireSchema(tool)),
    ]));
    enableAffiliateOmpBridgeArgValidation(session);
    for (const name of delegatedNames) {
      const tool = session.agent.state.tools.find(tool => tool.name === name);
      assert(tool !== undefined && tool.lenientArgValidation === true, `bridge validation is not active for ${name}`);
      assert(JSON.stringify(toolWireSchema(tool)) === advertisedSchemas.get(name), `${name} advertised schema changed`);
    }
    assert(
      session.agent.state.tools.filter(tool => !delegatedNames.includes(tool.name))
        .every(tool => tool.lenientArgValidation !== true),
      "helper changed a tool outside the bridge validation set",
    );

    const privateKey = "private-sdk-draft-key";
    const privateValue = "private-sdk-draft-value";
    const toolArguments = toolName === "execute_command" ? {
      command: { type: "CAPTURE_CLAIM_URL", data: { urlRef: "", captureProfileRef: "profile-sdk-schema-probe" } },
    } : {
      disposition: privateValue, reasonCodes: ["SOURCE_UNSUPPORTED"], evidenceRefs: [],
      summary: "The source layout is unsupported.", payload: { incompatibilityCode: "UNSUPPORTED_LAYOUT" },
      [privateKey]: privateValue,
    };

    const malformedAssistantTail: AssistantMessage = {
      role: "assistant",
      content: [{
        type: "toolCall",
        id: "call-sdk-schema-probe",
        name: toolName,
        arguments: toolArguments,
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
    if (toolName === "execute_command") {
      assert(diagnostics.length === 1, `expected one local diagnostic, got ${diagnostics.length}`);
      assert(diagnostics[0]?.stage === "LOCAL_SCHEMA", "malformed input did not produce a LOCAL_SCHEMA diagnostic");
      assert(diagnostics[0]?.errorCode === "COMMAND_SCHEMA_INVALID", "diagnostic error code was not local schema invalid");
    } else {
      const content = observedToolResult?.content[0];
      assert(content?.type === "text", "SDK terminal arguments did not reach the bridge");
      const result = JSON.parse(content.text);
      assert(result.kind === "DRAFT_INVALID", "malformed draft did not return DRAFT_INVALID");
      assert(result.issues[0]?.code === "INVALID_VALUE" && result.issues[0]?.path?.[0] === "disposition", "unrepairable draft input was not identified");
      assert(!JSON.stringify(result).includes(privateKey) && !JSON.stringify(result).includes(privateValue), "draft diagnostics exposed input");
      assert(!bridge.isClosed && bridge.terminalFrame === null, "malformed draft closed the invocation");
    }
    assert(gatewayCalls.length === 0, `Gateway.perform was called ${gatewayCalls.length} time(s)`);
    assert(providerGuardCalls === 0, `provider guard was called ${providerGuardCalls} time(s)`);
    assert(networkGuardCalls === 0, `network guard was called ${networkGuardCalls} time(s)`);
    process.stdout.write(`affiliate OMP SDK ${toolName} schema probe passed (no provider call).\n`);
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

const run = async (): Promise<void> => {
  for (const toolName of ["execute_command", "check_result", "submit_result"] as const) {
    await runScenario(toolName);
  }
};

if (basename(process.argv[1] ?? "") === "test-affiliate-omp-agent-sdk-schema.ts") {
  run().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
