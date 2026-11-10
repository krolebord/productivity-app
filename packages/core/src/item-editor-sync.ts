/**
 * What an open note or task editor knows about its row, so it can tell its own edits from
 * changes that arrive while it is open (another device, the assistant, calendar sync).
 *
 * Editors copy the row into local state once and save on a debounce. Without this, a save
 * wrote every field back, including ones the user never touched, and so reverted whatever
 * had changed in the row since the editor opened.
 */
export type ItemEditorSync<Fields> = {
  /** What the editor believes the row holds: what it loaded, adopted or last saved. Saves write the difference. */
  saved: Fields;
  /**
   * The row's values as last read from it or written to it; undefined while the row doesn't
   * exist yet. Apart from `saved` because a field can be stored in a form the editor would
   * write differently (tags), which is neither an edit nor a change made elsewhere.
   */
  seen: Fields | undefined;
};

/** `fields` are the editor's initial values, in the form it saves them. */
export function createItemEditorSync<Fields>(row: Fields | undefined, fields: Fields): ItemEditorSync<Fields> {
  return { saved: fields, seen: row };
}

/**
 * Call after the editor saved `fields` (and the save found or inserted the row). The fields
 * that were written count as seen too: if the row later shows an older value for one of them,
 * it was changed back elsewhere rather than not yet updated.
 */
export function markItemSaved<Fields extends object>(sync: ItemEditorSync<Fields>, fields: Fields) {
  if (sync.seen) {
    const seen = { ...sync.seen };
    for (const key of Object.keys(fields) as (keyof Fields)[]) {
      if (fields[key] !== sync.saved[key]) seen[key] = fields[key];
    }
    sync.seen = seen;
  } else {
    sync.seen = fields;
  }
  sync.saved = fields;
}

/**
 * Call when the editor's row changes, with the editor's current values. Returns the fields
 * the editor should now show: those that changed in the row and that the user hasn't edited
 * since the last save. A field the user has edited keeps their text, which the next save
 * writes over the row's. Returns null when there is nothing to adopt, e.g. for the echo of
 * the editor's own save.
 */
export function adoptRowChanges<Fields extends object>(
  sync: ItemEditorSync<Fields>,
  row: Fields,
  current: Fields,
): Partial<Fields> | null {
  const adopted: Partial<Fields> = {};
  let saved = sync.saved;
  for (const key of Object.keys(row) as (keyof Fields)[]) {
    if (sync.seen && row[key] === sync.seen[key]) continue;
    // The editor's own save coming back, or a change to the value it already holds.
    if (row[key] === saved[key]) continue;
    if (current[key] === saved[key]) adopted[key] = row[key];
    saved = { ...saved, [key]: row[key] };
  }
  sync.saved = saved;
  sync.seen = row;
  return Object.keys(adopted).length > 0 ? adopted : null;
}
