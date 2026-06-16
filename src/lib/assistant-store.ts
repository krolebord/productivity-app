import { create } from "zustand";
import { persist } from "zustand/middleware";
import { type AssistantModelId, DEFAULT_ASSISTANT_MODEL, resolveAssistantModelId } from "@/agent/models";

interface AssistantStore {
  open: boolean;
  activeConversationId: string | null;
  model: AssistantModelId;
  /**
   * Draft text for the message composer. Lifted into the store (rather than local
   * component state) so anything on the page can append context tokens to it — see
   * useAttachToAssistant. Not persisted: a half-written prompt shouldn't survive reloads.
   */
  inputDraft: string;
  toggle: () => void;
  setOpen: (open: boolean) => void;
  setActiveConversation: (id: string | null) => void;
  setModel: (model: AssistantModelId) => void;
  setInputDraft: (value: string) => void;
  appendToInput: (text: string) => void;
}

export const useAssistantStore = create<AssistantStore>()(
  persist(
    (set) => ({
      open: false,
      activeConversationId: null,
      model: DEFAULT_ASSISTANT_MODEL,
      inputDraft: "",
      toggle: () => set((s) => ({ open: !s.open })),
      setOpen: (open) => set({ open }),
      setActiveConversation: (id) => set({ activeConversationId: id }),
      setModel: (model) => set({ model }),
      setInputDraft: (inputDraft) => set({ inputDraft }),
      appendToInput: (text) =>
        set((s) => {
          const needsSpace = s.inputDraft.length > 0 && !/\s$/.test(s.inputDraft);
          return { inputDraft: `${s.inputDraft}${needsSpace ? " " : ""}${text} ` };
        }),
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
