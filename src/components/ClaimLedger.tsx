"use client";

import { useState } from "react";
import type { Claim, ClaimTier } from "@/types/claim";
import { STATUS_BG, STATUS_LABEL } from "@/lib/statusColor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const TIER_EXPLANATION: Record<ClaimTier, string> = {
  deterministic:
    "Resolved from a real recorded fact in the transcript — an actual test exit code or command output. No model opinion involved.",
  structural:
    "Resolved by a literal match — the instruction or the agent's own stated plan explicitly named this file/symbol. Cheap, high-confidence, no LLM needed.",
  llm:
    "No literal match existed either way — this required a scoped LLM judgment call about whether the change is a reasonable exercise of the instruction's latitude. Labeled here as a judgment call, not a fact.",
};

const SEVERITY: Record<Claim["status"], number> = {
  contradicted: 0,
  unchecked: 1,
  verified: 2,
};

const TIER_BADGE: Record<ClaimTier, { label: string; className: string }> = {
  deterministic: { label: "⚙ no LLM · real exit code", className: "bg-neutral-800/60 text-neutral-400 border-neutral-700" },
  structural: { label: "⚙ no LLM · literal match", className: "bg-neutral-800/60 text-neutral-400 border-neutral-700" },
  llm: { label: "🤖 LLM call made", className: "bg-blue-500/10 text-blue-400 border-blue-500/30" },
};

export function ClaimLedger({
  claims,
  onVerify,
  onSuggestFix,
  onAcceptFix,
}: {
  claims: Claim[];
  onVerify: (claimId: string) => Promise<void>;
  onSuggestFix: (claimId: string) => Promise<string | null>;
  onAcceptFix: (claimId: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [suggestedPatches, setSuggestedPatches] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const [showHow, setShowHow] = useState(false);
  const sorted = [...claims].sort((a, b) => SEVERITY[a.status] - SEVERITY[b.status]);
  const counts = {
    verified: claims.filter((c) => c.status === "verified").length,
    contradicted: claims.filter((c) => c.status === "contradicted").length,
    unchecked: claims.filter((c) => c.status === "unchecked").length,
  };

  return (
    <div className="space-y-4">
      <div className="border border-neutral-800 rounded-lg bg-neutral-950 font-mono text-xs">
        <button
          onClick={() => setShowHow((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-neutral-400 hover:bg-neutral-900/60"
        >
          <span>How is this being detected?</span>
          <span>{showHow ? "▲" : "▼"}</span>
        </button>
        {showHow && (
          <div className="px-4 pb-4 space-y-3 border-t border-neutral-900 pt-3 text-neutral-400">
            <p>
              Every claim below comes from one diff hunk, checked against three things
              pulled from the real session transcript — not just the code:
            </p>
            <ol className="list-decimal list-inside space-y-1 text-neutral-500">
              <li><span className="text-neutral-300">Instruction → Plan</span> — did the agent&apos;s stated intent honor what was actually asked, given how much latitude the instruction granted.</li>
              <li><span className="text-neutral-300">Plan → Action</span> — did the agent&apos;s actual edit match what it said, moments earlier, it would do.</li>
              <li><span className="text-neutral-300">Claim → Execution</span> — did the agent&apos;s summary match what its own recorded tool calls (test runs, command output) actually show happened.</li>
            </ol>
            <p>Each hunk resolves through the cheapest tier that can honestly answer it:</p>
            <div className="space-y-1.5 pl-1">
              <div><span className="text-neutral-300">deterministic</span> — {TIER_EXPLANATION.deterministic}</div>
              <div><span className="text-neutral-300">structural</span> — {TIER_EXPLANATION.structural}</div>
              <div><span className="text-neutral-300">llm</span> — {TIER_EXPLANATION.llm}</div>
            </div>
            <p className="text-neutral-600 italic">
              A passing build only counts as &quot;verified&quot; if the change is also traceable to
              an instruction or the agent&apos;s own stated plan — compiling and being asked-for
              are checked as independent facts, not one implying the other.
            </p>
          </div>
        )}
      </div>

      <div className="flex gap-3 font-mono text-sm">
        <Badge variant="outline" className={STATUS_BG.contradicted}>
          {counts.contradicted} contradicted
        </Badge>
        <Badge variant="outline" className={STATUS_BG.unchecked}>
          {counts.unchecked} unchecked
        </Badge>
        <Badge variant="outline" className={STATUS_BG.verified}>
          {counts.verified} verified
        </Badge>
        <span className="text-neutral-600 self-center">— sorted worst-first, click a row to expand</span>
      </div>

      <div className="border border-neutral-800 rounded-lg overflow-hidden divide-y divide-neutral-900">
        {sorted.map((c) => {
          const isOpen = expanded === c.id;
          return (
            <div key={c.id} className="bg-neutral-950">
              <button
                onClick={() => setExpanded(isOpen ? null : c.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left font-mono text-xs hover:bg-neutral-900/60"
              >
                <Badge variant="outline" className={`${STATUS_BG[c.status]} shrink-0`}>
                  {STATUS_LABEL[c.status]}
                </Badge>
                <Badge variant="outline" className={`${TIER_BADGE[c.tier].className} shrink-0`}>
                  {TIER_BADGE[c.tier].label}
                </Badge>
                <span className="text-neutral-500 shrink-0">{c.file}:{c.startLine}</span>
                <span className="text-neutral-300 truncate flex-1">{c.assertion}</span>
                {c.commitLabel && (
                  <span className="text-neutral-600 shrink-0 truncate max-w-[160px]">
                    · {c.commitLabel}
                  </span>
                )}
                <span className="text-neutral-600 shrink-0">{isOpen ? "▲" : "▼"}</span>
              </button>

              {isOpen && (
                <div className="px-4 pb-4 space-y-3 font-mono text-xs border-t border-neutral-900 pt-3">
                  <div>
                    <div className="text-neutral-500 uppercase tracking-wide text-[10px] mb-1">
                      Instruction
                    </div>
                    <div className="text-neutral-300 whitespace-pre-wrap">{c.instruction}</div>
                  </div>

                  <div>
                    <div className="text-neutral-500 uppercase tracking-wide text-[10px] mb-1">
                      Evidence
                    </div>
                    <div className="text-neutral-400 whitespace-pre-wrap">
                      {c.evidence ?? <span className="text-neutral-600">no evidence found in transcript</span>}
                    </div>
                  </div>

                  <div>
                    <div className="text-neutral-500 uppercase tracking-wide text-[10px] mb-1 flex items-center gap-2">
                      How this was decided
                      <Badge variant="outline" className={TIER_BADGE[c.tier].className}>
                        {TIER_BADGE[c.tier].label}
                      </Badge>
                    </div>
                    <div className="text-neutral-500 italic">{TIER_EXPLANATION[c.tier]}</div>
                  </div>

                  {c.diff && (
                    <div>
                      <div className="text-neutral-500 uppercase tracking-wide text-[10px] mb-1">
                        Diff
                      </div>
                      <pre className="bg-black rounded-md border border-neutral-900 p-3 overflow-x-auto">
                        {c.diff.split("\n").map((line, i) => (
                          <div
                            key={i}
                            className={
                              line.startsWith("+")
                                ? "text-emerald-400"
                                : line.startsWith("-")
                                ? "text-red-400"
                                : "text-neutral-500"
                            }
                          >
                            {line || " "}
                          </div>
                        ))}
                      </pre>
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    {c.status === "unchecked" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-neutral-700"
                        disabled={busy === c.id}
                        onClick={async () => {
                          setBusy(c.id);
                          await onVerify(c.id);
                          setBusy(null);
                        }}
                      >
                        {busy === c.id ? "Verifying..." : "Verify Now"}
                      </Button>
                    )}
                    {c.status === "contradicted" && !suggestedPatches[c.id] && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-neutral-700"
                        disabled={busy === c.id}
                        onClick={async () => {
                          setBusy(c.id);
                          const patch = await onSuggestFix(c.id);
                          if (patch) setSuggestedPatches((p) => ({ ...p, [c.id]: patch }));
                          setBusy(null);
                        }}
                      >
                        {busy === c.id ? "Generating..." : "Suggest Fix"}
                      </Button>
                    )}
                  </div>

                  {suggestedPatches[c.id] && (
                    <div className="space-y-2">
                      <div className="text-neutral-500 uppercase tracking-wide text-[10px]">
                        Suggested patch
                      </div>
                      <pre className="bg-black rounded-md border border-emerald-900/50 p-3 overflow-x-auto text-emerald-400">
                        {suggestedPatches[c.id]}
                      </pre>
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-500 text-black"
                        onClick={async () => {
                          await onAcceptFix(c.id);
                          setSuggestedPatches((p) => {
                            const next = { ...p };
                            delete next[c.id];
                            return next;
                          });
                        }}
                      >
                        Accept Fix
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {sorted.length === 0 && (
          <div className="p-6 text-center text-neutral-600 font-mono text-sm">No claims.</div>
        )}
      </div>
    </div>
  );
}
