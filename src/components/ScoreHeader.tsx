"use client";

import { Card } from "@/components/ui/card";

export function ScoreHeader({
  score,
  stats,
}: {
  score: number | null;
  stats?: { turns: number; toolCalls: number; hunks: number } | null;
}) {
  const color =
    score === null
      ? "text-neutral-600"
      : score >= 80
      ? "text-emerald-400"
      : score >= 50
      ? "text-amber-400"
      : "text-red-400";

  return (
    <Card className="bg-neutral-950 border-neutral-800 p-6 flex items-center justify-between">
      <div>
        <div className="text-xs uppercase tracking-wide text-neutral-500 font-mono">
          Instruction-Fidelity Score
        </div>
        <div className={`text-5xl font-bold font-mono ${color}`}>
          {score === null ? "—" : `${score}%`}
        </div>
      </div>
      {stats && (
        <div className="flex gap-6 text-sm font-mono text-neutral-500">
          <div>
            <div className="text-neutral-300 text-lg">{stats.turns}</div>
            turns
          </div>
          <div>
            <div className="text-neutral-300 text-lg">{stats.toolCalls}</div>
            tool calls
          </div>
          <div>
            <div className="text-neutral-300 text-lg">{stats.hunks}</div>
            hunks
          </div>
        </div>
      )}
    </Card>
  );
}
