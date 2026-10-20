import { getPlanStore } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const plan = await getPlanStore().get(id);
  if (!plan) {
    return Response.json({ error: "Plan not found." }, { status: 404 });
  }
  return Response.json(plan);
}
