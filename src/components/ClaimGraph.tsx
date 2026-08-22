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
  g.setGraph({ rankdir: "LR", nodesep: 40, ranksep: 90 });
  nodes.forEach((n) => g.setNode(n.id, { width: 200, height: 44 }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map((n) => {
    const pos = g.node(n.id);
    return {
      ...n,
      position: { x: pos.x - 100, y: pos.y - 22 },
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
    };
  });
}

export function ClaimGraph({ graph }: { graph: ClaimGraphData }) {
  const { nodes, edges } = useMemo(() => {
    const rfNodes: Node[] = graph.nodes.map((n) => {
      const color = n.status ? STATUS_COLOR[n.status] : n.kind === "instruction" ? "#a1a1aa" : "#525252";
      return {
        id: n.id,
        data: { label: n.label },
        position: { x: 0, y: 0 },
        style: {
          background: "#0a0a0a",
          border: `1.5px solid ${color}`,
          color: "#e5e5e5",
          fontFamily: "var(--font-geist-mono, monospace)",
          fontSize: 11,
          borderRadius: n.kind === "instruction" ? 999 : 8,
          padding: "6px 10px",
          width: 200,
        },
      };
    });
    const rfEdges: Edge[] = graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      animated: e.kind === "contradicts",
      style: {
        stroke: e.kind === "contradicts" ? STATUS_COLOR.contradicted : ACCENT,
        strokeWidth: 1.5,
        opacity: 0.6,
      },
    }));
    return { nodes: layout(rfNodes, rfEdges), edges: rfEdges };
  }, [graph]);

  return (
    <div className="h-[560px] border border-neutral-800 rounded-lg bg-neutral-950 overflow-hidden">
      <ReactFlow nodes={nodes} edges={edges} fitView proOptions={{ hideAttribution: true }}>
        <Background color="#262626" gap={20} />
        <Controls className="!bg-neutral-900 !border-neutral-800" />
      </ReactFlow>
    </div>
  );
}
