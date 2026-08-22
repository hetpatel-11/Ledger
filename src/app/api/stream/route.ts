import { bus, getLatestResult } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();
  let onResult: (r: unknown) => void;
  let onClaim: (r: unknown) => void;
  let onLive: (r: unknown) => void;
  let onLiveInstruction: (r: unknown) => void;
  let heartbeat: ReturnType<typeof setInterval>;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      // The heartbeat interval was never actually cleared on cancel (the
      // `__cleanup` hook was written but nothing ever called it), so it kept
      // firing every 15s and throwing "Controller is already closed" against
      // a client that had already disconnected -- an uncaught exception that
      // could quietly destabilize the whole dev server, which is exactly the
      // kind of thing that would make live updates look unreliable.
      const send = (type: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, data })}\n\n`));
        } catch {
          closed = true;
        }
      };

      const current = getLatestResult();
      if (current) send("result-updated", current);

      onResult = (data) => send("result-updated", data);
      onClaim = (data) => send("claim-updated", data);
      onLive = (data) => send("live-claim", data);
      onLiveInstruction = (data) => send("live-instruction", data);

      bus.on("result-updated", onResult);
      bus.on("claim-updated", onClaim);
      bus.on("live-claim", onLive);
      bus.on("live-instruction", onLiveInstruction);

      heartbeat = setInterval(() => send("ping", null), 15000);
    },
    cancel() {
      closed = true;
      clearInterval(heartbeat);
      bus.off("result-updated", onResult);
      bus.off("claim-updated", onClaim);
      bus.off("live-claim", onLive);
      bus.off("live-instruction", onLiveInstruction);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
