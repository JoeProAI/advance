import { getPlanStore } from "@/lib/storage";
import { PacketView } from "@/components/plan/packet-view";

export const dynamic = "force-dynamic";

export default async function PacketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const plan = await getPlanStore().get(id);
  return <PacketView plan={plan} />;
}
