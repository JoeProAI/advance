import { PlanLoader } from "@/components/plan/plan-loader";

export const dynamic = "force-dynamic";

export default async function PlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fail?: string }>;
}) {
  const { id } = await params;
  const { fail } = await searchParams;
  return <PlanLoader id={id} fail={fail} />;
}
