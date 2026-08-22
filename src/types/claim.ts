export type ClaimStatus = "verified" | "contradicted" | "unchecked";

export type ClaimTier = "deterministic" | "structural" | "llm";

export interface TranscriptTurn {
  uuid: string;
  timestamp: string;
  role: "user" | "assistant";
  /** Plain instruction text, present on user turns. */
  instructionText?: string;
  /** Tool calls made in this turn (assistant turns only). */
  toolCalls: ToolCall[];
  /** Final natural-language summary text, if this is the last assistant turn. */
  summaryText?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  /** Raw tool result content, matched up by tool_use_id. */
  result?: string;
  resultIsError?: boolean;
  timestamp: string;
  /** The agent's own reasoning text immediately preceding this call — its stated plan. */
  planText?: string;
}

export interface DiffHunk {
  file: string;
  startLine: number;
  endLine: number;
  content: string;
  /** The tool call (Edit/Write) that produced this hunk, if we can trace it. */
  producingToolCallId?: string;
  /** Set when this hunk came from walking session commits individually rather
   * than a single working-tree diff — lets an intermediate bad commit stay
   * visible even after a later commit fixes it (a squashed diff can't show that). */
  commitHash?: string;
  commitMessage?: string;
}

export interface Claim {
  id: string;
  file: string;
  startLine: number;
  endLine: number;
  /** What the transcript shows was asked, verbatim, with a turn reference. */
  instruction: string;
  instructionTurnId?: string;
  /** What the agent asserts about this hunk (from its final summary, or inferred). */
  assertion: string;
  /** The tool-call evidence that proves or disproves the assertion. */
  evidence: string | null;
  evidenceToolCallId?: string;
  status: ClaimStatus;
  tier: ClaimTier;
  /** true if this hunk has no traceable instruction at all (scope creep). */
  undisclosedScope: boolean;
  riskTier?: "high" | "medium" | "low";
  diff: string;
  /** Which commit this claim came from, when resolved via per-commit walking. */
  commitLabel?: string;
}

export interface ClaimGraphNode {
  id: string;
  kind: "instruction" | "hunk" | "evidence" | "action";
  label: string;
  claimId?: string;
  status?: ClaimStatus;
}

export interface ClaimGraphEdge {
  id: string;
  source: string;
  target: string;
  kind: "produced-by" | "asserts" | "verified-by" | "contradicts" | "sequence";
}

export interface ClaimGraph {
  nodes: ClaimGraphNode[];
  edges: ClaimGraphEdge[];
}

export interface AnalysisResult {
  sessionId: string;
  repoPath: string;
  score: number; // 0-100, ledger score
  claims: Claim[];
  graph: ClaimGraph;
  stats: {
    turns: number;
    toolCalls: number;
    hunks: number;
    tier1Resolved: number;
    tier2Resolved: number;
    tier3Resolved: number;
  };
}

export interface PipelineEvent {
  stage:
    | "parsing"
    | "diffing"
    | "tier1"
    | "tier2"
    | "tier3"
    | "graph"
    | "done"
    | "error";
  status: "started" | "progress" | "done";
  message: string;
  detail?: Record<string, unknown>;
}
