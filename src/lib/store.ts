import { EventEmitter } from "events";
import type { AnalysisResult, Claim } from "@/types/claim";

/**
 * Process-local state for the demo: one active analysis result, one event bus.
 * Fine for a single `next dev` instance — this is not meant to survive restarts.
 */
declare global {
  // eslint-disable-next-line no-var
  var __ifBus: EventEmitter | undefined;
  // eslint-disable-next-line no-var
  var __ifResult: AnalysisResult | null | undefined;
  // eslint-disable-next-line no-var
  var __ifCurrentLiveInstruction: string | null | undefined;
}

export const bus: EventEmitter = globalThis.__ifBus ?? new EventEmitter();
globalThis.__ifBus = bus;
bus.setMaxListeners(50);

export function getLatestResult(): AnalysisResult | null {
  return globalThis.__ifResult ?? null;
}

export function setLatestResult(result: AnalysisResult) {
  globalThis.__ifResult = result;
  bus.emit("result-updated", result);
}

export function updateClaim(claimId: string, patch: Partial<Claim>) {
  const result = getLatestResult();
  if (!result) return null;
  const idx = result.claims.findIndex((c) => c.id === claimId);
  if (idx === -1) return null;
  result.claims[idx] = { ...result.claims[idx], ...patch };
  const graphNode = result.graph.nodes.find((n) => n.claimId === claimId);
  if (graphNode && patch.status) graphNode.status = patch.status;
  result.score = recomputeScore(result.claims);
  bus.emit("claim-updated", { claimId, claim: result.claims[idx], score: result.score });
  return result.claims[idx];
}

/**
 * Called on a UserPromptSubmit hook — a new instruction node, so the *next* live
 * tool calls have a hub to attach to instead of floating disconnected in the graph.
 */
export function appendLiveInstruction(text: string) {
  const result = getLatestResult();
  if (!result) return;
  const nodeId = `instr:live:${Date.now()}`;
  result.graph.nodes.push({ id: nodeId, kind: "instruction", label: text.slice(0, 60) });
  globalThis.__ifCurrentLiveInstruction = nodeId;
  bus.emit("live-instruction", { nodeId });
}

export function appendLiveClaim(claim: Claim) {
  const result = getLatestResult();
  if (!result) return;
  result.claims.push(claim);
  const hunkNodeId = `hunk:${claim.id}`;
  result.graph.nodes.push({
    id: hunkNodeId,
    kind: "hunk",
    label: `${claim.file.split("/").pop()}:${claim.startLine}`,
    claimId: claim.id,
    status: claim.status,
  });
  const currentInstr = globalThis.__ifCurrentLiveInstruction;
  if (currentInstr) {
    result.graph.edges.push({
      id: `${currentInstr}->${hunkNodeId}`,
      source: currentInstr,
      target: hunkNodeId,
      kind: "produced-by",
    });
  }
  result.score = recomputeScore(result.claims);
  bus.emit("live-claim", { claim, score: result.score });
}

function recomputeScore(claims: Claim[]): number {
  if (claims.length === 0) return 100;
  const good = claims.filter((c) => c.status === "verified" && !c.undisclosedScope).length;
  return Math.round((good / claims.length) * 100);
}
