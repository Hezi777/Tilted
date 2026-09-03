import LiveGameScreen from "./LiveGameScreen";

export default async function GamePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LiveGameScreen gameId={id} />;
}
