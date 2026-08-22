import { bus, getLatestResult } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();
  let onResult: (r: unknown) => void;
  let onClaim: (r: unknown) => void;
  let onLive: (r: unknown) => void;
  let onLiveInstruction: (r: unknown) => void;

  const stream = new ReadableStream({
    start(controller) {
      const send = (type: string, data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, data })}\n\n`));
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

      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: ping\n\n`));
      }, 15000);

      // @ts-expect-error attach for cleanup
      controller.__cleanup = () => clearInterval(heartbeat);
    },
    cancel() {
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
