import { describe, expect, it } from "vitest";
import { changedItemFields } from "./data/items";
import { adoptRowChanges, createItemEditorSync, markItemSaved } from "./item-editor-sync";

type Fields = { title: string; content: string; tags: string };

const row = (fields: Partial<Fields> = {}): Fields => ({ title: "Title", content: "Body", tags: "[]", ...fields });

describe("adoptRowChanges", () => {
  it("adopts a field changed elsewhere that the user hasn't edited", () => {
    const sync = createItemEditorSync(row(), row());
    const current = row({ title: "My title" });

    expect(adoptRowChanges(sync, row({ content: "Remote body" }), current)).toEqual({ content: "Remote body" });
    // Only the user's own edit is left to save.
    expect(changedItemFields({ ...current, content: "Remote body" }, sync.saved)).toEqual({ title: "My title" });
  });

  it("keeps the user's text when the same field changed elsewhere", () => {
    const sync = createItemEditorSync(row(), row());
    const current = row({ content: "My body" });

    expect(adoptRowChanges(sync, row({ content: "Remote body" }), current)).toBeNull();
    expect(changedItemFields(current, sync.saved)).toEqual({ content: "My body" });
  });

  it("ignores the echo of the editor's own save", () => {
    const sync = createItemEditorSync(row(), row());
    const current = row({ title: "My title" });
    markItemSaved(sync, current);

    expect(adoptRowChanges(sync, current, current)).toBeNull();
    expect(changedItemFields(current, sync.saved)).toEqual({});
  });

  it("adopts a saved field that was changed back elsewhere before the save's echo arrived", () => {
    const sync = createItemEditorSync(row(), row());
    const current = row({ content: "My body" });
    markItemSaved(sync, current);

    // The row never showed "My body": another device restored the old body and renamed the note.
    expect(adoptRowChanges(sync, row({ title: "Remote title" }), current)).toEqual({
      title: "Remote title",
      content: "Body",
    });
  });

  it("ignores a draft's row appearing after its first save", () => {
    const blank = row({ title: "", content: "" });
    const sync = createItemEditorSync<Fields>(undefined, blank);
    const current = row({ title: "New", content: "" });
    markItemSaved(sync, current);

    expect(adoptRowChanges(sync, current, current)).toBeNull();
  });

  it("doesn't treat tags stored in another form as an edit or a remote change", () => {
    // The row holds tags the editor serializes differently; nothing changed on either side.
    const stored = row({ tags: '[ "a" ]' });
    const sync = createItemEditorSync(stored, row({ tags: '["a"]' }));
    const current = row({ tags: '["a"]' });

    expect(adoptRowChanges(sync, { ...stored, title: "Remote title" }, current)).toEqual({ title: "Remote title" });
    expect(changedItemFields({ ...current, title: "Remote title" }, sync.saved)).toEqual({});

    // Saving another field leaves the stored tags alone, and they still aren't a remote change.
    const renamed = { ...current, title: "My title" };
    markItemSaved(sync, renamed);
    expect(adoptRowChanges(sync, { ...stored, title: "My title" }, renamed)).toBeNull();
  });
});
