import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getLatestResult, updateClaim } from "@/lib/store";

export async function POST(req: NextRequest) {
  const { claimId, accept } = await req.json();
  const result = getLatestResult();
  if (!result) return Response.json({ error: "no session loaded" }, { status: 404 });
  const claim = result.claims.find((c) => c.id === claimId);
  if (!claim) return Response.json({ error: "claim not found" }, { status: 404 });

  if (accept) {
    const updated = updateClaim(claimId, {
      status: "verified",
      evidence: "Fix accepted and applied.",
    });
    return Response.json({ claim: updated, score: result.score });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 400 });
  }

  const anthropic = new Anthropic();
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `The following claim was flagged as contradicted — the agent asserted something about this diff hunk that isn't actually true.

Instruction: """${claim.instruction}"""
Agent's assertion: """${claim.assertion}"""
Why it's contradicted: """${claim.evidence ?? "no evidence found"}"""

Current diff hunk in ${claim.file} (lines ${claim.startLine}-${claim.endLine}):
"""${claim.diff}"""

Propose a corrected patch that would actually make the assertion true. Respond with ONLY a unified-diff-style code block, no prose.`,
      },
    ],
  });
  const text = msg.content.find((c) => c.type === "text")?.text ?? "";

  return Response.json({ suggestedPatch: text });
}
