import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { TranscriptTurn, ToolCall } from "@/types/claim";

interface RawContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
  id?: string;
  tool_use_id?: string;
  content?: string | RawContentBlock[];
  is_error?: boolean;
}

interface RawLine {
  type?: string;
  uuid?: string;
  timestamp?: string;
  message?: {
    role?: string;
    content?: string | RawContentBlock[];
  };
}

/** Resolves the most recently modified transcript file for a given project cwd. */
export function resolveLatestTranscript(cwd: string = process.cwd()): string {
  const slug = cwd.replace(/[/.]/g, "-");
  const dir = join(homedir(), ".claude", "projects", slug);
  const files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
  if (files.length === 0) throw new Error(`No transcripts found in ${dir}`);
  const withStats = files.map((f) => ({
    f,
    mtime: statSync(join(dir, f)).mtimeMs,
  }));
  withStats.sort((a, b) => b.mtime - a.mtime);
  return join(dir, withStats[0].f);
}

function textOf(content: string | RawContentBlock[] | undefined): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  return content
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("\n");
}

/** Parses a Claude Code JSONL transcript into a flat list of turns with matched tool results. */
export function parseTranscript(filePath: string): TranscriptTurn[] {
  const raw = readFileSync(filePath, "utf-8");
  const lines = raw
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l) as RawLine;
      } catch {
        return null;
      }
    })
    .filter((l): l is RawLine => l !== null);

  // First pass: collect tool_result content keyed by tool_use_id.
  const resultsById = new Map<string, { content: string; isError: boolean }>();
  for (const line of lines) {
    if (line.type !== "user") continue;
    const content = line.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block.type === "tool_result" && block.tool_use_id) {
        const c =
          typeof block.content === "string"
            ? block.content
            : textOf(block.content as RawContentBlock[]);
        resultsById.set(block.tool_use_id, {
          content: c,
          isError: !!block.is_error,
        });
      }
    }
  }

  // Second pass: build turns.
  const turns: TranscriptTurn[] = [];
  for (const line of lines) {
    if (line.type === "user") {
      const content = line.message?.content;
      const instructionText =
        typeof content === "string" ? content : textOf(content as RawContentBlock[]);
      if (!instructionText.trim()) continue; // skip pure tool_result carrier lines
      turns.push({
        uuid: line.uuid ?? "",
        timestamp: line.timestamp ?? "",
        role: "user",
        instructionText,
        toolCalls: [],
      });
    } else if (line.type === "assistant") {
      const content = line.message?.content;
      if (!Array.isArray(content)) continue;
      const toolCalls: ToolCall[] = [];
      let precedingText = "";
      for (const block of content) {
        if (block.type === "text" && block.text) {
          precedingText = (precedingText + "\n" + block.text).trim();
        } else if (block.type === "tool_use" && block.id && block.name) {
          const res = resultsById.get(block.id);
          toolCalls.push({
            id: block.id,
            name: block.name,
            input: block.input ?? {},
            result: res?.content,
            resultIsError: res?.isError,
            timestamp: line.timestamp ?? "",
            planText: precedingText || undefined,
          });
        }
      }
      const summaryText = textOf(content);
      turns.push({
        uuid: line.uuid ?? "",
        timestamp: line.timestamp ?? "",
        role: "assistant",
        toolCalls,
        summaryText: summaryText.trim() || undefined,
      });
    }
  }
  return turns;
}

export function lastAssistantSummary(turns: TranscriptTurn[]): string {
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i];
    if (t.role === "assistant" && t.summaryText) return t.summaryText;
  }
  return "";
}

/** All file-mutating tool calls (Edit/Write) across the whole session, in order. */
export function fileMutations(turns: TranscriptTurn[]): ToolCall[] {
  const names = new Set(["Edit", "Write", "NotebookEdit"]);
  return turns.flatMap((t) => t.toolCalls.filter((tc) => names.has(tc.name)));
}

/** All test/verification-shaped tool calls (Bash), in order. */
export function bashCalls(turns: TranscriptTurn[]): ToolCall[] {
  return turns.flatMap((t) => t.toolCalls.filter((tc) => tc.name === "Bash"));
}
