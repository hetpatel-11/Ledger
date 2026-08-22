#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { parseTranscript, resolveLatestTranscript } from "../src/lib/parseTranscript.js";
import { runPipeline } from "../src/lib/claimPipeline.js";
import { setLatestResult, getLatestResult } from "../src/lib/store.js";

const APP_URL = process.env.INSTRUCTION_FIDELITY_URL ?? "http://localhost:3000";

const server = new McpServer({
  name: "instruction-fidelity",
  version: "0.1.0",
});

server.registerTool(
  "push_transcript",
  {
    title: "Push current session to the audit tool",
    description:
      "Analyzes the current (or specified) Claude Code session transcript against the repo's git diff, builds the claim graph, and pushes it live to the Instruction Fidelity dashboard.",
    inputSchema: {
      repoPath: z.string().optional().describe("Path to the git repo being reviewed. Defaults to cwd."),
      cwd: z.string().optional().describe("Project cwd used to locate the transcript file. Defaults to repoPath."),
    },
  },
  async ({ repoPath, cwd }) => {
    const resolvedRepo = repoPath ?? process.cwd();
    const transcriptPath = resolveLatestTranscript(cwd ?? resolvedRepo);
    const turns = parseTranscript(transcriptPath);
    const sessionId = transcriptPath.split("/").pop() ?? "session";

    const gen = runPipeline(resolvedRepo, turns, sessionId);
    let next = await gen.next();
    while (!next.done) next = await gen.next();
    const result = next.value;
    setLatestResult(result);

    // Also push to the running Next.js server's in-memory store via HTTP,
    // since the MCP server runs as a separate process from `next dev`.
    try {
      await fetch(`${APP_URL}/api/ingest-result`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result),
      });
    } catch {
      // dashboard may not be running yet — that's fine, MCP tools can still query it directly
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `Pushed session ${sessionId} to the audit tool. Instruction-Fidelity Score: ${result.score}%. ${result.claims.length} claims (${result.stats.tier1Resolved} deterministic, ${result.stats.tier2Resolved} structural, ${result.stats.tier3Resolved} LLM-judged).`,
        },
      ],
    };
  }
);

server.registerTool(
  "explain_claim",
  {
    title: "Explain a claim",
    description:
      "Given a file and line (or claim id), explains why a claim is verified/contradicted/unchecked, grounded only in that claim's transcript evidence — never a general guess.",
    inputSchema: {
      claimId: z.string().optional(),
      file: z.string().optional(),
      line: z.number().optional(),
    },
  },
  async ({ claimId, file, line }) => {
    const result = getLatestResult();
    if (!result) {
      return { content: [{ type: "text" as const, text: "No session loaded. Call push_transcript first." }] };
    }
    const claim = result.claims.find(
      (c) => c.id === claimId || (file && c.file === file && line !== undefined && c.startLine === line)
    );
    if (!claim) {
      return { content: [{ type: "text" as const, text: "No claim found for that file/line." }] };
    }
    return {
      content: [
        {
          type: "text" as const,
          text: `Status: ${claim.status} (tier: ${claim.tier})\nInstruction: ${claim.instruction}\nAssertion: ${claim.assertion}\nEvidence: ${claim.evidence ?? "none found in transcript"}\nUndisclosed scope: ${claim.undisclosedScope}`,
        },
      ],
    };
  }
);

server.registerTool(
  "list_unverified",
  {
    title: "List unverified or contradicted claims",
    description: "Returns every claim in the current session that is not verified — the gap list an approver should read before signing off.",
    inputSchema: {},
  },
  async () => {
    const result = getLatestResult();
    if (!result) {
      return { content: [{ type: "text" as const, text: "No session loaded. Call push_transcript first." }] };
    }
    const gaps = result.claims.filter((c) => c.status !== "verified");
    const text = gaps
      .map((c) => `- [${c.status}] ${c.file}:${c.startLine} — ${c.assertion}`)
      .join("\n");
    return {
      content: [
        {
          type: "text" as const,
          text: gaps.length ? text : "Every claim in this session is verified.",
        },
      ],
    };
  }
);

const transport = new StdioServerTransport();
server.connect(transport);
