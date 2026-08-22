import { getLatestResult } from "@/lib/store";

export async function GET() {
  const result = getLatestResult();
  if (!result) {
    return Response.json({ error: "no session loaded" }, { status: 404 });
  }
  return Response.json(result);
}
