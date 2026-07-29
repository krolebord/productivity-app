import { create } from "zustand";
import { persist } from "zustand/middleware";
import { type AssistantModelId, DEFAULT_ASSISTANT_MODEL, resolveAssistantModelId } from "@/agent/models";

export type RightPanel = "assistant" | "today";

interface AssistantStore {
  activePanel: RightPanel | null;
  activeConversationId: string | null;
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
  openPanel: (panel: RightPanel) => void;
  closePanel: () => void;
  togglePanel: (panel: RightPanel) => void;
  setActiveConversation: (id: string | null) => void;
  setModel: (model: AssistantModelId) => void;
  setInputDraft: (value: string) => void;
  appendToInput: (text: string) => void;
  requestComposerFocus: () => void;
}

type PersistedAssistantState = Partial<AssistantStore> & {
  open?: boolean;
};

export const useAssistantStore = create<AssistantStore>()(
  persist(
    (set) => ({
      activePanel: null,
      activeConversationId: null,
      model: DEFAULT_ASSISTANT_MODEL,
      inputDraft: "",
      composerFocusNonce: 0,
      openPanel: (panel) => set({ activePanel: panel }),
      closePanel: () => set({ activePanel: null }),
      togglePanel: (panel) => set((s) => ({ activePanel: s.activePanel === panel ? null : panel })),
      setActiveConversation: (id) => set({ activeConversationId: id }),
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
        activePanel: state.activePanel,
        activeConversationId: state.activeConversationId,
        model: state.model,
      }),
      merge: (persisted, current) => {
        const raw = (persisted ?? {}) as PersistedAssistantState;
        const { open, ...rest } = raw;
        let activePanel = current.activePanel;
        if ("activePanel" in rest) {
          activePanel = rest.activePanel ?? null;
        } else if (typeof open === "boolean") {
          activePanel = open ? "assistant" : null;
        }
        const state = { ...current, ...rest, activePanel };
        return { ...state, model: resolveAssistantModelId(state.model) };
      },
    },
  ),
);
