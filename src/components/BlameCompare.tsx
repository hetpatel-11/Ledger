"use client";

import { useState } from "react";
import type { Claim } from "@/types/claim";
import { STATUS_BG, STATUS_DOT, STATUS_LABEL } from "@/lib/statusColor";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

export function BlameCompare({
  claims,
  onSelect,
  selectedId,
}: {
  claims: Claim[];
  onSelect: (claim: Claim) => void;
  selectedId?: string;
}) {
  const [filterFile, setFilterFile] = useState<string | null>(null);
  const files = Array.from(new Set(claims.map((c) => c.file)));
  const visible = claims.filter((c) => !filterFile || c.file === filterFile);

  return (
    <div className="flex gap-4 h-[560px]">
      <div className="w-48 shrink-0 border border-neutral-800 rounded-lg bg-neutral-950 overflow-hidden">
        <div className="px-3 py-2 text-xs uppercase tracking-wide text-neutral-500 font-mono border-b border-neutral-800">
          Files
        </div>
        <ScrollArea className="h-[520px]">
          <button
            onClick={() => setFilterFile(null)}
            className={`w-full text-left px-3 py-1.5 text-sm font-mono truncate hover:bg-neutral-900 ${
              !filterFile ? "text-blue-400" : "text-neutral-400"
            }`}
          >
            all files
          </button>
          {files.map((f) => (
            <button
              key={f}
              onClick={() => setFilterFile(f)}
              className={`w-full text-left px-3 py-1.5 text-sm font-mono truncate hover:bg-neutral-900 ${
                filterFile === f ? "text-blue-400" : "text-neutral-400"
              }`}
            >
              {f}
            </button>
          ))}
        </ScrollArea>
      </div>

      <div className="flex-1 border border-neutral-800 rounded-lg bg-neutral-950 overflow-hidden flex flex-col">
        <div className="grid grid-cols-2 border-b border-neutral-800 text-xs uppercase tracking-wide text-neutral-500 font-mono">
          <div className="px-3 py-2 border-r border-neutral-800">git blame (what git tells you)</div>
          <div className="px-3 py-2">instruction fidelity (what actually happened)</div>
        </div>
        <ScrollArea className="flex-1">
          {visible.map((claim) => {
            const selected = claim.id === selectedId;
            return (
              <button
                key={claim.id}
                onClick={() => onSelect(claim)}
                className={`w-full grid grid-cols-2 text-left border-b border-neutral-900 hover:bg-neutral-900/60 ${
                  selected ? "bg-blue-500/10" : ""
                }`}
              >
                <div className="px-3 py-2 border-r border-neutral-900 font-mono text-xs text-neutral-500">
                  <span className="text-neutral-600">a1b2c3d</span>{" "}
                  <span className="text-neutral-600">Het Patel</span>{" "}
                  <span className="truncate">{claim.file}:{claim.startLine}</span>
                </div>
                <div className="px-3 py-2 font-mono text-xs flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[claim.status]}`} />
                  <Badge variant="outline" className={`${STATUS_BG[claim.status]} text-[10px] px-1.5 py-0`}>
                    {STATUS_LABEL[claim.status]}
                  </Badge>
                  <span className="truncate text-neutral-400">{claim.assertion}</span>
                </div>
              </button>
            );
          })}
          {visible.length === 0 && (
            <div className="p-6 text-center text-neutral-600 font-mono text-sm">
              No claims for this file.
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
