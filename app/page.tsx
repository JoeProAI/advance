import { LandingPage } from "@/components/landing/landing-page";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ fail?: string }>;
}) {
  const params = await searchParams;
  return <LandingPage fail={params.fail} />;
}
