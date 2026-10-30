/**
 * Moves the row at `from` to index `to` in a list sorted by a numeric `order` column. Returns
 * the reordered list with updated `order` values (for painting before the query catches up)
 * and the order writes to persist.
 */
export function reorderByOrder<T extends { id: string; order: number }>(
  rows: readonly T[],
  from: number,
  to: number,
): { ordered: T[]; changes: { id: string; order: number }[] } {
  const moved = rows.slice();
  moved.splice(to, 0, moved.splice(from, 1)[0]);
  const movedId = rows[from].id;

  // Slot the moved row between its new neighbours when there is room, so a
  // single drag writes a single row instead of renumbering the whole list.
  const prevOrder = to > 0 ? moved[to - 1].order : undefined;
  const nextOrder = to < moved.length - 1 ? moved[to + 1].order : undefined;
  let movedOrder: number | null = null;
  if (typeof prevOrder === "number" && typeof nextOrder === "number") {
    const mid = (prevOrder + nextOrder) / 2;
    if (mid > prevOrder && mid < nextOrder) movedOrder = mid;
  } else if (typeof prevOrder === "number" && nextOrder === undefined) {
    movedOrder = prevOrder + 1;
  } else if (typeof nextOrder === "number" && prevOrder === undefined) {
    movedOrder = nextOrder - 1;
  }

  if (movedOrder !== null) {
    const order = movedOrder;
    return {
      ordered: moved.map((row) => (row.id === movedId ? { ...row, order } : row)),
      changes: [{ id: movedId, order }],
    };
  }

  const ordered = moved.map((row, i) => ({ ...row, order: i + 1 }));
  return { ordered, changes: ordered.map((row) => ({ id: row.id, order: row.order })) };
}
