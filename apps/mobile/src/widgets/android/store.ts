import { WIDGET_SNAPSHOT_VERSION, type WidgetKind, type WidgetSnapshotOf } from "@productivity/core/widgets/snapshots";
import { Directory, File, Paths } from "expo-file-system";

/**
 * Android only: the last published snapshot per kind, as `widgets/<kind>.json` in the app's
 * documents. The widget task handler redraws from it whenever Android asks (resize, the periodic
 * update, a headless start after the process died) without opening the user DB.
 */
function widgetsDirectory() {
  return new Directory(Paths.document, "widgets");
}

export async function writeWidgetSnapshot<Kind extends WidgetKind>(kind: Kind, snapshot: WidgetSnapshotOf<Kind>) {
  const directory = widgetsDirectory();
  directory.create({ intermediates: true, idempotent: true });
  // Both operations are asynchronous in SDK 58. Finish writing before replacing the snapshot,
  // and finish replacing it before the publisher requests a redraw.
  const temporary = new File(directory, `${kind}.json.tmp`);
  await temporary.write(JSON.stringify(snapshot));
  const target = new File(directory, `${kind}.json`);
  await temporary.move(target, { overwrite: true });
}

/** The last published snapshot, or null when the app never published one (or it's unreadable). */
export async function readWidgetSnapshot<Kind extends WidgetKind>(kind: Kind): Promise<WidgetSnapshotOf<Kind> | null> {
  try {
    const file = new File(widgetsDirectory(), `${kind}.json`);
    if (!file.exists) return null;
    const parsed = JSON.parse(await file.text()) as Partial<WidgetSnapshotOf<Kind>> | null;
    // A layout can only rely on fields of the version it knows; anything else draws as "open the app".
    return parsed && parsed.v === WIDGET_SNAPSHOT_VERSION && parsed.kind === kind
      ? (parsed as WidgetSnapshotOf<Kind>)
      : null;
  } catch (error) {
    console.warn(`Couldn't read the ${kind} widget snapshot`, error);
    return null;
  }
}
