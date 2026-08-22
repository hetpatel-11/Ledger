"use client";

import { memo } from "react";
import { Handle, Position } from "@xyflow/react";

export const GraphDotNode = memo(function GraphDotNode({
  data,
}: {
  data: { color: string; size: number; glow: boolean };
}) {
  return (
    <>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div
        style={{
          width: data.size,
          height: data.size,
          borderRadius: "50%",
          background: data.glow ? data.color : "#0a0a0a",
          border: `1.5px solid ${data.color}`,
          boxShadow: data.glow ? `0 0 8px ${data.color}80` : "none",
        }}
      />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </>
  );
});
