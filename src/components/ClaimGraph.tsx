"use client";

import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Position,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import type { ClaimGraph as ClaimGraphData } from "@/types/claim";
import { STATUS_COLOR, ACCENT } from "@/lib/statusColor";

function layout(nodes: Node[], edges: Edge[]) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 18, ranksep: 70 });
  nodes.forEach((n) => g.setNode(n.id, { width: 170, height: 36 }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map((n) => {
    const pos = g.node(n.id);
    return {
      ...n,
      position: { x: pos.x - 85, y: pos.y - 18 },
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
    };
  });
}

function nodeColor(n: ClaimGraphData["nodes"][number]): string {
  if (n.status) return STATUS_COLOR[n.status];
  if (n.kind === "instruction") return "#e5e5e5";
  if (n.kind === "action") return ACCENT; // plain activity, not yet tied to a claim
  return "#525252";
}

export function ClaimGraph({ graph }: { graph: ClaimGraphData }) {
  const { nodes, edges } = useMemo(() => {
    const rfNodes: Node[] = graph.nodes.map((n) => {
      const color = nodeColor(n);
      const isInstruction = n.kind === "instruction";
      return {
        id: n.id,
        data: { label: n.label },
        position: { x: 0, y: 0 },
        style: {
          background: isInstruction ? "#171717" : "#0a0a0a",
          border: `1.5px solid ${color}`,
          color: isInstruction ? "#f5f5f5" : "#d4d4d4",
          fontFamily: "var(--font-geist-mono, monospace)",
          fontSize: 10,
          fontWeight: isInstruction ? 600 : 400,
          borderRadius: isInstruction ? 999 : n.kind === "evidence" ? 4 : 8,
          padding: "5px 9px",
          width: 170,
        },
      };
    });
    const rfEdges: Edge[] = graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      animated: e.kind === "contradicts",
      style: {
        stroke: e.kind === "contradicts" ? STATUS_COLOR.contradicted : e.kind === "sequence" ? "#3f3f46" : ACCENT,
        strokeWidth: e.kind === "sequence" ? 1 : 1.5,
        opacity: e.kind === "sequence" ? 0.35 : 0.6,
      },
    }));
    return { nodes: layout(rfNodes, rfEdges), edges: rfEdges };
  }, [graph]);

  return (
    <div className="relative h-[620px] border border-neutral-800 rounded-lg bg-neutral-950 overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        minZoom={0.05}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#262626" gap={20} />
        <Controls className="!bg-neutral-900 !border-neutral-800" />
      </ReactFlow>
      <div className="absolute bottom-4 left-4 flex gap-3 text-[10px] font-mono text-neutral-500 bg-neutral-950/90 px-3 py-1.5 rounded border border-neutral-800">
        <span>{graph.nodes.filter((n) => n.kind === "instruction").length} instructions</span>
        <span>{graph.nodes.filter((n) => n.kind === "action").length} actions</span>
        <span>{graph.nodes.filter((n) => n.kind === "evidence").length} evidence</span>
      </div>
    </div>
  );
}
