"use client";

import { useState } from "react";
import type { Claim } from "@/types/claim";
import { STATUS_BG, STATUS_LABEL } from "@/lib/statusColor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export function ClaimPanel({
  claim,
  onSuggestFix,
  onAcceptFix,
}: {
  claim: Claim;
  onSuggestFix: (claimId: string) => Promise<string | null>;
  onAcceptFix: (claimId: string) => Promise<void>;
}) {
  const [fixing, setFixing] = useState(false);
  const [suggestedPatch, setSuggestedPatch] = useState<string | null>(null);

  return (
    <div className="border border-neutral-800 rounded-lg bg-neutral-950 p-5 space-y-4 font-mono text-sm">
      <div className="flex items-center justify-between">
        <div className="text-neutral-300">
          {claim.file}
          <span className="text-neutral-600">:{claim.startLine}</span>
        </div>
        <Badge variant="outline" className={STATUS_BG[claim.status]}>
          {STATUS_LABEL[claim.status]}
        </Badge>
      </div>

      <Separator className="bg-neutral-800" />

      <div>
        <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Instruction</div>
        <div className="text-neutral-300 whitespace-pre-wrap">{claim.instruction}</div>
      </div>

      <div>
        <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Assertion</div>
        <div className="text-neutral-300 whitespace-pre-wrap">{claim.assertion}</div>
      </div>

      <div>
        <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Evidence</div>
        <div className="text-neutral-400 whitespace-pre-wrap">
          {claim.evidence ?? <span className="text-neutral-600">no evidence found in transcript</span>}
        </div>
      </div>

      <pre className="bg-black rounded-md border border-neutral-900 p-3 text-xs overflow-x-auto text-neutral-400">
        {claim.diff}
      </pre>

      <div className="flex gap-2 pt-2">
        {claim.status === "contradicted" && !suggestedPatch && (
          <Button
            size="sm"
            variant="outline"
            className="border-neutral-700"
            disabled={fixing}
            onClick={async () => {
              setFixing(true);
              const patch = await onSuggestFix(claim.id);
              setSuggestedPatch(patch);
              setFixing(false);
            }}
          >
            {fixing ? "Generating..." : "Suggest Fix"}
          </Button>
        )}
      </div>

      {suggestedPatch && (
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Suggested patch</div>
          <pre className="bg-black rounded-md border border-emerald-900/50 p-3 text-xs overflow-x-auto text-emerald-400">
            {suggestedPatch}
          </pre>
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-500 text-black"
            onClick={async () => {
              await onAcceptFix(claim.id);
              setSuggestedPatch(null);
            }}
          >
            Accept Fix
          </Button>
        </div>
      )}
    </div>
  );
}
