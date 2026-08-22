import { NextRequest } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { getLatestResult, updateClaim } from "@/lib/store";

const execFileAsync = promisify(execFile);

export async function POST(req: NextRequest) {
  const { claimId, command } = await req.json();
  const result = getLatestResult();
  if (!result) return Response.json({ error: "no session loaded" }, { status: 404 });
  const claim = result.claims.find((c) => c.id === claimId);
  if (!claim) return Response.json({ error: "claim not found" }, { status: 404 });

  // Real check: run the actual verification command against the real file (defaults to
  // lint, which is a genuine deterministic pass/fail signal available in any JS/TS repo).
  const cmd = command ?? `npx eslint "${claim.file}"`;
  let status: "verified" | "contradicted" = "verified";
  let evidence: string;
  try {
    const { stdout } = await execFileAsync("sh", ["-c", cmd], {
      cwd: result.repoPath,
      timeout: 30000,
    });
    evidence = `\`${cmd}\` passed.\n${stdout.slice(0, 400)}`;
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    status = "contradicted";
    evidence = `\`${cmd}\` failed.\n${(err.stderr ?? err.stdout ?? "").slice(0, 400)}`;
  }

  const updated = updateClaim(claimId, {
    status,
    evidence,
    tier: "deterministic",
  });

  return Response.json({ claim: updated, score: result.score });
}
