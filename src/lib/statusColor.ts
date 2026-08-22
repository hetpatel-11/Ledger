import type { ClaimStatus } from "@/types/claim";

export const STATUS_COLOR: Record<ClaimStatus, string> = {
  verified: "#22c55e", // green
  contradicted: "#ef4444", // red
  unchecked: "#71717a", // grey
};

export const STATUS_BG: Record<ClaimStatus, string> = {
  verified: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  contradicted: "bg-red-500/10 text-red-400 border-red-500/30",
  unchecked: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30",
};

export const STATUS_DOT: Record<ClaimStatus, string> = {
  verified: "bg-emerald-500",
  contradicted: "bg-red-500",
  unchecked: "bg-zinc-500",
};

export const STATUS_LABEL: Record<ClaimStatus, string> = {
  verified: "Verified",
  contradicted: "Contradicted",
  unchecked: "Unchecked",
};

export const ACCENT = "#3b82f6"; // dark blue accent for structural/selection state
