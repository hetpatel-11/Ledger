"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScoreHeader } from "@/components/ScoreHeader";
import { PipelineStepper } from "@/components/PipelineStepper";
import { ClaimPanel } from "@/components/ClaimPanel";
import { ClaimLedger } from "@/components/ClaimLedger";
import { ClaimGraph } from "@/components/ClaimGraph";
import type { AnalysisResult, Claim, PipelineEvent } from "@/types/claim";

export default function Home() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [selected, setSelected] = useState<Claim | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Subscribe once for live updates (bootstrap push, hook-driven live-ingest, verify/fix mutations).
  useEffect(() => {
    const es = new EventSource("/api/stream");
    es.onmessage = async (e) => {
      const { type, data } = JSON.parse(e.data);
      if (type === "result-updated") {
        setResult(data);
        return;
      }
      if (type === "claim-updated" || type === "live-claim") {
        // The server-side store already has the full updated claims/graph — refetch
        // it rather than trying to hand-patch partial state (score alone isn't enough;
        // the graph and ledger need the new/changed node too).
        const res = await fetch("/api/claims");
        if (res.ok) setResult(await res.json());
      }
    };
    eventSourceRef.current = es;
    return () => es.close();
  }, []);

  async function runAnalyze() {
    setRunning(true);
    setEvents([]);
    setResult(null);
    const res = await fetch("/api/analyze", { method: "POST", body: JSON.stringify({}) });
    const reader = res.body?.getReader();
    if (!reader) return setRunning(false);
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        if (!part.startsWith("data: ")) continue;
        const evt = JSON.parse(part.slice(6));
        if (evt.stage === "result") {
          setResult(evt.detail);
        } else {
          setEvents((prev) => [...prev, evt]);
        }
      }
    }
    setRunning(false);
  }

  async function verifyClaim(claimId: string) {
    const res = await fetch("/api/verify", {
      method: "POST",
      body: JSON.stringify({ claimId }),
    });
    const data = await res.json();
    if (data.claim) {
      setSelected(data.claim);
      setResult((prev) =>
        prev
          ? {
              ...prev,
              score: data.score,
              claims: prev.claims.map((c) => (c.id === data.claim.id ? data.claim : c)),
            }
          : prev
      );
    }
  }

  async function suggestFix(claimId: string): Promise<string | null> {
    const res = await fetch("/api/fix", {
      method: "POST",
      body: JSON.stringify({ claimId }),
    });
    const data = await res.json();
    return data.suggestedPatch ?? null;
  }

  async function acceptFix(claimId: string) {
    const res = await fetch("/api/fix", {
      method: "POST",
      body: JSON.stringify({ claimId, accept: true }),
    });
    const data = await res.json();
    if (data.claim) {
      setSelected(data.claim);
      setResult((prev) =>
        prev
          ? {
              ...prev,
              score: data.score,
              claims: prev.claims.map((c) => (c.id === data.claim.id ? data.claim : c)),
            }
          : prev
      );
    }
  }

  return (
    <div className="flex-1 max-w-6xl w-full mx-auto p-8 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Ledger</h1>
          <p className="text-sm text-neutral-500 font-mono">
            Code review checks if the code is good. This checks if the agent did what you asked.
          </p>
        </div>
        <Button onClick={runAnalyze} disabled={running} className="bg-white text-black hover:bg-neutral-200">
          {running ? "Analyzing..." : result ? "Re-analyze" : "Analyze"}
        </Button>
      </header>

      <ScoreHeader score={result?.score ?? null} stats={result?.stats ?? null} />

      {(running || events.length > 0) && (
        <PipelineStepper events={events} active={running} />
      )}

      {!result && !running && (
        <div className="border border-dashed border-neutral-800 rounded-lg p-16 text-center text-neutral-600 font-mono">
          no session loaded — click Analyze, or push a session from Claude via MCP
        </div>
      )}

      {result && (
        <Tabs defaultValue="graph">
          <TabsList className="bg-neutral-900 border border-neutral-800">
            <TabsTrigger value="graph">Graph</TabsTrigger>
            <TabsTrigger value="claims">Claims</TabsTrigger>
          </TabsList>

          <TabsContent value="graph" className="mt-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <ClaimGraph graph={result.graph} claims={result.claims} onSelect={setSelected} />
              </div>
              <div>
                {selected ? (
                  <ClaimPanel
                    claim={selected}
                    onVerify={verifyClaim}
                    onSuggestFix={suggestFix}
                    onAcceptFix={acceptFix}
                  />
                ) : (
                  <div className="border border-neutral-800 rounded-lg bg-neutral-950 p-6 text-neutral-600 font-mono text-sm">
                    Click a colored node to inspect it. Nodes tied to a claim (green/red/grey) open the full instruction, evidence, and actions.
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="claims" className="mt-4">
            <ClaimLedger
              claims={result.claims}
              onVerify={verifyClaim}
              onSuggestFix={suggestFix}
              onAcceptFix={acceptFix}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
