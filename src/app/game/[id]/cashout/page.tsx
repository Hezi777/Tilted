import CashoutScreen from "@/components/cashout-screen";

export default async function CashoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CashoutScreen gameId={id} />;
}

