import { NextRequest } from "next/server";
import { setLatestResult } from "@/lib/store";
import type { AnalysisResult } from "@/types/claim";

/** Receives a pushed analysis result from the MCP server (a separate process from `next dev`). */
export async function POST(req: NextRequest) {
  const result = (await req.json()) as AnalysisResult;
  setLatestResult(result);
  return Response.json({ ok: true });
}
