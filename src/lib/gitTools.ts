import { execFileSync } from "child_process";
import type { DiffHunk } from "@/types/claim";

function git(repoPath: string, args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd: repoPath,
      encoding: "utf-8",
      maxBuffer: 1024 * 1024 * 32,
    });
  } catch (e) {
    const err = e as { stdout?: string; message?: string };
    return err.stdout ?? err.message ?? "";
  }
}

export interface BlameLine {
  file: string;
  line: number;
  commitHash: string;
  author: string;
  date: string;
  content: string;
}

/** Real `git blame`, parsed into structured lines — the "what git tells you" column. */
export function blameFile(repoPath: string, file: string): BlameLine[] {
  const out = git(repoPath, ["blame", "--line-porcelain", "--", file]);
  const lines = out.split("\n");
  const result: BlameLine[] = [];
  let current: Partial<BlameLine> = {};
  let lineNo = 0;
  for (const line of lines) {
    if (/^[0-9a-f]{40} /.test(line)) {
      if (current.content !== undefined) result.push(current as BlameLine);
      lineNo += 1;
      current = { file, line: lineNo, commitHash: line.split(" ")[0] };
    } else if (line.startsWith("author ")) {
      current.author = line.slice(7);
    } else if (line.startsWith("author-time ")) {
      const ts = parseInt(line.slice(12), 10) * 1000;
      current.date = new Date(ts).toISOString();
    } else if (line.startsWith("\t")) {
      current.content = line.slice(1);
    }
  }
  if (current.content !== undefined) result.push(current as BlameLine);
  return result;
}

// Generated/noise files: excluded so they don't drown a demo in thousands of
// lockfile hunks or blow up tier-3 LLM call counts.
const EXCLUDED_FILE_RE = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|\.next\/)/;

/**
 * Diff hunks for the session's changes. Prefers uncommitted working-tree changes
 * (the common case while actively coding); if the tree is clean — everything already
 * committed, which happens constantly in a session that commits after each task —
 * falls back to the most recent commit's diff, so there's always something real
 * to show instead of an empty "0 claims" result. (Diffing the *whole* history
 * against the empty tree was tried and rejected: on a real project it's thousands
 * of hunks, which makes tier-3 too slow for a live demo.)
 */
export function diffHunks(repoPath: string): DiffHunk[] {
  const uncommitted = git(repoPath, ["diff", "--unified=0", "HEAD"]);
  const hunks = uncommitted.trim().length > 0
    ? parseUnifiedDiff(uncommitted)
    : parseUnifiedDiff(git(repoPath, ["diff", "--unified=0", "HEAD~1", "HEAD"]));
  return hunks.filter((h) => !EXCLUDED_FILE_RE.test(h.file));
}

export function diffStat(repoPath: string): string[] {
  const out = git(repoPath, ["diff", "--name-only", "HEAD"]);
  return out.split("\n").filter(Boolean);
}

function parseUnifiedDiff(diffText: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let currentFile = "";
  const lines = diffText.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("+++ b/")) {
      currentFile = line.slice(6);
    } else if (line.startsWith("@@")) {
      const m = /@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
      const start = m ? parseInt(m[1], 10) : 0;
      const count = m && m[2] ? parseInt(m[2], 10) : 1;
      const body: string[] = [];
      i += 1;
      while (
        i < lines.length &&
        !lines[i].startsWith("@@") &&
        !lines[i].startsWith("diff --git")
      ) {
        body.push(lines[i]);
        i += 1;
      }
      hunks.push({
        file: currentFile,
        startLine: start,
        endLine: start + Math.max(count - 1, 0),
        content: body.join("\n"),
      });
      continue;
    }
    i += 1;
  }
  return hunks;
}
