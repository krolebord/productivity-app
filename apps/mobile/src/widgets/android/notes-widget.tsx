"use no memo";

import type { NotesWidgetSnapshot } from "@productivity/core/widgets/snapshots";
import { FlexWidget, TextWidget } from "react-native-android-widget";
import { Header, type LayoutProps, List, Message, MoreRow, openUri, Shell, WIDE_MIN_WIDTH } from "./components";

const TITLE_ROW_HEIGHT = 30;
const PREVIEW_LINE_HEIGHT = 16;
const CARD_GAP = 6;

/**
 * Notes in the Notes tab's order, in a scrolling list: titles when narrow, cards with a preview
 * when wide. It lists the whole snapshot; "View N more" opens the Notes tab for the rest.
 */
export function NotesWidget({ info, colors, snapshot }: LayoutProps & { snapshot: Partial<NotesWidgetSnapshot> }) {
  const links = snapshot.links;
  const notes = snapshot.notes ?? [];
  const more = Math.max(0, (snapshot.total ?? 0) - notes.length);
  const wide = info.width >= WIDE_MIN_WIDTH;

  if (snapshot.state === "signedOut") {
    return (
      <Shell colors={colors} uri={links?.open}>
        <Header title="Notes" uri={links?.open} colors={colors} />
        <Message title="Sign in" detail="to see your notes" uri={links?.open} colors={colors} />
      </Shell>
    );
  }

  return (
    <Shell colors={colors} uri={links?.notes}>
      <Header title="Notes" uri={links?.notes} plusUri={links?.newNote} plusLabel="New note" colors={colors} />
      {notes.length === 0 ? (
        <Message title="No notes yet" detail="Tap + to write one" uri={links?.newNote} colors={colors} />
      ) : (
        <List>
          {notes.map((note) =>
            wide ? (
              // The gap is padding on a wrapper: each list item is drawn on its own, without margins.
              <FlexWidget key={note.id} style={{ width: "match_parent", paddingBottom: CARD_GAP }}>
                <FlexWidget
                  {...openUri(note.url)}
                  style={{
                    width: "match_parent",
                    backgroundColor: colors.muted,
                    borderRadius: 14,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                  }}
                >
                  <TextWidget
                    text={note.title}
                    maxLines={1}
                    style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}
                  />
                  {note.preview ? (
                    <TextWidget
                      text={note.preview}
                      maxLines={2}
                      style={{ fontSize: 12, color: colors.mutedForeground, lineHeight: PREVIEW_LINE_HEIGHT }}
                    />
                  ) : null}
                </FlexWidget>
              </FlexWidget>
            ) : (
              <FlexWidget
                key={note.id}
                {...openUri(note.url)}
                style={{ width: "match_parent", height: TITLE_ROW_HEIGHT, justifyContent: "center" }}
              >
                <TextWidget text={note.title} maxLines={1} style={{ fontSize: 14, color: colors.foreground }} />
              </FlexWidget>
            ),
          )}
          {more > 0 && links ? (
            <MoreRow key="more" text={`View ${more} more`} uri={links.notes} colors={colors} />
          ) : null}
        </List>
      )}
    </Shell>
  );
}
