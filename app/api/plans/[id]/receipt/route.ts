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
  const receipt = {
    planId: plan.id,
    act: plan.act,
    qlooMode: plan.qlooMode,
    scoring: plan.scoring,
    // The API key travels in this header on every call; it is never recorded.
    requestAuth: "X-Api-Key: [redacted]",
    receipts: plan.receipts ?? { calls: [], totals: null, invented: null, checkedEntities: null },
    stops: (plan.route?.stops ?? []).map((stop) => ({
      order: stop.order,
      date: stop.date,
      city: `${stop.city.name}, ${stop.city.region}`,
      venueEntityId: stop.venue.entityId,
      openerEntityIds: stop.openers.map((opener) => opener.entityId),
      receipt: stop.receipt ?? null,
    })),
  };
  return new Response(JSON.stringify(receipt, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${plan.id}-receipt.json"`,
    },
  });
}
