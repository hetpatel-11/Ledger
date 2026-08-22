"use client";

import { memo } from "react";
import { Handle, Position } from "@xyflow/react";

export const GraphDotNode = memo(function GraphDotNode({
  data,
}: {
  data: { color: string; size: number; glow: boolean; pulse?: boolean };
}) {
  return (
    <>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div style={{ position: "relative", width: data.size, height: data.size }}>
        {data.pulse && (
          <span
            style={{
              position: "absolute",
              inset: -8,
              borderRadius: "50%",
              border: `2px solid ${data.color}`,
              animation: "ledger-pulse 1.2s ease-out infinite",
            }}
          />
        )}
        <div
          style={{
            width: data.size,
            height: data.size,
            borderRadius: "50%",
            background: data.glow ? data.color : "#0a0a0a",
            border: `1.5px solid ${data.color}`,
            boxShadow: data.pulse
              ? `0 0 14px ${data.color}`
              : data.glow
              ? `0 0 8px ${data.color}80`
              : "none",
          }}
        />
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      {data.pulse && (
        <style>{`
          @keyframes ledger-pulse {
            0% { transform: scale(1); opacity: 1; }
            100% { transform: scale(2.2); opacity: 0; }
          }
        `}</style>
      )}
    </>
  );
});
