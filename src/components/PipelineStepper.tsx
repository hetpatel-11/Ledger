"use client";

import { Check, Loader2, Circle } from "lucide-react";
import type { PipelineEvent } from "@/types/claim";

const STAGES: { key: PipelineEvent["stage"]; label: string }[] = [
  { key: "parsing", label: "Parsing transcript" },
  { key: "diffing", label: "Computing git diff/blame" },
  { key: "tier1", label: "Tier 1 — deterministic (execution evidence)" },
  { key: "tier2", label: "Tier 2 — structural match (instruction/plan)" },
  { key: "tier3", label: "Tier 3 — LLM latitude judgment" },
  { key: "graph", label: "Building claim graph" },
];

export function PipelineStepper({
  events,
  active,
}: {
  events: PipelineEvent[];
  active: boolean;
}) {
  const latestByStage = new Map<string, PipelineEvent>();
  for (const e of events) latestByStage.set(e.stage, e);

  const currentIdx = STAGES.findIndex(
    (s) => latestByStage.get(s.key)?.status !== "done"
  );

  return (
    <div className="font-mono text-sm rounded-lg border border-neutral-800 bg-neutral-950 p-4 space-y-2">
      {STAGES.map((stage, i) => {
        const event = latestByStage.get(stage.key);
        const done = event?.status === "done";
        const isCurrent = active && i === currentIdx;
        return (
          <div key={stage.key} className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0">
              {done ? (
                <Check className="h-4 w-4 text-emerald-500" />
              ) : isCurrent ? (
                <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
              ) : (
                <Circle className="h-3.5 w-3.5 text-neutral-700 ml-0.5" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <span
                className={
                  done
                    ? "text-neutral-200"
                    : isCurrent
                    ? "text-blue-300"
                    : "text-neutral-600"
                }
              >
                {stage.label}
              </span>
              {event && (
                <span className="ml-2 text-neutral-500 truncate">— {event.message}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
