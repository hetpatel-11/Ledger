import { NextRequest } from "next/server";
import { appendLiveClaim } from "@/lib/store";
import type { Claim } from "@/types/claim";

/**
 * Called by a Claude Code PostToolUse hook on every tool call, so the dashboard
 * updates while the agent is still working — not after the session ends.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const toolName: string = body.tool_name ?? body.toolName ?? "unknown";
  const input = body.tool_input ?? body.input ?? {};
  const toolResponse = body.tool_response ?? body.result;

  if (!["Edit", "Write", "NotebookEdit"].includes(toolName)) {
    return Response.json({ ok: true, ignored: true });
  }

  const file: string = input.file_path ?? "unknown file";
  const claim: Claim = {
    id: `live:${file}:${Date.now()}`,
    file,
    startLine: 0,
    endLine: 0,
    instruction: body.last_instruction ?? "(live session, instruction not yet resolved)",
    assertion: `Agent edited ${file} via ${toolName}`,
    evidence: toolResponse ? String(toolResponse).slice(0, 300) : null,
    status: "unchecked",
    tier: "structural",
    undisclosedScope: false,
    diff: JSON.stringify(input).slice(0, 500),
  };

  appendLiveClaim(claim);
  return Response.json({ ok: true, claimId: claim.id });
}
