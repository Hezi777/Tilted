import HistoryScreen from "../HistoryScreen";

export default async function HistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <HistoryScreen gameId={(await params).id} />;
}
