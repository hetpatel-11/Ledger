import Anthropic from "@anthropic-ai/sdk";
import type {
  Claim,
  ClaimGraph,
  ClaimGraphNode,
  ClaimGraphEdge,
  DiffHunk,
  TranscriptTurn,
  AnalysisResult,
  PipelineEvent,
} from "@/types/claim";
import { diffHunks } from "./gitTools";
import { bashCalls, fileMutations, lastAssistantSummary } from "./parseTranscript";

const IDENTIFIER_RE = /\b[a-zA-Z_][a-zA-Z0-9_]{4,}\b/g;
const STOPWORDS = new Set([
  "which", "there", "these", "those", "would", "could", "should", "about",
  "function", "return", "const", "export", "import", "default", "async",
  "await", "value", "params", "props", "state", "index", "array", "object",
  "string", "number", "boolean", "false", "true", "null", "undefined",
  "instruction", "assistant", "message", "content", "please", "actually",
]);

function extractIdentifiers(text: string): Set<string> {
  const raw = (text.match(IDENTIFIER_RE) ?? []).map((s) => s.toLowerCase());
  return new Set(raw.filter((w) => !STOPWORDS.has(w)));
}

function basenameOf(file: string): string {
  return file.split("/").pop() ?? file;
}

interface Tier1Result {
  status: "verified" | "contradicted" | null; // null = inconclusive, fall through
  evidence: string | null;
  evidenceToolCallId?: string;
}

/** Deterministic check: did a real Bash test/verification call, after this hunk's edit, pass or fail? */
function tier1Check(hunk: DiffHunk, turns: TranscriptTurn[]): Tier1Result {
  const mutations = fileMutations(turns);
  const producingCall = mutations.find((tc) => {
    const path = (tc.input?.file_path as string) ?? "";
    return path.endsWith(hunk.file) || hunk.file.endsWith(path);
  });
  if (producingCall) hunk.producingToolCallId = producingCall.id;

  const bash = bashCalls(turns);
  const TEST_CMD_RE = /\b(npm|npx|yarn|pnpm)\s+(run\s+)?test\b|\b(jest|vitest|pytest|go test|tsc\s+--noEmit)\b/;
  const base = basenameOf(hunk.file).toLowerCase();
  const relevant = bash.filter((tc) => {
    const cmd = String(tc.input?.command ?? "").toLowerCase();
    return TEST_CMD_RE.test(cmd) || (base.length > 4 && new RegExp(`\\b${base}\\b`).test(cmd));
  });
  if (relevant.length === 0) return { status: null, evidence: null };

  const last = relevant[relevant.length - 1];
  if (last.resultIsError) {
    return {
      status: "contradicted",
      evidence: `Bash \`${last.input.command}\` failed: ${(last.result ?? "").slice(0, 300)}`,
      evidenceToolCallId: last.id,
    };
  }
  return {
    status: "verified",
    evidence: `Bash \`${last.input.command}\` ran and returned success: ${(last.result ?? "").slice(0, 300)}`,
    evidenceToolCallId: last.id,
  };
}

/**
 * Structural check: does any instruction, OR the agent's own stated plan for the tool
 * call that produced this hunk, literally name this file/identifier? A literal match is
 * high-confidence evidence FOR coverage. Absence of a match proves nothing on its own —
 * vague instructions legitimately produce untraced-but-fine changes — so callers must
 * route the "not traceable" case to an LLM judgment, never flag it directly.
 */
function tier2Check(
  hunk: DiffHunk,
  turns: TranscriptTurn[]
): {
  traceable: boolean;
  instruction: string;
  instructionTurnId?: string;
  planText?: string;
  planTraceable: boolean;
} {
  const hunkIdentifiers = extractIdentifiers(hunk.content);
  const base = basenameOf(hunk.file).toLowerCase();
  const userTurns = turns.filter((t) => t.role === "user" && t.instructionText);

  let instructionMatch: { text: string; turnId: string } | null = null;
  for (const t of userTurns) {
    const text = (t.instructionText ?? "").toLowerCase();
    const instrIdentifiers = extractIdentifiers(text);
    const hit =
      text.includes(base) || [...hunkIdentifiers].some((id) => instrIdentifiers.has(id));
    if (hit) {
      instructionMatch = { text: t.instructionText!, turnId: t.uuid };
      break;
    }
  }

  // Plan check: does the agent's own stated reasoning right before this edit mention it?
  const producingCall = hunk.producingToolCallId
    ? turns.flatMap((t) => t.toolCalls).find((tc) => tc.id === hunk.producingToolCallId)
    : undefined;
  const planText = producingCall?.planText;
  let planTraceable = false;
  if (planText) {
    const planLower = planText.toLowerCase();
    const planIdentifiers = extractIdentifiers(planLower);
    planTraceable =
      planLower.includes(base) || [...hunkIdentifiers].some((id) => planIdentifiers.has(id));
  }

  const fallback = userTurns[userTurns.length - 1]?.instructionText ?? "(no instruction found)";
  return {
    traceable: !!instructionMatch,
    instruction: instructionMatch?.text ?? fallback,
    instructionTurnId: instructionMatch?.turnId,
    planText,
    planTraceable,
  };
}

interface Tier3Result {
  status: "verified" | "contradicted" | "unchecked";
  assertion: string;
  evidence: string | null;
  undisclosedScope: boolean;
  planContradiction: boolean;
  riskTier: "high" | "medium" | "low";
}

async function tier3Check(
  hunk: DiffHunk,
  instruction: string,
  planText: string | undefined,
  summary: string,
  anthropic: Anthropic
): Promise<Tier3Result> {
  const risky = /(auth|secret|token|permission|credential|password|env|network|fetch|http|dependency|package\.json)/i.test(
    hunk.file + hunk.content
  );
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 400,
    messages: [
      {
        role: "user",
        content: `You are auditing whether a code change is a reasonable exercise of the latitude an instruction granted, and whether the agent's own actions matched its own stated plan. Judge latitude honestly: a vague instruction ("build me X") grants wide latitude for reasonable implementation choices; a narrow instruction ("only change the timeout in config.py") grants almost none. Do not flag a hunk just because it wasn't literally named — only flag it if no reasonable reading of the instruction would cover it, or if it clearly contradicts what the agent itself said it would do.

Instruction (most relevant found via search, may be vague): """${instruction}"""

Agent's own stated plan immediately before making this exact change (may be empty): """${planText ?? "(no plan text captured for this call)"}"""

Agent's final summary for the whole session: """${summary.slice(0, 2000)}"""

Diff hunk in ${hunk.file} (lines ${hunk.startLine}-${hunk.endLine}):
"""${hunk.content}"""

Respond with strict JSON only, no prose, matching this shape:
{"status": "verified" | "contradicted" | "unchecked", "assertion": "<one sentence: what this hunk does, and whether it's covered by the instruction's latitude>", "evidence": "<one sentence citing what supports or contradicts it, or null>", "undisclosedScope": true|false, "planContradiction": true|false}`,
      },
    ],
  });
  const text = msg.content.find((c) => c.type === "text")?.text ?? "{}";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  let parsed: Partial<Tier3Result> = {};
  try {
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  } catch {
    parsed = {};
  }
  return {
    status: parsed.status ?? "unchecked",
    assertion: parsed.assertion ?? "(no assertion found for this hunk)",
    evidence: parsed.evidence ?? null,
    undisclosedScope: parsed.undisclosedScope ?? false,
    planContradiction: parsed.planContradiction ?? false,
    riskTier: risky ? "high" : "medium",
  };
}

export async function* runPipeline(
  repoPath: string,
  turns: TranscriptTurn[],
  sessionId: string
): AsyncGenerator<PipelineEvent, AnalysisResult> {
  yield {
    stage: "parsing",
    status: "done",
    message: `Parsed transcript: ${turns.length} turns, ${turns.reduce(
      (n, t) => n + t.toolCalls.length,
      0
    )} tool calls`,
  };

  const hunks = diffHunks(repoPath);
  yield {
    stage: "diffing",
    status: "done",
    message: `Computed git diff: ${new Set(hunks.map((h) => h.file)).size} files, ${hunks.length} hunks`,
  };

  const summary = lastAssistantSummary(turns);
  const claims: Claim[] = [];
  let tier1Resolved = 0;
  let tier2Resolved = 0;
  const tier3Queue: {
    hunk: DiffHunk;
    instruction: string;
    instructionTurnId?: string;
    planText?: string;
  }[] = [];

  for (const hunk of hunks) {
    const t1 = tier1Check(hunk, turns);
    const t2 = tier2Check(hunk, turns);

    if (t1.status !== null) {
      // Execution evidence exists (a real test ran) — that's a hard fact regardless of
      // instruction latitude, so this resolves at tier 1 without needing an LLM opinion.
      tier1Resolved += 1;
      claims.push({
        id: `${hunk.file}:${hunk.startLine}`,
        file: hunk.file,
        startLine: hunk.startLine,
        endLine: hunk.endLine,
        instruction: t2.instruction,
        instructionTurnId: t2.instructionTurnId,
        assertion: t1.status === "verified" ? "Change was tested and passed." : "Change was tested and failed.",
        evidence: t1.evidence,
        evidenceToolCallId: t1.evidenceToolCallId,
        status: t1.status,
        tier: "deterministic",
        undisclosedScope: false,
        riskTier: "low",
        diff: hunk.content,
      });
      continue;
    }

    if (t2.traceable || t2.planTraceable) {
      // A literal match (instruction or the agent's own plan text names this file/symbol)
      // is high-confidence evidence FOR coverage — resolves cheaply, no LLM needed.
      tier2Resolved += 1;
      claims.push({
        id: `${hunk.file}:${hunk.startLine}`,
        file: hunk.file,
        startLine: hunk.startLine,
        endLine: hunk.endLine,
        instruction: t2.instruction,
        instructionTurnId: t2.instructionTurnId,
        assertion: t2.traceable
          ? "This change is explicitly named in an instruction."
          : "This change matches the agent's own stated plan for this edit.",
        evidence: t2.planText ? `Agent's stated plan: "${t2.planText.slice(0, 200)}"` : null,
        status: "verified",
        tier: "structural",
        undisclosedScope: false,
        riskTier: "low",
        diff: hunk.content,
      });
      continue;
    }

    // No literal match either way — that proves nothing on its own for a vague
    // instruction, so this MUST go to an LLM judgment call, never a direct flag.
    tier3Queue.push({
      hunk,
      instruction: t2.instruction,
      instructionTurnId: t2.instructionTurnId,
      planText: t2.planText,
    });
  }

  yield {
    stage: "tier1",
    status: "done",
    message: `Tier 1 (deterministic) resolved ${tier1Resolved}/${hunks.length} hunks`,
    detail: { resolved: tier1Resolved, total: hunks.length },
  };
  yield {
    stage: "tier2",
    status: "done",
    message: `Tier 2 (structural match) resolved ${tier2Resolved}/${hunks.length} hunks`,
    detail: { resolved: tier2Resolved, total: hunks.length },
  };

  let tier3Resolved = 0;
  if (tier3Queue.length > 0 && process.env.ANTHROPIC_API_KEY) {
    const anthropic = new Anthropic();
    for (const item of tier3Queue) {
      yield {
        stage: "tier3",
        status: "progress",
        message: `Checking ${item.hunk.file}:${item.hunk.startLine} (${tier3Resolved + 1}/${tier3Queue.length})...`,
      };
      const result = await tier3Check(item.hunk, item.instruction, item.planText, summary, anthropic);
      tier3Resolved += 1;
      claims.push({
        id: `${item.hunk.file}:${item.hunk.startLine}`,
        file: item.hunk.file,
        startLine: item.hunk.startLine,
        endLine: item.hunk.endLine,
        instruction: item.instruction,
        instructionTurnId: item.instructionTurnId,
        assertion: result.assertion,
        evidence: result.evidence,
        status: result.planContradiction ? "contradicted" : result.status,
        tier: "llm",
        undisclosedScope: result.undisclosedScope,
        riskTier: result.riskTier,
        diff: item.hunk.content,
      });
    }
  } else {
    // no API key or nothing queued — mark remaining as unchecked without guessing
    for (const item of tier3Queue) {
      claims.push({
        id: `${item.hunk.file}:${item.hunk.startLine}`,
        file: item.hunk.file,
        startLine: item.hunk.startLine,
        endLine: item.hunk.endLine,
        instruction: item.instruction,
        instructionTurnId: item.instructionTurnId,
        assertion: "Not yet checked against the agent's claims.",
        evidence: null,
        status: "unchecked",
        tier: "llm",
        undisclosedScope: false,
        riskTier: "medium",
        diff: item.hunk.content,
      });
    }
  }

  yield {
    stage: "tier3",
    status: "done",
    message: `Tier 3 (LLM fallback) resolved ${tier3Resolved}/${tier3Queue.length} hunks`,
    detail: { resolved: tier3Resolved, total: tier3Queue.length },
  };

  const graph = buildGraph(claims);
  yield {
    stage: "graph",
    status: "done",
    message: `Built claim graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges`,
  };

  const score = computeScore(claims);
  const result: AnalysisResult = {
    sessionId,
    repoPath,
    score,
    claims,
    graph,
    stats: {
      turns: turns.length,
      toolCalls: turns.reduce((n, t) => n + t.toolCalls.length, 0),
      hunks: hunks.length,
      tier1Resolved,
      tier2Resolved,
      tier3Resolved,
    },
  };

  yield { stage: "done", status: "done", message: `Instruction-Fidelity Score: ${score}%` };
  return result;
}

function computeScore(claims: Claim[]): number {
  if (claims.length === 0) return 100;
  const good = claims.filter((c) => c.status === "verified" && !c.undisclosedScope).length;
  return Math.round((good / claims.length) * 100);
}

function buildGraph(claims: Claim[]): ClaimGraph {
  const nodes: ClaimGraphNode[] = [];
  const edges: ClaimGraphEdge[] = [];
  const seenInstructions = new Map<string, string>();

  for (const claim of claims) {
    const hunkNodeId = `hunk:${claim.id}`;
    nodes.push({
      id: hunkNodeId,
      kind: "hunk",
      label: `${basenameOf(claim.file)}:${claim.startLine}`,
      claimId: claim.id,
      status: claim.status,
    });

    const instrKey = claim.instructionTurnId ?? claim.instruction.slice(0, 40);
    let instrNodeId = seenInstructions.get(instrKey);
    if (!instrNodeId) {
      instrNodeId = `instr:${instrKey}`;
      seenInstructions.set(instrKey, instrNodeId);
      nodes.push({
        id: instrNodeId,
        kind: "instruction",
        label: claim.instruction.slice(0, 60),
      });
    }
    edges.push({
      id: `${instrNodeId}->${hunkNodeId}`,
      source: instrNodeId,
      target: hunkNodeId,
      kind: "produced-by",
    });

    if (claim.evidence) {
      const evNodeId = `ev:${claim.id}`;
      nodes.push({
        id: evNodeId,
        kind: "evidence",
        label: claim.evidence.slice(0, 60),
        status: claim.status,
      });
      edges.push({
        id: `${hunkNodeId}->${evNodeId}`,
        source: hunkNodeId,
        target: evNodeId,
        kind: claim.status === "contradicted" ? "contradicts" : "verified-by",
      });
    }
  }

  return { nodes, edges };
}
