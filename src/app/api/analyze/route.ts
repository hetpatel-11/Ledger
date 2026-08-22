import { NextRequest } from "next/server";
import { parseTranscript, resolveLatestTranscript } from "@/lib/parseTranscript";
import { runPipeline } from "@/lib/claimPipeline";
import { setLatestResult } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const repoPath: string = body.repoPath ?? process.cwd();
  const transcriptPath: string =
    body.transcriptPath ?? resolveLatestTranscript(body.cwd ?? repoPath);
  const sessionId: string = body.sessionId ?? transcriptPath.split("/").pop() ?? "session";

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        const turns = parseTranscript(transcriptPath);
        const gen = runPipeline(repoPath, turns, sessionId);
        let next = await gen.next();
        while (!next.done) {
          send(next.value);
          next = await gen.next();
        }
        const result = next.value;
        setLatestResult(result);
        send({ stage: "result", status: "done", message: "complete", detail: result });
      } catch (e) {
        send({
          stage: "error",
          status: "done",
          message: e instanceof Error ? e.message : String(e),
        });
      } finally {
        controller.close();
      }
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
