import SettlementScreen from "./SettlementScreen";

export default async function SettlementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SettlementScreen gameId={id} />;
}
