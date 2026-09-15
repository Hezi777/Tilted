import { WatchScreen } from "./WatchScreen";

export default async function WatchPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  return <WatchScreen code={(await params).code} />;
}
