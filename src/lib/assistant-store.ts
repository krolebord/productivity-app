import { create } from "zustand";
import { persist } from "zustand/middleware";
import { type AssistantModelId, DEFAULT_ASSISTANT_MODEL, resolveAssistantModelId } from "@/agent/models";

interface AssistantStore {
  open: boolean;
  activeConversationId: string | null;
  /**
   * Id of a conversation we just inserted locally and switched to, before useDbQuery has
   * re-emitted with its row. Distinguishes "active id not in the snapshot yet because it's
   * still syncing in" (wait for it) from "active id points at a row that's gone" (fall back).
   * Transient — never persisted.
   */
  pendingConversationId: string | null;
  model: AssistantModelId;
  /**
   * Draft text for the message composer. Lifted into the store (rather than local
   * component state) so anything on the page can append context tokens to it — see
   * useAttachToAssistant. Not persisted: a half-written prompt shouldn't survive reloads.
   */
  inputDraft: string;
  /**
   * Bumped to request that the composer textarea take focus. The composer watches
   * this and focuses itself — lets off-screen actions (e.g. attaching context)
   * return focus to the input without holding a ref to it.
   */
  composerFocusNonce: number;
  toggle: () => void;
  setOpen: (open: boolean) => void;
  setActiveConversation: (id: string | null) => void;
  createConversation: (id: string) => void;
  setModel: (model: AssistantModelId) => void;
  setInputDraft: (value: string) => void;
  appendToInput: (text: string) => void;
  requestComposerFocus: () => void;
}

export const useAssistantStore = create<AssistantStore>()(
  persist(
    (set) => ({
      open: false,
      activeConversationId: null,
      pendingConversationId: null,
      model: DEFAULT_ASSISTANT_MODEL,
      inputDraft: "",
      composerFocusNonce: 0,
      toggle: () => set((s) => ({ open: !s.open })),
      setOpen: (open) => set({ open }),
      setActiveConversation: (id) => set({ activeConversationId: id, pendingConversationId: null }),
      createConversation: (id) => set({ activeConversationId: id, pendingConversationId: id }),
      setModel: (model) => set({ model }),
      setInputDraft: (inputDraft) => set({ inputDraft }),
      appendToInput: (text) =>
        set((s) => {
          const needsSpace = s.inputDraft.length > 0 && !/\s$/.test(s.inputDraft);
          return { inputDraft: `${s.inputDraft}${needsSpace ? " " : ""}${text} ` };
        }),
      requestComposerFocus: () => set((s) => ({ composerFocusNonce: s.composerFocusNonce + 1 })),
    }),
    {
      name: "productivity-assistant",
      partialize: (state) => ({
        open: state.open,
        activeConversationId: state.activeConversationId,
        model: state.model,
      }),
      // Guard against a persisted id that's no longer in the supported list.
      merge: (persisted, current) => {
        const state = { ...current, ...(persisted as Partial<AssistantStore>) };
        return { ...state, model: resolveAssistantModelId(state.model) };
      },
    },
  ),
);
