import { NextRequest } from "next/server";
import { appendLiveInstruction } from "@/lib/store";

/** Called by a Claude Code UserPromptSubmit hook, so a new instruction becomes
 * a real hub in the graph before its tool calls start arriving via /api/live-ingest. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const prompt: string =
    body.prompt ?? body.user_prompt ?? body.message ?? body.text ?? body.content ?? "";
  if (!prompt.trim()) return Response.json({ ok: true, ignored: true });
  appendLiveInstruction(prompt);
  return Response.json({ ok: true });
}
