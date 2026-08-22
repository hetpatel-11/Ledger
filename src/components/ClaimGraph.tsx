"use client";

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import {
  ReactFlow,
  Background,
  type Node,
  type Edge,
  type NodeMouseHandler,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCollide,
  forceCenter,
  forceX,
  forceY,
} from "d3-force";
import type { Claim, ClaimGraph as ClaimGraphData, ClaimGraphNode } from "@/types/claim";
import { STATUS_COLOR, ACCENT } from "@/lib/statusColor";
import { GraphDotNode } from "@/components/GraphDotNode";

const NODE_TYPES = { dot: GraphDotNode };

interface SimNode {
  id: string;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

function nodeColor(n: ClaimGraphNode): string {
  if (n.status) return STATUS_COLOR[n.status];
  if (n.kind === "instruction") return "#f5f5f5"; // white — a user instruction
  return ACCENT; // blue — activity not yet tied to a specific claim (nothing to check yet)
}

function nodeSize(n: ClaimGraphNode): number {
  if (n.kind === "instruction") return 22;
  if (n.status) return 12; // claim-bearing action/evidence — make it stand out
  return 8;
}

/** Force-directed layout: hub instructions with many linked actions naturally
 * form radial "starburst" clusters — no manual clustering logic needed. */
function computeLayout(nodes: ClaimGraphNode[], edges: ClaimGraphData["edges"]) {
  const simNodes: SimNode[] = nodes.map((n) => ({ id: n.id }));
  const simLinks = edges
    .filter((e) => e.kind !== "sequence") // sequence edges add noise to the layout; keep them for reference only
    .map((e) => ({ source: e.source, target: e.target }));

  const sim = forceSimulation(simNodes)
    .force(
      "link",
      forceLink(simLinks)
        .id((d) => (d as SimNode).id)
        .distance(34)
        .strength(0.9)
    )
    .force("charge", forceManyBody().strength(-60))
    .force("collide", forceCollide().radius(10))
    .force("center", forceCenter(0, 0))
    .force("x", forceX(0).strength(0.02))
    .force("y", forceY(0).strength(0.02))
    .stop();

  for (let i = 0; i < 260; i++) sim.tick();

  const posById = new Map(simNodes.map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]));
  return posById;
}

export function ClaimGraph({
  graph,
  claims,
  onSelect,
  highlightClaimId,
}: {
  graph: ClaimGraphData;
  claims: Claim[];
  onSelect: (claim: Claim) => void;
  highlightClaimId?: string | null;
}) {
  const [hovered, setHovered] = useState<{ node: ClaimGraphNode; x: number; y: number } | null>(
    null
  );
  const [clicked, setClicked] = useState<ClaimGraphNode | null>(null);
  const rfInstance = useRef<ReactFlowInstance | null>(null);
  const claimById = useMemo(() => new Map(claims.map((c) => [c.id, c])), [claims]);
  const clickedClaim = clicked?.claimId ? claimById.get(clicked.claimId) : undefined;

  const { nodes, edges, nodeById, positionById } = useMemo(() => {
    const positions = computeLayout(graph.nodes, graph.edges);
    const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

    const rfNodes: Node[] = graph.nodes.map((n) => {
      const pos = positions.get(n.id) ?? { x: 0, y: 0 };
      const size = nodeSize(n);
      const isHighlighted = !!highlightClaimId && n.claimId === highlightClaimId;
      return {
        id: n.id,
        type: "dot",
        data: {
          color: nodeColor(n),
          size: isHighlighted ? size + 6 : size,
          glow: n.kind === "instruction" || !!n.status,
          pulse: isHighlighted,
        },
        position: pos,
        draggable: false,
      };
    });

    const rfEdges: Edge[] = graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      animated: e.kind === "contradicts",
      style: {
        stroke: e.kind === "contradicts" ? STATUS_COLOR.contradicted : e.kind === "sequence" ? "#27272a" : ACCENT,
        strokeWidth: e.kind === "contradicts" ? 1.75 : 1,
        opacity: e.kind === "contradicts" ? 0.8 : e.kind === "sequence" ? 0.15 : 0.35,
      },
    }));

    return { nodes: rfNodes, edges: rfEdges, nodeById, positionById: positions };
  }, [graph, highlightClaimId]);

  // Pan/zoom to whatever just got flagged live, so the presenter can point straight at it.
  useEffect(() => {
    if (!highlightClaimId || !rfInstance.current) return;
    const node = graph.nodes.find((n) => n.claimId === highlightClaimId);
    if (!node) return;
    const pos = positionById.get(node.id);
    if (!pos) return;
    rfInstance.current.setCenter(pos.x, pos.y, { zoom: 1.4, duration: 600 });
  }, [highlightClaimId, graph.nodes, positionById]);

  const onNodeMouseEnter: NodeMouseHandler = useCallback(
    (evt, node) => {
      const gn = nodeById.get(node.id);
      if (!gn) return;
      setHovered({ node: gn, x: evt.clientX, y: evt.clientY });
    },
    [nodeById]
  );
  const onNodeMouseLeave = useCallback(() => setHovered(null), []);

  const onNodeClick: NodeMouseHandler = useCallback(
    (_evt, node) => {
      const gn = nodeById.get(node.id);
      if (gn) setClicked(gn);
    },
    [nodeById]
  );

  const counts = {
    instructions: graph.nodes.filter((n) => n.kind === "instruction").length,
    actions: graph.nodes.filter((n) => n.kind === "action").length,
    evidence: graph.nodes.filter((n) => n.kind === "evidence").length,
    flagged: graph.nodes.filter((n) => n.status === "contradicted").length,
  };

  return (
    <div className="relative h-[640px] border border-neutral-800 rounded-lg bg-neutral-950 overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        minZoom={0.05}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onNodeClick={onNodeClick}
        onPaneClick={() => setClicked(null)}
        onInit={(instance) => {
          rfInstance.current = instance;
        }}
      >
        <Background color="#27272a" gap={22} size={1} />
      </ReactFlow>

      <div className="absolute bottom-4 left-4 flex items-center gap-4 text-[10px] font-mono bg-neutral-950/90 px-3 py-2 rounded border border-neutral-800 pointer-events-none">
        <span className="flex items-center gap-1.5 text-neutral-300">
          <span className="h-2 w-2 rounded-full" style={{ background: "#f5f5f5" }} />
          instruction ({counts.instructions})
        </span>
        <span className="flex items-center gap-1.5 text-neutral-300">
          <span className="h-2 w-2 rounded-full" style={{ background: ACCENT }} />
          activity ({counts.actions})
        </span>
        <span className="flex items-center gap-1.5 text-neutral-300">
          <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR.verified }} />
          verified
        </span>
        <span className="flex items-center gap-1.5 text-neutral-300">
          <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR.contradicted }} />
          contradicted ({counts.flagged})
        </span>
        <span className="flex items-center gap-1.5 text-neutral-300">
          <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR.unchecked }} />
          unchecked
        </span>
        <span className="text-neutral-600">— click any node</span>
      </div>

      {hovered && !clicked && (
        <div
          className="fixed z-40 w-72 rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl pointer-events-none font-mono text-xs"
          style={{ left: hovered.x + 16, top: hovered.y + 16 }}
        >
          <div className="px-3 py-2.5 text-neutral-200 leading-relaxed">{hovered.node.label}</div>
          <div className="border-t border-neutral-800 px-3 py-2 flex items-center justify-between text-neutral-500">
            <span className="uppercase tracking-wide">{hovered.node.kind}</span>
            {hovered.node.status && (
              <span style={{ color: nodeColor(hovered.node) }} className="font-semibold">
                {hovered.node.status}
              </span>
            )}
          </div>
        </div>
      )}

      {clicked && (
        <div className="absolute top-4 right-4 z-50 w-80 rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl font-mono text-xs">
          <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-800">
            <span className="uppercase tracking-wide text-neutral-500">{clicked.kind}</span>
            <button
              onClick={() => setClicked(null)}
              className="text-neutral-500 hover:text-neutral-300"
            >
              ✕
            </button>
          </div>
          <div className="px-3 py-3 text-neutral-200 leading-relaxed whitespace-pre-wrap">
            {clickedClaim ? clickedClaim.assertion : clicked.label}
          </div>
          {clickedClaim && (
            <div className="px-3 pb-2 text-neutral-500 space-y-1">
              <div>
                status:{" "}
                <span style={{ color: nodeColor(clicked) }} className="font-semibold">
                  {clickedClaim.status}
                </span>{" "}
                · tier: {clickedClaim.tier}
              </div>
            </div>
          )}
          {clicked.status === undefined && !clickedClaim && (
            <div className="px-3 pb-3 text-neutral-500">
              plain session activity — no claim attached to this node yet.
            </div>
          )}
          {clickedClaim && (
            <button
              onClick={() => onSelect(clickedClaim)}
              className="w-full text-left px-3 py-2 border-t border-neutral-800 text-blue-400 hover:bg-neutral-800"
            >
              Open full claim (instruction, evidence, actions) →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
