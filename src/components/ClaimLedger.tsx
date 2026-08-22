"use client";

import type { Claim } from "@/types/claim";
import { STATUS_BG, STATUS_LABEL } from "@/lib/statusColor";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function ClaimLedger({
  claims,
  onSelect,
}: {
  claims: Claim[];
  onSelect: (claim: Claim) => void;
}) {
  const counts = {
    verified: claims.filter((c) => c.status === "verified").length,
    contradicted: claims.filter((c) => c.status === "contradicted").length,
    unchecked: claims.filter((c) => c.status === "unchecked").length,
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3 font-mono text-sm">
        <Badge variant="outline" className={STATUS_BG.verified}>
          {counts.verified} verified
        </Badge>
        <Badge variant="outline" className={STATUS_BG.contradicted}>
          {counts.contradicted} contradicted
        </Badge>
        <Badge variant="outline" className={STATUS_BG.unchecked}>
          {counts.unchecked} unchecked
        </Badge>
      </div>
      <div className="border border-neutral-800 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-neutral-800 hover:bg-transparent">
              <TableHead className="text-neutral-500 font-mono text-xs">File</TableHead>
              <TableHead className="text-neutral-500 font-mono text-xs">Assertion</TableHead>
              <TableHead className="text-neutral-500 font-mono text-xs">Tier</TableHead>
              <TableHead className="text-neutral-500 font-mono text-xs">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {claims.map((c) => (
              <TableRow
                key={c.id}
                className="border-neutral-900 hover:bg-neutral-900/60 cursor-pointer"
                onClick={() => onSelect(c)}
              >
                <TableCell className="font-mono text-xs text-neutral-400">
                  {c.file}:{c.startLine}
                </TableCell>
                <TableCell className="font-mono text-xs text-neutral-300 max-w-md truncate">
                  {c.assertion}
                </TableCell>
                <TableCell className="font-mono text-xs text-neutral-600">{c.tier}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={STATUS_BG[c.status]}>
                    {STATUS_LABEL[c.status]}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
