import { planToCsv } from "@/lib/plan-request";
import { getPlanStore } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const plan = await getPlanStore().get(id);
  if (!plan || plan.status !== "ready") {
    return Response.json({ error: "Plan is not ready to export." }, { status: 404 });
  }
  const csv = planToCsv(plan);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${id}.csv"`,
    },
  });
}
