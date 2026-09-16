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
import type { AffiliateAgentClaimOperation, AffiliateAgentClaimOperationResult } from "../src/server/affiliateImports/agentGateway";
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

type ProbeScenario =
  | "execute_command"
  | "check_result"
  | "submit_result"
  | "read_artifact"
  | "unknown_tool"
  | "aborted_queued";

const runScenario = async (scenario: ProbeScenario): Promise<void> => {
  if (process.versions.bun !== "1.3.14") throw new Error("This probe requires pinned Bun 1.3.14.");

  const workspace = await mkdtemp(join(tmpdir(), "affiliate-omp-sdk-schema-"));
  let networkGuardCalls = 0;
  let authStorage: AuthStorage | undefined;
  let session: AgentSession | undefined;
    const boundaryRecordings: Promise<void>[] = [];
    let unsubscribeBoundaryEvents: (() => void) | undefined;
    let unsubscribeProbeAbort: (() => void) | undefined;
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
    const enteredCustomToolCalls = new Set<string>();
    const bridge = createAffiliateOmpGatewayTools({
      claim,
      token: "private-sdk-schema-probe-token",
      gateway: {
        async perform<T extends AffiliateAgentClaimOperation>(operation: T): Promise<AffiliateAgentClaimOperationResult<T>> {
          gatewayCalls.push(operation);
          if (operation.kind === "RECORD_ERROR") {
            return { kind: "AGENT_ERROR_RECORDED", eventId: "agent-error-event", replayed: false } as AffiliateAgentClaimOperationResult<T>;
          }
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
        enteredCustomToolCalls.add(_toolCallId);
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
    unsubscribeBoundaryEvents = session.subscribe(event => {
      if (event.type !== "tool_execution_end" || event.isError !== true) return;
      if (enteredCustomToolCalls.has(event.toolCallId)) return;
      const isKnownTool = toolNames.includes(event.toolName);
      const recording = bridge.recordBoundaryError({
        tool: isKnownTool ? event.toolName : "UNKNOWN",
        errorCode: isKnownTool ? "TOOL_ABORTED" : "TOOL_NOT_PERMITTED",
      }).catch(() => undefined);
      boundaryRecordings.push(recording);
    });
    if (scenario === "unknown_tool") {
      unsubscribeProbeAbort = session.subscribe(event => {
        if (event.type === "tool_execution_end" && event.isError === true && event.toolName === "unlisted_tool") {
          void session?.agent.abort(TERMINAL_TOOL_RESULT_ABORT_REASON);
        }
      });
    } else if (scenario === "aborted_queued") {
      const beforeToolCall = session.agent.beforeToolCall;
      session.agent.beforeToolCall = async (context, signal) => {
        const outcome = await beforeToolCall?.(context, signal);
        session?.agent.abort(TERMINAL_TOOL_RESULT_ABORT_REASON);
        return outcome;
      };
    }

    const delegatedNames = ["read_artifact", "execute_command", "check_result", "submit_result"];
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
    const toolArguments = scenario === "execute_command" ? {
      command: { type: "CAPTURE_CLAIM_URL", data: { urlRef: "", captureProfileRef: "profile-sdk-schema-probe" } },
    } : scenario === "read_artifact" ? {
      evidenceRef: "", [privateKey]: privateValue,
    } : scenario === "unknown_tool" ? {
      [privateKey]: privateValue,
    } : {
      disposition: privateValue, reasonCodes: ["SOURCE_UNSUPPORTED"], evidenceRefs: [],
      summary: "The source layout is unsupported.", payload: { incompatibilityCode: "UNSUPPORTED_LAYOUT" },
      [privateKey]: privateValue,
    };
    const terminalArguments = {
      disposition: "CONTRACT_GAP",
      reasonCodes: ["CONTRACT_REQUIREMENT_MISSING"],
      evidenceRefs: [],
      summary: "The probe terminal result is bounded.",
      payload: { contractArea: "MAPPING_EVIDENCE", requestedChange: "Probe terminal result." },
    };
    const assistantContent = scenario === "aborted_queued" ? [
      { type: "toolCall" as const, id: "call-sdk-schema-probe-terminal", name: "submit_result", arguments: terminalArguments },
      { type: "toolCall" as const, id: "call-sdk-schema-probe-skipped", name: "read_artifact", arguments: { evidenceRef: "missing" } },
    ] : [{
      type: "toolCall" as const,
      id: "call-sdk-schema-probe",
      name: scenario === "unknown_tool" ? "unlisted_tool" : scenario,
      arguments: toolArguments,
    }];
    const malformedAssistantTail: AssistantMessage = {
      role: "assistant",
      content: assistantContent,
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

    try {
      await session.agent.continue();
    } catch (error) {
      if (scenario !== "unknown_tool" && scenario !== "aborted_queued") throw error;
    }
    await Promise.allSettled(boundaryRecordings);
    const recordingOperations = gatewayCalls
      .filter(operation => (operation as AffiliateAgentClaimOperation).kind === "RECORD_ERROR")
      .map(operation => operation as Extract<AffiliateAgentClaimOperation, { kind: "RECORD_ERROR" }>);
    const recordedObservations = JSON.stringify(recordingOperations.map(operation => operation.observation));
    assert(!recordedObservations.includes(privateKey) && !recordedObservations.includes(privateValue), "durable observations exposed input");
    const expectedRecordCount = scenario === "aborted_queued" ? 2 : 1;
    assert(recordingOperations.length === expectedRecordCount, `expected ${expectedRecordCount} recorded error(s), got ${recordingOperations.length}`);
    if (scenario === "execute_command") {
      assert(diagnostics.length === 1, `expected one local diagnostic, got ${diagnostics.length}`);
      assert(diagnostics[0]?.stage === "LOCAL_SCHEMA", "malformed input did not produce a LOCAL_SCHEMA diagnostic");
      assert(diagnostics[0]?.errorCode === "COMMAND_SCHEMA_INVALID", "diagnostic error code was not local schema invalid");
    } else if (scenario === "read_artifact") {
      const content = observedToolResult?.content[0];
      assert(content?.type === "text", "malformed artifact arguments did not reach the bridge");
      const result = JSON.parse(content.text);
      assert(result.issues?.[0]?.path?.[0] === "evidenceRef", "malformed artifact input was not identified");
      assert(recordingOperations.some(operation => (
        operation.observation.tool === "read_artifact"
        && operation.observation.errorCode === "ARTIFACT_VIEW_INVALID"
      )), "malformed artifact input was not durably recorded");
      assert(!bridge.isClosed && bridge.terminalFrame === null, "malformed artifact input closed the invocation");
    } else if (scenario === "unknown_tool") {
      assert(observedToolResult === undefined, "unknown tool unexpectedly entered the custom execute callback");
      assert(!enteredCustomToolCalls.has("call-sdk-schema-probe"), "unknown tool entered the custom execute callback");
      const recording = recordingOperations.find(operation => operation.observation.errorCode === "TOOL_NOT_PERMITTED");
      assert(recording?.observation.tool === "UNKNOWN", "unknown tool boundary error was not durably redacted");
      assert(!bridge.isClosed && bridge.terminalFrame === null, "unknown tool boundary error closed the invocation");
    } else if (scenario === "aborted_queued") {
      assert(observedToolResult === undefined, "aborted queued calls unexpectedly entered custom execute");
      assert(!enteredCustomToolCalls.has("call-sdk-schema-probe-terminal"), "aborted first call entered custom execute");
      assert(!enteredCustomToolCalls.has("call-sdk-schema-probe-skipped"), "aborted queued call entered custom execute");
      assert(recordingOperations.some(operation => (
        operation.observation.tool === "read_artifact"
        && operation.observation.errorCode === "TOOL_ABORTED"
      )), "aborted queued call was not durably recorded");
      assert(!bridge.isClosed && bridge.terminalFrame === null, "aborted queued calls closed the invocation");
    } else {
      const content = observedToolResult?.content[0];
      assert(content?.type === "text", "SDK terminal arguments did not reach the bridge");
      const result = JSON.parse(content.text);
      assert(result.kind === "DRAFT_INVALID", "malformed draft did not return DRAFT_INVALID");
      assert(result.issues[0]?.code === "INVALID_VALUE" && result.issues[0]?.path?.[0] === "disposition", "unrepairable draft input was not identified");
      assert(!JSON.stringify(result).includes(privateKey) && !JSON.stringify(result).includes(privateValue), "draft diagnostics exposed input");
      assert(!bridge.isClosed && bridge.terminalFrame === null, "malformed draft closed the invocation");
    }
    const gatewayEffects = gatewayCalls.filter((operation) => (
      (operation as AffiliateAgentClaimOperation).kind !== "RECORD_ERROR"
    ));
    assert(gatewayEffects.length === 0, `Gateway.perform received ${gatewayEffects.length} malformed operation(s)`);
    assert(providerGuardCalls === 0, `provider guard was called ${providerGuardCalls} time(s)`);
    assert(networkGuardCalls === 0, `network guard was called ${networkGuardCalls} time(s)`);
    process.stdout.write(`affiliate OMP SDK ${scenario} schema probe passed (no provider call).\n`);
  } finally {
    unsubscribeProbeAbort?.();
    unsubscribeBoundaryEvents?.();
    await Promise.allSettled(boundaryRecordings);
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
  for (const scenario of [
    "execute_command",
    "check_result",
    "submit_result",
    "read_artifact",
    "unknown_tool",
    "aborted_queued",
  ] as const) {
    await runScenario(scenario);
  }
};

if (basename(process.argv[1] ?? "") === "test-affiliate-omp-agent-sdk-schema.ts") {
  run().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
