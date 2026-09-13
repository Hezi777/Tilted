/**
 * The cashout screen's background poll (spec 5.4 / lifecycle sync fix): a player
 * sitting in checkout has to see other players' completed counts appear as the host
 * or another guest finishes theirs, without the poll ever clobbering the row this
 * viewer is themselves mid-edit on -- a chip tapped a moment ago must not flicker
 * back to the last-saved server value while the debounce that saves it is still
 * pending.
 *
 * Pure and DOM-free so the merge itself is unit-testable without a poll loop.
 */

export interface MergeablePlayer {
  id: string;
}

/**
 * Rebuilds the player list from the freshly polled server rows, but for any player
 * id in `editingIds` keeps this client's own local row instead of the server's --
 * that id is either mid-debounce or has an in-flight save, and the server has not
 * seen its latest value yet.
 */
export function mergeCashoutPlayers<T extends MergeablePlayer>(
  serverPlayers: readonly T[],
  localPlayers: readonly T[],
  editingIds: ReadonlySet<string>,
): T[] {
  if (editingIds.size === 0) return [...serverPlayers];
  const localById = new Map(localPlayers.map((player) => [player.id, player]));
  return serverPlayers.map((serverPlayer) => {
    if (!editingIds.has(serverPlayer.id)) return serverPlayer;
    return localById.get(serverPlayer.id) ?? serverPlayer;
  });
}
